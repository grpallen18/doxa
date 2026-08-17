// Supabase Edge Function: build_controversies.
// Issue-scoped oppose between Viewpoints → stable Controversy nodes (opaque ctr_ uids).
// Clears Issue.dirty after successful rebuild.
// Body: { dry_run?, force_full?, issue_uids?, clear_dirty?, max_issues?, budget_ms? }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { assembleComponents, splitOversizedComponents, type RelEdge } from "../../../../lib/debate/assembly.ts";
import { isStrongControversyEdge } from "../../../../lib/debate/proposition-taxonomy.ts";
import { assignStableUids, STABLE_IDENTITY_JACCARD } from "../../../../lib/debate/stable-identity.ts";
import {
  DOCUMENT_EVIDENCE_MS_CYPHER,
  shouldForkTimeChapter,
} from "../../../../lib/debate/evidence-time.ts";
import {
  ARENA_SCHEMA_VERSION,
  MAX_CONTROVERSY_SIDES,
} from "../../../../lib/debate/issue-assignment.ts";

type IssueRow = { uid: string; topicKey: string };

type ControversySnap = {
  uid: string;
  memberIds: string[];
  latestEvidenceMs: number;
  chapterIndex: number;
  status: string | null;
};

/** Edge workers die on CPU time; cap issues per invocation and re-run. */
const DEFAULT_MAX_ISSUES = 100;
const DEFAULT_BUDGET_MS = 55_000;

async function loadIssues(
  forceFull: boolean,
  issueUids: string[] | null,
  limit: number
): Promise<IssueRow[]> {
  if (issueUids !== null) {
    if (issueUids.length === 0) return [];
    return runCypher<IssueRow>(
      `
      UNWIND $uids AS uid
      MATCH (i:Issue {uid: uid})
      RETURN i.uid AS uid, coalesce(i.topicKey, i.uid) AS topicKey
      ORDER BY i.uid
      LIMIT $limit
      `,
      { uids: issueUids, limit: neoInt(limit) }
    );
  }
  if (forceFull) {
    return runCypher<IssueRow>(
      `
      MATCH (i:Issue)
      WITH i, coalesce(i.ctrAssembledAt.epochMillis, 0) AS lastMs
      RETURN i.uid AS uid, coalesce(i.topicKey, i.uid) AS topicKey
      ORDER BY lastMs ASC, i.uid ASC
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );
  }
  return runCypher<IssueRow>(
    `
    MATCH (i:Issue)
    WHERE i.dirty = true
    WITH i, coalesce(i.dirtiedAt.epochMillis, 0) AS dirtyMs
    RETURN i.uid AS uid, coalesce(i.topicKey, i.uid) AS topicKey
    ORDER BY dirtyMs ASC, i.uid ASC
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );
}

async function latestEvidenceMsForProps(propUids: string[]): Promise<number> {
  if (!propUids.length) return 0;
  const rows = await runCypher<{ ms: number }>(
    `
    UNWIND $propUids AS pid
    MATCH (p:Proposition {uid: pid})<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (d:Document {uid: u.documentUid})
    RETURN coalesce(max(${DOCUMENT_EVIDENCE_MS_CYPHER}), 0) AS ms
    `,
    { propUids }
  );
  return Number(rows[0]?.ms) || 0;
}

async function snapshotControversies(issueUid: string): Promise<ControversySnap[]> {
  return runCypher<ControversySnap>(
    `
    MATCH (c:Controversy {issueUid: $issueUid})-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)
    WITH c, collect(DISTINCT p.uid) AS memberIds
    OPTIONAL MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (d:Document {uid: u.documentUid})
    WITH c, memberIds, coalesce(max(${DOCUMENT_EVIDENCE_MS_CYPHER}), 0) AS latestEvidenceMs
    RETURN c.uid AS uid,
           memberIds,
           latestEvidenceMs,
           coalesce(c.chapterIndex, 0) AS chapterIndex,
           c.status AS status
    `,
    { issueUid }
  );
}

async function snapshotLegacyControversies(
  issueUid: string,
  known: string[]
): Promise<ControversySnap[]> {
  return runCypher<ControversySnap>(
    `
    MATCH (c:Controversy)-[:INCLUDES]->(v:Viewpoint)-[:ADVANCES]->(p:Proposition)-[:IN_ISSUE]->(:Issue {uid: $issueUid})
    WHERE c.issueUid IS NULL OR c.issueUid = $issueUid
    WITH c, collect(DISTINCT p.uid) AS memberIds
    WHERE NOT c.uid IN $known
    OPTIONAL MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (d:Document {uid: u.documentUid})
    WITH c, memberIds, coalesce(max(${DOCUMENT_EVIDENCE_MS_CYPHER}), 0) AS latestEvidenceMs
    RETURN c.uid AS uid,
           memberIds,
           latestEvidenceMs,
           coalesce(c.chapterIndex, 0) AS chapterIndex,
           c.status AS status
    `,
    { issueUid, known: known.length ? known : ["__none__"] }
  );
}

/** Uids that already have a successor chapter pointing at them via chapterOf. */
async function chapterOfTargets(issueUid: string): Promise<string[]> {
  const rows = await runCypher<{ uid: string }>(
    `
    MATCH (c:Controversy {issueUid: $issueUid})
    WHERE c.chapterOf IS NOT NULL
    RETURN DISTINCT c.chapterOf AS uid
    `,
    { issueUid }
  );
  return rows.map((r) => r.uid).filter(Boolean);
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }
  const dryRun = Boolean(body.dry_run ?? false);
  const forceFull = Boolean(body.force_full ?? false);
  const issueUids = Array.isArray(body.issue_uids)
    ? body.issue_uids.filter((u): u is string => typeof u === "string" && u.length > 0)
    : null;
  // When orchestrator passes the viewpoints snapshot, clear dirty only for that set
  // so classify racing between steps cannot wipe Issues that skipped viewpoint rebuild.
  const clearDirty = body.clear_dirty === undefined
    ? issueUids === null
    : Boolean(body.clear_dirty);
  const maxIssues = clampInt(body.max_issues, 1, 1000, DEFAULT_MAX_ISSUES);
  const budgetMs = clampInt(body.budget_ms, 5_000, 120_000, DEFAULT_BUDGET_MS);
  const deadline = Date.now() + budgetMs;

  const issues = await loadIssues(forceFull, issueUids, maxIssues);

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      issue_count: issues.length,
      force_full: forceFull,
      clear_dirty: clearDirty,
    });
  }

  let written = 0;
  let reused = 0;
  let chaptersForked = 0;
  let budgetExhausted = false;
  const issueResults: Array<{ issueUid: string; controversies: number; chapters_forked: number }> = [];

  for (const issue of issues) {
    if (Date.now() > deadline) {
      budgetExhausted = true;
      break;
    }
    const rows = await runCypher<{
      va: string;
      vb: string;
      kind: string;
      decisionUid: string;
    }>(
      `
      MATCH (iss:Issue {uid: $issueUid})
      MATCH (va:Viewpoint)-[:ADVANCES]->(pa:Proposition)-[:IN_ISSUE]->(iss)
      MATCH (vb:Viewpoint)-[:ADVANCES]->(pb:Proposition)-[:IN_ISSUE]->(iss)
      MATCH (pa)-[r:RELATES_TO]->(pb)
      WHERE va.uid <> vb.uid
        AND r.kind = 'oppose'
        AND r.decisionUid IS NOT NULL
        AND (va.issueUid = $issueUid OR va.issueUid IS NULL)
        AND (vb.issueUid = $issueUid OR vb.issueUid IS NULL)
      MATCH (dec:Decision {uid: r.decisionUid, status: 'accepted'})
      WITH CASE WHEN va.uid < vb.uid THEN va.uid ELSE vb.uid END AS leftUid,
           CASE WHEN va.uid < vb.uid THEN vb.uid ELSE va.uid END AS rightUid,
           r.kind AS kind,
           dec.uid AS decisionUid
      RETURN DISTINCT leftUid AS va, rightUid AS vb, kind, decisionUid
      `,
      { issueUid: issue.uid }
    );

    const edges: RelEdge[] = rows.map((r) => ({
      a: r.va,
      b: r.vb,
      kind: r.kind,
      decisionUid: r.decisionUid,
      topicKey: issue.topicKey,
    }));

    const rawComponents = assembleComponents(edges, (k) =>
      isStrongControversyEdge(k as "oppose")
    );
    // A split can strand a viewpoint whose only opponents landed in an earlier
    // partition. One side is not a controversy, so it waits for the next
    // rebuild rather than being written as a single-sided cluster.
    const components = splitOversizedComponents(
      rawComponents,
      edges,
      MAX_CONTROVERSY_SIDES
    ).filter((c) => c.memberIds.length >= 2);

    // Prop closure per viewpoint component for Jaccard continuity.
    const enriched: Array<{
      memberIds: string[];
      matchIds: string[];
      topicKey: string;
      edgeDecisionUids: string[];
    }> = [];

    for (const comp of components) {
      if (Date.now() > deadline) {
        budgetExhausted = true;
        break;
      }
      const propRows = await runCypher<{ propUid: string }>(
        `
        UNWIND $vpUids AS vid
        MATCH (v:Viewpoint {uid: vid})-[:ADVANCES]->(p:Proposition)
        RETURN DISTINCT p.uid AS propUid
        `,
        { vpUids: comp.memberIds }
      );
      enriched.push({
        memberIds: comp.memberIds,
        matchIds: propRows.map((p) => p.propUid).sort(),
        topicKey: issue.topicKey,
        edgeDecisionUids: comp.edgeDecisionUids,
      });
    }
    if (budgetExhausted) break;

    // Snapshot membership + evidence times BEFORE deleting INCLUDES.
    const existing = await snapshotControversies(issue.uid);
    const legacy = await snapshotLegacyControversies(
      issue.uid,
      existing.map((e) => e.uid)
    );
    const snapByUid = new Map<string, ControversySnap>();
    for (const s of [...existing, ...legacy]) snapByUid.set(s.uid, s);

    // Freeze closed / already-superseded chapter priors — not eligible for
    // Jaccard reuse, soft-reuse, or INCLUDES rewrite.
    const frozenUids = new Set<string>(await chapterOfTargets(issue.uid));
    for (const s of [...existing, ...legacy]) {
      if ((s.status ?? "open") === "closed") frozenUids.add(s.uid);
    }

    const matchPool = [...existing, ...legacy]
      .filter((e) => !frozenUids.has(e.uid))
      .map((e) => ({ uid: e.uid, memberIds: e.memberIds }));

    const assigned = assignStableUids(enriched, matchPool, "ctr");

    // Resolve identity + chapters in one pass:
    // - Jaccard ≥ 0.5 → already reused
    // - Jaccard in (0, 0.5) + gap < 90d → soft-reuse predecessor uid (same era)
    // - Jaccard in (0, 0.5) + gap ≥ 90d → fork new ctr_ + close prior
    // - else → fresh ctr_, no chapter link
    type ChapterPlan = {
      chapterOf: string | null;
      chapterIndex: number;
      status: "open";
      closePredecessor: string | null;
    };
    const chapterPlans = new Map<string, ChapterPlan>();
    const closePredToSuccessor = new Map<string, string>();

    for (const comp of assigned) {
      if (Date.now() > deadline) {
        budgetExhausted = true;
        break;
      }
      if (comp.reused) {
        chapterPlans.set(comp.uid, {
          chapterOf: null,
          chapterIndex: 0,
          status: "open",
          closePredecessor: null,
        });
        continue;
      }

      const predUid = comp.predecessorUid ?? null;
      const predScore = Number(comp.predecessorScore) || 0;
      if (predUid && predScore > 0 && predScore < STABLE_IDENTITY_JACCARD) {
        const predSnap = snapByUid.get(predUid);
        const newMs = await latestEvidenceMsForProps(comp.matchIds);
        const fork = shouldForkTimeChapter({
          predecessorUid: predUid,
          predecessorScore: predScore,
          newEvidenceMs: newMs,
          predecessorEvidenceMs: predSnap?.latestEvidenceMs ?? 0,
        });
        if (!fork) {
          comp.uid = predUid;
          comp.reused = true;
          comp.predecessorUid = null;
          comp.predecessorScore = undefined;
          chapterPlans.set(comp.uid, {
            chapterOf: null,
            chapterIndex: 0,
            status: "open",
            closePredecessor: null,
          });
          continue;
        }
        chapterPlans.set(comp.uid, {
          chapterOf: predUid,
          chapterIndex: (predSnap?.chapterIndex ?? 0) + 1,
          status: "open",
          closePredecessor: predUid,
        });
        closePredToSuccessor.set(predUid, comp.uid);
        chaptersForked += 1;
        continue;
      }

      chapterPlans.set(comp.uid, {
        chapterOf: null,
        chapterIndex: 0,
        status: "open",
        closePredecessor: null,
      });
    }
    if (budgetExhausted) break;

    // Rewrite INCLUDES only for active writes — never strip frozen chapter priors.
    const rewriteUids = assigned.map((a) => a.uid).filter((uid) => !frozenUids.has(uid));
    await runCypher(
      `
      UNWIND $uids AS uid
      MATCH (c:Controversy {uid: uid})-[r:INCLUDES]->()
      DELETE r
      `,
      { uids: rewriteUids.length ? rewriteUids : ["__none__"] }
    );

    const activeUids: string[] = [...frozenUids];
    let issueForks = 0;
    for (const comp of assigned) {
      activeUids.push(comp.uid);
      if (comp.reused) reused += 1;
      const plan = chapterPlans.get(comp.uid)!;
      if (plan.closePredecessor) issueForks += 1;
      const topicLabel = String(issue.topicKey || "this issue").replace(/^sim:/, "related claims on ");
      const sides = comp.memberIds.length;
      const title = `Untitled controversy (${sides} side${sides === 1 ? "" : "s"})`;
      const question = "";
      const summary = `Multi-sided debate with ${sides} viewpoint${sides === 1 ? "" : "s"} on ${topicLabel}.`;

      if (comp.reused) {
        await runCypher(
          `
          MERGE (c:Controversy {uid: $uid})
          SET c.topicKey = $topicKey,
              c.issueUid = $issueUid,
              c.title = CASE WHEN c.question IS NOT NULL AND c.question <> '' THEN c.title ELSE $title END,
              c.question = coalesce(c.question, $question),
              c.summary = CASE WHEN c.question IS NOT NULL AND c.question <> '' THEN c.summary ELSE $summary END,
              c.sidesCount = $sidesCount,
              c.schemaVersion = $schemaVersion,
              c.chapterOf = coalesce(c.chapterOf, $chapterOf),
              c.chapterIndex = coalesce(c.chapterIndex, $chapterIndex),
              c.status = 'open',
              c.updatedAt = datetime(),
              c.createdAt = coalesce(c.createdAt, datetime())
          WITH c
          UNWIND $memberIds AS vid
          MATCH (v:Viewpoint {uid: vid})
          MERGE (c)-[:INCLUDES]->(v)
          `,
          {
            uid: comp.uid,
            issueUid: issue.uid,
            topicKey: issue.topicKey,
            title,
            question,
            summary,
            sidesCount: sides,
            memberIds: comp.memberIds,
            schemaVersion: ARENA_SCHEMA_VERSION,
            chapterOf: null,
            chapterIndex: 0,
          }
        );
      } else {
        await runCypher(
          `
          MERGE (c:Controversy {uid: $uid})
          SET c.topicKey = $topicKey,
              c.issueUid = $issueUid,
              c.title = $title,
              c.question = $question,
              c.summary = $summary,
              c.sidesCount = $sidesCount,
              c.schemaVersion = $schemaVersion,
              c.chapterOf = $chapterOf,
              c.chapterIndex = $chapterIndex,
              c.status = 'open',
              c.supersededBy = null,
              c.closedAt = null,
              c.updatedAt = datetime(),
              c.createdAt = coalesce(c.createdAt, datetime())
          WITH c
          UNWIND $memberIds AS vid
          MATCH (v:Viewpoint {uid: vid})
          MERGE (c)-[:INCLUDES]->(v)
          `,
          {
            uid: comp.uid,
            issueUid: issue.uid,
            topicKey: issue.topicKey,
            title,
            question,
            summary,
            sidesCount: sides,
            memberIds: comp.memberIds,
            schemaVersion: ARENA_SCHEMA_VERSION,
            chapterOf: plan.chapterOf,
            chapterIndex: plan.chapterIndex,
          }
        );
      }
      written += 1;
    }

    // Close chapter predecessors (keep INCLUDES + node; never prune).
    for (const [predUid, successorUid] of closePredToSuccessor) {
      await runCypher(
        `
        MATCH (c:Controversy {uid: $uid})
        SET c.status = 'closed',
            c.supersededBy = $supersededBy,
            c.closedAt = datetime(),
            c.updatedAt = datetime()
        `,
        { uid: predUid, supersededBy: successorUid }
      );
      activeUids.push(predUid);
      frozenUids.add(predUid);
    }

    // Prune orphans only: inactive, not closed, not a chapterOf target.
    await runCypher(
      `
      MATCH (c:Controversy)
      WHERE (c.issueUid = $issueUid OR
        (c.issueUid IS NULL AND EXISTS {
          MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)-[:IN_ISSUE]->(:Issue {uid: $issueUid})
        }))
        AND NOT c.uid IN $activeUids
        AND coalesce(c.status, 'open') <> 'closed'
        AND NOT EXISTS {
          MATCH (other:Controversy)
          WHERE other.chapterOf = c.uid
        }
      DETACH DELETE c
      `,
      { issueUid: issue.uid, activeUids: activeUids.length ? activeUids : ["__none__"] }
    );

    if (activeUids.length === 0) {
      await runCypher(
        `
        MATCH (c:Controversy {issueUid: $issueUid})
        WHERE coalesce(c.status, 'open') <> 'closed'
          AND NOT EXISTS {
            MATCH (other:Controversy)
            WHERE other.chapterOf = c.uid
          }
        DETACH DELETE c
        `,
        { issueUid: issue.uid }
      );
    }

    await runCypher(
      clearDirty
        ? `
        MATCH (i:Issue {uid: $issueUid})
        SET i.dirty = false,
            i.dirtiedAt = null,
            i.ctrAssembledAt = datetime(),
            i.updatedAt = datetime()
        `
        : `
        MATCH (i:Issue {uid: $issueUid})
        SET i.ctrAssembledAt = datetime()
        `,
      { issueUid: issue.uid }
    );

    issueResults.push({
      issueUid: issue.uid,
      controversies: assigned.length,
      chapters_forked: issueForks,
    });
  }

  return json({
    ok: true,
    controversy_count: written,
    reused,
    chapters_forked: chaptersForked,
    issues_processed: issueResults.length,
    issues_loaded: issues.length,
    issues_remaining: budgetExhausted || (issueUids === null && issues.length === maxIssues),
    budget_exhausted: budgetExhausted,
    force_full: forceFull,
    clear_dirty: clearDirty,
    jaccard_threshold: STABLE_IDENTITY_JACCARD,
    issues: issueResults,
  });
};
