// Supabase Edge Function: build_controversies.
// Multi-sided Controversy from oppose edges between Viewpoint-backed propositions.
// Env: NEO4J_*. Body: { dry_run?: boolean }

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { assembleComponents, type RelEdge } from "../../../../lib/debate/assembly.ts";
import { isStrongControversyEdge } from "../../../../lib/debate/proposition-taxonomy.ts";

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

  // Oppose edges between propositions that sit in Viewpoints → link viewpoints.
  const rows = await runCypher<{
    va: string;
    vb: string;
    kind: string;
    decisionUid: string;
    topicKey: string;
  }>(
    `
    MATCH (va:Viewpoint)-[:ADVANCES]->(pa:Proposition)-[r:RELATES_TO]->(pb:Proposition)<-[:ADVANCES]-(vb:Viewpoint)
    WHERE va.uid <> vb.uid AND r.kind = 'oppose' AND r.decisionUid IS NOT NULL
    MATCH (dec:Decision {uid: r.decisionUid, status: 'accepted'})
    WITH CASE WHEN va.uid < vb.uid THEN va.uid ELSE vb.uid END AS leftUid,
         CASE WHEN va.uid < vb.uid THEN vb.uid ELSE va.uid END AS rightUid,
         r.kind AS kind,
         dec.uid AS decisionUid,
         coalesce(va.topicKey, vb.topicKey, 'general') AS topicKey
    RETURN DISTINCT leftUid AS va, rightUid AS vb, kind, decisionUid, topicKey
    `
  );

  const edges: RelEdge[] = rows.map((r) => ({
    a: r.va,
    b: r.vb,
    kind: r.kind,
    decisionUid: r.decisionUid,
    topicKey: r.topicKey,
  }));

  const components = assembleComponents(edges, (k) =>
    isStrongControversyEdge(k as "oppose")
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, controversy_count: components.length });
  }

  await runCypher(`MATCH (:Controversy)-[r:INCLUDES]->() DELETE r`);

  let written = 0;
  const activeUids: string[] = [];
  for (const comp of components) {
    const uid = `ctr:${comp.topicKey}:${comp.memberIds.length}:${comp.memberIds[0]}`.slice(
      0,
      180
    );
    activeUids.push(uid);
    await runCypher(
      `
      MERGE (c:Controversy {uid: $uid})
      SET c.topicKey = $topicKey,
          c.title = $title,
          c.summary = $summary,
          c.sidesCount = $sidesCount,
          c.schemaVersion = '2.2.0',
          c.updatedAt = datetime(),
          c.createdAt = coalesce(c.createdAt, datetime())
      WITH c
      UNWIND $memberIds AS vid
      MATCH (v:Viewpoint {uid: vid})
      MERGE (c)-[:INCLUDES]->(v)
      `,
      {
        uid,
        topicKey: comp.topicKey,
        title: `Controversy: ${comp.topicKey}`,
        summary: `Multi-sided debate with ${comp.memberIds.length} viewpoints`,
        sidesCount: comp.memberIds.length,
        memberIds: comp.memberIds,
      }
    );
    written += 1;
  }

  if (activeUids.length) {
    await runCypher(
      `
      MATCH (c:Controversy)
      WHERE NOT c.uid IN $activeUids
      DETACH DELETE c
      `,
      { activeUids }
    );
  } else {
    await runCypher(`MATCH (c:Controversy) DETACH DELETE c`);
  }

  return json({ ok: true, controversy_count: written });
};
