// Supabase Edge Function: graph_integrity_audit.
// Read-only invariant counts for Arenas / CQs / projections.
// Body: { dry_run?: boolean }

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";

async function count(cypher: string): Promise<number> {
  const rows = await runCypher<{ n: number }>(cypher);
  return Number(rows[0]?.n) || 0;
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const controversies = await count(`MATCH (c:Controversy) RETURN count(c) AS n`);
  const thinControversies = await count(
    `MATCH (c:Controversy) WHERE coalesce(c.sidesCount, 0) < 2 RETURN count(c) AS n`
  );
  const untitled = await count(
    `
    MATCH (c:Controversy)
    WHERE c.question IS NULL
       OR trim(coalesce(c.question, '')) = ''
       OR c.question STARTS WITH 'What are the competing views concerning'
       OR coalesce(c.title, '') STARTS WITH 'Untitled'
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
  const orphanAssessments = await count(
    `
    MATCH (a:Assessment)
    WHERE a.targetKind = 'controversy'
      AND NOT EXISTS { MATCH (a)-[:ABOUT]->(:Controversy) }
    RETURN count(a) AS n
    `
  );

  const failures = [
    thinControversies > 0 ? "thin_controversies" : null,
    legacyIssues > 0 ? "legacy_issue_uids" : null,
    orphanAssessments > 0 ? "orphan_assessments" : null,
    untitled > 0 ? "untitled_cqs" : null,
  ].filter(Boolean);

  return json({
    ok: true,
    controversies,
    thinControversies,
    untitled,
    legacyIssues,
    arenas,
    dirtyArenas,
    orphanAssessments,
    failures,
  });
};
