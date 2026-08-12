// Supabase Edge Function: build_controversies.
// Issue-scoped oppose between Viewpoints → stable Controversy nodes (opaque ctr_ uids).
// Clears Issue.dirty after successful rebuild.
// Body: { dry_run?: boolean, force_full?: boolean }

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { assembleComponents, type RelEdge } from "../../../../lib/debate/assembly.ts";
import { isStrongControversyEdge } from "../../../../lib/debate/proposition-taxonomy.ts";
import { assignStableUids } from "../../../../lib/debate/stable-identity.ts";

type IssueRow = { uid: string; topicKey: string };

async function loadIssues(
  forceFull: boolean,
  issueUids: string[] | null
): Promise<IssueRow[]> {
  if (issueUids !== null) {
    if (issueUids.length === 0) return [];
    return runCypher<IssueRow>(
      `
      UNWIND $uids AS uid
      MATCH (i:Issue {uid: uid})
      RETURN i.uid AS uid, coalesce(i.topicKey, i.uid) AS topicKey
      ORDER BY i.uid
      `,
      { uids: issueUids }
    );
  }
  if (forceFull) {
    return runCypher<IssueRow>(
      `
      MATCH (i:Issue)
      RETURN i.uid AS uid, coalesce(i.topicKey, i.uid) AS topicKey
      ORDER BY i.uid
      `
    );
  }
  return runCypher<IssueRow>(
    `
    MATCH (i:Issue)
    WHERE i.dirty = true
    RETURN i.uid AS uid, coalesce(i.topicKey, i.uid) AS topicKey
    ORDER BY i.uid
    `
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
  const issueUids = Array.isArray(body.issue_uids)
    ? body.issue_uids.filter((u): u is string => typeof u === "string" && u.length > 0)
    : null;
  // When orchestrator passes the viewpoints snapshot, clear dirty only for that set
  // so classify racing between steps cannot wipe Issues that skipped viewpoint rebuild.
  const clearDirty = body.clear_dirty === undefined
    ? issueUids === null
    : Boolean(body.clear_dirty);

  const issues = await loadIssues(forceFull, issueUids);

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
  const issueResults: Array<{ issueUid: string; controversies: number }> = [];

  for (const issue of issues) {
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

    const components = assembleComponents(edges, (k) =>
      isStrongControversyEdge(k as "oppose")
    );

    // Prop closure per viewpoint component for Jaccard continuity.
    const enriched: Array<{
      memberIds: string[];
      matchIds: string[];
      topicKey: string;
      edgeDecisionUids: string[];
    }> = [];

    for (const comp of components) {
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

    const existing = await runCypher<{ uid: string; memberIds: string[] }>(
      `
      MATCH (c:Controversy {issueUid: $issueUid})-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)
      RETURN c.uid AS uid, collect(DISTINCT p.uid) AS memberIds
      `,
      { issueUid: issue.uid }
    );

    const legacy = await runCypher<{ uid: string; memberIds: string[] }>(
      `
      MATCH (c:Controversy)-[:INCLUDES]->(v:Viewpoint)-[:ADVANCES]->(p:Proposition)-[:IN_ISSUE]->(:Issue {uid: $issueUid})
      WHERE c.issueUid IS NULL OR c.issueUid = $issueUid
      WITH c, collect(DISTINCT p.uid) AS memberIds
      WHERE NOT c.uid IN $known
      RETURN c.uid AS uid, memberIds
      `,
      { issueUid: issue.uid, known: existing.map((e) => e.uid) }
    );

    const assigned = assignStableUids(enriched, [...existing, ...legacy], "ctr");

    const touchCtrUids = [
      ...new Set([
        ...assigned.map((a) => a.uid),
        ...existing.map((e) => e.uid),
        ...legacy.map((e) => e.uid),
      ]),
    ];
    await runCypher(
      `
      UNWIND $uids AS uid
      MATCH (c:Controversy {uid: uid})-[r:INCLUDES]->()
      DELETE r
      `,
      { uids: touchCtrUids.length ? touchCtrUids : ["__none__"] }
    );

    const activeUids: string[] = [];
    for (const comp of assigned) {
      activeUids.push(comp.uid);
      if (comp.reused) reused += 1;
      const topicLabel = String(issue.topicKey || "this issue").replace(/^sim:/, "related claims on ");
      const question = `What are the competing views concerning ${topicLabel}?`;
      const title = question;
      const summary = `Multi-sided debate with ${comp.memberIds.length} viewpoint${comp.memberIds.length === 1 ? "" : "s"} on ${topicLabel}.`;
      await runCypher(
        `
        MERGE (c:Controversy {uid: $uid})
        SET c.topicKey = $topicKey,
            c.issueUid = $issueUid,
            c.title = $title,
            c.question = $question,
            c.summary = $summary,
            c.sidesCount = $sidesCount,
            c.schemaVersion = '2.3.0',
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
          sidesCount: comp.memberIds.length,
          memberIds: comp.memberIds,
        }
      );
      written += 1;
    }

    await runCypher(
      `
      MATCH (c:Controversy)
      WHERE (c.issueUid = $issueUid OR
        (c.issueUid IS NULL AND EXISTS {
          MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)-[:IN_ISSUE]->(:Issue {uid: $issueUid})
        }))
        AND NOT c.uid IN $activeUids
      DETACH DELETE c
      `,
      { issueUid: issue.uid, activeUids: activeUids.length ? activeUids : ["__none__"] }
    );

    if (activeUids.length === 0) {
      await runCypher(
        `
        MATCH (c:Controversy {issueUid: $issueUid})
        DETACH DELETE c
        `,
        { issueUid: issue.uid }
      );
    }

    if (clearDirty) {
      await runCypher(
        `
        MATCH (i:Issue {uid: $issueUid})
        SET i.dirty = false, i.updatedAt = datetime()
        `,
        { issueUid: issue.uid }
      );
    }

    issueResults.push({ issueUid: issue.uid, controversies: assigned.length });
  }

  return json({
    ok: true,
    controversy_count: written,
    reused,
    issues_processed: issues.length,
    force_full: forceFull,
    clear_dirty: clearDirty,
    issues: issueResults,
  });
};
