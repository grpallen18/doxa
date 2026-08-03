// Supabase Edge Function: build_viewpoints.
// Cluster Propositions via accepted agree edges into Viewpoint nodes.
// Env: NEO4J_*. Body: { dry_run?: boolean }

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { assembleComponents, type RelEdge } from "../../../../lib/debate/assembly.ts";
import { isCoreViewpointUnion } from "../../../../lib/debate/proposition-taxonomy.ts";

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

  const rows = await runCypher<{
    a: string;
    b: string;
    kind: string;
    decisionUid: string;
    topicKey: string;
  }>(
    `
    MATCH (pa:Proposition)-[r:RELATES_TO]->(pb:Proposition)
    WHERE r.kind = 'agree' AND r.decisionUid IS NOT NULL
    MATCH (dec:Decision {uid: r.decisionUid, status: 'accepted'})
    RETURN pa.uid AS a, pb.uid AS b, r.kind AS kind,
           dec.uid AS decisionUid,
           coalesce(dec.topicKey, r.kind, 'general') AS topicKey
    `
  );

  const edges: RelEdge[] = rows.map((r) => ({
    a: r.a,
    b: r.b,
    kind: r.kind,
    decisionUid: r.decisionUid,
    topicKey: r.topicKey,
  }));

  const components = assembleComponents(edges, (k) => isCoreViewpointUnion(k as "agree"));

  if (dryRun) {
    return json({ ok: true, dry_run: true, viewpoint_count: components.length });
  }

  // Drop prior ADVANCES so rebuild does not keep stale memberships.
  await runCypher(`MATCH (:Viewpoint)-[r:ADVANCES]->() DELETE r`);

  let written = 0;
  const activeUids: string[] = [];
  for (const comp of components) {
    const uid = `vp:${comp.topicKey}:${comp.memberIds.slice(0, 3).join(":")}`.slice(0, 180);
    activeUids.push(uid);
    await runCypher(
      `
      MERGE (v:Viewpoint {uid: $uid})
      SET v.topicKey = $topicKey,
          v.label = $label,
          v.summary = $summary,
          v.memberCount = $memberCount,
          v.schemaVersion = '2.2.0',
          v.updatedAt = datetime(),
          v.createdAt = coalesce(v.createdAt, datetime())
      WITH v
      UNWIND $memberIds AS mid
      MATCH (p:Proposition {uid: mid})
      MERGE (v)-[:ADVANCES]->(p)
      `,
      {
        uid,
        topicKey: comp.topicKey,
        label: `Viewpoint (${comp.memberIds.length} props)`,
        summary: `Agree cluster over ${comp.memberIds.length} propositions`,
        memberCount: comp.memberIds.length,
        memberIds: comp.memberIds,
      }
    );
    written += 1;
  }

  if (activeUids.length) {
    await runCypher(
      `
      MATCH (v:Viewpoint)
      WHERE NOT v.uid IN $activeUids
      DETACH DELETE v
      `,
      { activeUids }
    );
  } else {
    await runCypher(`MATCH (v:Viewpoint) DETACH DELETE v`);
  }

  return json({ ok: true, viewpoint_count: written });
};
