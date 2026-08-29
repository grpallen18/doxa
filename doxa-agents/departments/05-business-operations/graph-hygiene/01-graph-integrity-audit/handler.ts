// Supabase Edge Function: graph_integrity_audit.
// Read-only invariant counts for Question-first L3 / projections.
// Body: { dry_run?: boolean }

import { corsHeaders, json, requireInternalAuth } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";

async function count(cypher: string, params: Record<string, unknown> = {}): Promise<number> {
  const rows = await runCypher<{ n: number }>(cypher, params);
  return Number(rows[0]?.n) || 0;
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const questions = await count(`MATCH (q:Question) RETURN count(q) AS n`);
  const controversies = await count(`MATCH (c:Controversy) RETURN count(c) AS n`);
  const established = await count(
    `MATCH (c:Controversy {status: 'established'}) RETURN count(c) AS n`
  );
  const thinControversies = await count(
    `
    MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(:Question)
    OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
    WITH c, count(v) AS sides
    WHERE sides < 2
    RETURN count(c) AS n
    `
  );
  const untitled = await count(
    `
    MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q:Question)
    WHERE q.question IS NULL OR trim(coalesce(q.question, '')) = ''
    RETURN count(c) AS n
    `
  );
  const legacyIssues = await count(
    `MATCH (i:Issue) WHERE i.uid STARTS WITH 'issue:' RETURN count(i) AS n`
  );
  const arenas = await count(
    `MATCH (i:Issue) WHERE i.uid STARTS WITH 'arena:' RETURN count(i) AS n`
  );
  const dirtyArenas = await count(
    `MATCH (i:Issue) WHERE i.dirty = true RETURN count(i) AS n`
  );
  const orphanViewpoints = await count(
    `
    MATCH (v:Viewpoint)
    WHERE v.questionUid IS NULL
       OR NOT EXISTS { MATCH (q:Question {uid: v.questionUid}) }
    RETURN count(v) AS n
    `
  );
  const orphanAssessments = await count(
    `
    MATCH (a:Assessment)
    WHERE a.targetKind = 'controversy'
      AND NOT EXISTS { MATCH (a)-[:ABOUT]->(:Controversy) }
    RETURN count(a) AS n
    `
  );
  const disputesWithoutQuestion = await count(
    `
    MATCH (d:Dispute)
    WHERE NOT EXISTS { MATCH (d)-[:SURFACES_IN]->(:Question) }
    RETURN count(d) AS n
    `
  );

  const failures = [
    thinControversies > 0 ? "thin_controversies" : null,
    legacyIssues > 0 ? "legacy_issue_uids" : null,
    arenas > 0 ? "arena_issues" : null,
    dirtyArenas > 0 ? "dirty_arenas" : null,
    orphanAssessments > 0 ? "orphan_assessments" : null,
    untitled > 0 ? "untitled_questions" : null,
    orphanViewpoints > 0 ? "orphan_viewpoints" : null,
    disputesWithoutQuestion > 0 ? "disputes_without_question" : null,
  ].filter(Boolean);

  return json({
    ok: true,
    questions,
    controversies,
    established,
    thinControversies,
    untitled,
    legacyIssues,
    arenas,
    dirtyArenas,
    orphanViewpoints,
    orphanAssessments,
    disputesWithoutQuestion,
    failures,
  });
};
