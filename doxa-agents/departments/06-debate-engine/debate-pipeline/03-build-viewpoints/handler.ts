// Supabase Edge Function: build_viewpoints.
// Issue-scoped agree clusters → stable Viewpoint nodes (opaque vp_ uids).
// Body: { dry_run?, force_full?, backfill_limit?, max_issues?, budget_ms? }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { assembleComponents, splitOversizedComponents, type RelEdge } from "../../../../lib/debate/assembly.ts";
import { isCoreViewpointUnion } from "../../../../lib/debate/proposition-taxonomy.ts";
import { assignArenaForPair } from "../../../../lib/debate/arena-assign.ts";
import { MAX_VIEWPOINT_PROPS } from "../../../../lib/debate/issue-assignment.ts";
import { assignStableUids } from "../../../../lib/debate/stable-identity.ts";

type IssueRow = { uid: string; topicKey: string };

/**
 * Edge workers are killed on CPU time, and every heal/assembly item costs
 * several Neo round trips. Both loops are therefore bounded by count *and*
 * wall clock, and report what is left so the caller can re-run.
 */
const DEFAULT_BACKFILL_LIMIT = 150;
const DEFAULT_MAX_ISSUES = 100;
const DEFAULT_BUDGET_MS = 55_000;

async function backfillIssuesFromRelations(
  limit: number,
  deadline: number
): Promise<{ healed: number; pending: number }> {
  if (limit <= 0) return { healed: 0, pending: 0 };
  const missing = await runCypher<{
    a: string;
    b: string;
    topicKey: string;
  }>(
    `
    MATCH (pa:Proposition)-[r:RELATES_TO]->(pb:Proposition)
    WHERE r.decisionUid IS NOT NULL
    MATCH (dec:Decision {uid: r.decisionUid, status: 'accepted'})
    OPTIONAL MATCH (pa)-[:IN_ISSUE]->(ia:Issue)
    OPTIONAL MATCH (pb)-[:IN_ISSUE]->(ib:Issue)
    WITH pa, pb, dec, collect(DISTINCT ia) AS issuesA, collect(DISTINCT ib) AS issuesB
    WHERE size(issuesA) = 0 OR size(issuesB) = 0
      OR any(i IN issuesA WHERE i.uid STARTS WITH 'issue:')
      OR any(i IN issuesB WHERE i.uid STARTS WITH 'issue:')
    RETURN pa.uid AS a, pb.uid AS b,
           coalesce(dec.topicKey, 'general') AS topicKey
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );
  if (!missing.length) return { healed: 0, pending: 0 };

  let healed = 0;
  for (const m of missing) {
    if (Date.now() > deadline) break;
    await assignArenaForPair({ a: m.a, b: m.b, topicKey: m.topicKey });
    healed += 1;
  }
  return { healed, pending: missing.length - healed };
}

/**
 * force_full sweeps least-recently-assembled first so repeated invocations
 * advance through the backlog. The dirty queue is FIFO on `dirtiedAt` instead:
 * an Arena whose controversy pass ran out of budget stays at the front rather
 * than being pushed behind newly dirtied Arenas.
 */
async function loadIssues(forceFull: boolean, limit: number): Promise<IssueRow[]> {
  if (forceFull) {
    return runCypher<IssueRow>(
      `
      MATCH (i:Issue)
      WITH i, coalesce(i.assembledAt.epochMillis, 0) AS lastMs
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
  const backfillLimit = clampInt(body.backfill_limit, 0, 1000, DEFAULT_BACKFILL_LIMIT);
  const maxIssues = clampInt(body.max_issues, 1, 1000, DEFAULT_MAX_ISSUES);
  const budgetMs = clampInt(body.budget_ms, 5_000, 120_000, DEFAULT_BUDGET_MS);
  const deadline = Date.now() + budgetMs;

  // Heal missing / stale legacy IN_ISSUE links (capped). Always run so classify
  // dirty traffic cannot starve cutover remigration, but keep it to a slice of
  // the budget so assembly still happens on backlogged runs.
  const backfill = await backfillIssuesFromRelations(
    backfillLimit,
    Date.now() + Math.floor(budgetMs * 0.4)
  );
  const backfilled = backfill.healed;

  let issues = await loadIssues(forceFull, maxIssues);
  if (!forceFull && issues.length === 0 && backfilled > 0) {
    issues = await loadIssues(false, maxIssues);
  }

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      issue_count: issues.length,
      force_full: forceFull,
      backfilled,
      backfill_pending: backfill.pending,
    });
  }

  let written = 0;
  let reused = 0;
  let budgetExhausted = false;
  const issueResults: Array<{ issueUid: string; viewpoints: number }> = [];

  for (const issue of issues) {
    if (Date.now() > deadline) {
      budgetExhausted = true;
      break;
    }
    const agreeRows = await runCypher<{
      a: string;
      b: string;
      kind: string;
      decisionUid: string;
    }>(
      `
      MATCH (iss:Issue {uid: $issueUid})<-[:IN_ISSUE]-(pa:Proposition)
      MATCH (iss)<-[:IN_ISSUE]-(pb:Proposition)
      MATCH (pa)-[r:RELATES_TO]->(pb)
      WHERE r.kind = 'agree' AND r.decisionUid IS NOT NULL AND pa.uid < pb.uid
      MATCH (dec:Decision {uid: r.decisionUid, status: 'accepted'})
      RETURN pa.uid AS a, pb.uid AS b, r.kind AS kind, dec.uid AS decisionUid
      `,
      { issueUid: issue.uid }
    );

    const edges: RelEdge[] = agreeRows.map((r) => ({
      a: r.a,
      b: r.b,
      kind: r.kind,
      decisionUid: r.decisionUid,
      topicKey: issue.topicKey,
    }));

    const rawComponents = assembleComponents(edges, (k) => isCoreViewpointUnion(k as "agree"));
    const components = splitOversizedComponents(rawComponents, edges, MAX_VIEWPOINT_PROPS);

    const orphanRows = await runCypher<{ propUid: string }>(
      `
      MATCH (iss:Issue {uid: $issueUid})<-[:IN_ISSUE]-(pa:Proposition)
      MATCH (iss)<-[:IN_ISSUE]-(pb:Proposition)
      MATCH (pa)-[r:RELATES_TO]->(pb)
      WHERE r.kind IN ['oppose','definitional_conflict','talking_past','assumption_conflict']
        AND r.decisionUid IS NOT NULL
      MATCH (dec:Decision {uid: r.decisionUid, status: 'accepted'})
      UNWIND [pa, pb] AS p
      RETURN DISTINCT p.uid AS propUid
      `,
      { issueUid: issue.uid }
    );

    const covered = new Set(components.flatMap((c) => c.memberIds));
    for (const row of orphanRows) {
      if (!row.propUid || covered.has(row.propUid)) continue;
      covered.add(row.propUid);
      components.push({
        topicKey: issue.topicKey,
        memberIds: [row.propUid],
        edgeDecisionUids: [],
      });
    }

    const existing = await runCypher<{ uid: string; memberIds: string[] }>(
      `
      MATCH (v:Viewpoint {issueUid: $issueUid})-[:ADVANCES]->(p:Proposition)
      RETURN v.uid AS uid, collect(DISTINCT p.uid) AS memberIds
      `,
      { issueUid: issue.uid }
    );

    // Also match legacy viewpoints without issueUid that advance props in this issue.
    const legacy = await runCypher<{ uid: string; memberIds: string[] }>(
      `
      MATCH (v:Viewpoint)-[:ADVANCES]->(p:Proposition)-[:IN_ISSUE]->(:Issue {uid: $issueUid})
      WHERE v.issueUid IS NULL OR v.issueUid = $issueUid
      WITH v, collect(DISTINCT p.uid) AS memberIds
      WHERE NOT v.uid IN $known
      RETURN v.uid AS uid, memberIds
      `,
      { issueUid: issue.uid, known: existing.map((e) => e.uid) }
    );

    const assigned = assignStableUids(
      components.map((c) => ({
        memberIds: c.memberIds,
        topicKey: issue.topicKey,
        edgeDecisionUids: c.edgeDecisionUids,
      })),
      [...existing, ...legacy],
      "vp"
    );

    // Clear ADVANCES on every viewpoint we will rewrite (includes legacy reuse
    // where issueUid was still null — issueUid-only DELETE would leave stale edges).
    const touchVpUids = [
      ...new Set([
        ...assigned.map((a) => a.uid),
        ...existing.map((e) => e.uid),
        ...legacy.map((e) => e.uid),
      ]),
    ];
    await runCypher(
      `
      UNWIND $uids AS uid
      MATCH (v:Viewpoint {uid: uid})-[r:ADVANCES]->()
      DELETE r
      `,
      { uids: touchVpUids.length ? touchVpUids : ["__none__"] }
    );

    const activeUids: string[] = [];
    for (const comp of assigned) {
      activeUids.push(comp.uid);
      if (comp.reused) reused += 1;

      const propTexts = await runCypher<{ uid: string; text: string }>(
        `
        UNWIND $ids AS id
        MATCH (p:Proposition {uid: id})
        RETURN p.uid AS uid, coalesce(p.text, p.normalizedText, '') AS text
        `,
        { ids: comp.memberIds.slice(0, 5) }
      );
      const lead = (propTexts.find((p) => p.text.trim())?.text ?? "").trim();
      const label = lead
        ? lead.length > 96
          ? `${lead.slice(0, 93)}…`
          : lead
        : `Viewpoint (${comp.memberIds.length} props)`;
      const summary = lead
        ? `Agree cluster of ${comp.memberIds.length} proposition${comp.memberIds.length === 1 ? "" : "s"} led by: ${lead.length > 140 ? `${lead.slice(0, 137)}…` : lead}`
        : `Agree cluster over ${comp.memberIds.length} propositions`;

      await runCypher(
        `
        MERGE (v:Viewpoint {uid: $uid})
        SET v.topicKey = $topicKey,
            v.issueUid = $issueUid,
            v.label = $label,
            v.summary = $summary,
            v.memberCount = $memberCount,
            v.schemaVersion = '2.3.0',
            v.updatedAt = datetime(),
            v.createdAt = coalesce(v.createdAt, datetime())
        WITH v
        UNWIND $memberIds AS mid
        MATCH (p:Proposition {uid: mid})
        MERGE (v)-[:ADVANCES]->(p)
        `,
        {
          uid: comp.uid,
          issueUid: issue.uid,
          topicKey: issue.topicKey,
          label,
          summary,
          memberCount: comp.memberIds.length,
          memberIds: comp.memberIds,
        }
      );
      written += 1;
    }

    // Retire unmatched viewpoints for this issue (including legacy matched into activeUids).
    await runCypher(
      `
      MATCH (v:Viewpoint)
      WHERE (v.issueUid = $issueUid OR
        (v.issueUid IS NULL AND EXISTS {
          MATCH (v)-[:ADVANCES]->(:Proposition)-[:IN_ISSUE]->(:Issue {uid: $issueUid})
        }))
        AND NOT v.uid IN $activeUids
      DETACH DELETE v
      `,
      { issueUid: issue.uid, activeUids: activeUids.length ? activeUids : ["__none__"] }
    );

    // If no components, delete all viewpoints for issue.
    if (activeUids.length === 0) {
      await runCypher(
        `
        MATCH (v:Viewpoint {issueUid: $issueUid})
        DETACH DELETE v
        `,
        { issueUid: issue.uid }
      );
    }

    // Round-robin marker so repeated force_full runs advance the backlog.
    await runCypher(
      `
      MATCH (i:Issue {uid: $issueUid})
      SET i.assembledAt = datetime()
      `,
      { issueUid: issue.uid }
    );

    issueResults.push({ issueUid: issue.uid, viewpoints: assigned.length });
  }

  return json({
    ok: true,
    viewpoint_count: written,
    reused,
    issues_processed: issueResults.length,
    issues_loaded: issues.length,
    issues_remaining: budgetExhausted || issues.length === maxIssues,
    budget_exhausted: budgetExhausted,
    backfilled,
    backfill_pending: backfill.pending,
    force_full: forceFull,
    issues: issueResults,
  });
};
