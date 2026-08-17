// Supabase Edge Function: detect_disputes.
// Seed Dispute nodes for definitional / talking-past / assumption conflicts.
// Env: NEO4J_*. Body: { dry_run?: boolean }

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { DISPUTE_KINDS } from "../../../../lib/debate/proposition-taxonomy.ts";

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
    rationale: string;
  }>(
    `
    MATCH (pa:Proposition)-[r:RELATES_TO]->(pb:Proposition)
    WHERE r.kind IN $kinds AND r.decisionUid IS NOT NULL
    MATCH (dec:Decision {uid: r.decisionUid, status: 'accepted'})
    RETURN pa.uid AS a, pb.uid AS b, r.kind AS kind,
           dec.uid AS decisionUid,
           coalesce(dec.rationale, r.kind) AS rationale
    `,
    { kinds: DISPUTE_KINDS }
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, dispute_candidates: rows.length });
  }

  const activeUids: string[] = [];
  let written = 0;
  for (const row of rows) {
    const uid = `dsp:${row.kind}:${row.a}:${row.b}`.slice(0, 200);
    activeUids.push(uid);
    const disputeDecisionUid = `dspdec:${uid}`;
    await runCypher(
      `
      MATCH (pa:Proposition {uid: $a})
      MATCH (pb:Proposition {uid: $b})
      MERGE (d:Dispute {uid: $uid})
      SET d.kind = $kind,
          d.summary = $summary,
          d.schemaVersion = '2.2.0',
          d.updatedAt = datetime(),
          d.createdAt = coalesce(d.createdAt, datetime())
      MERGE (d)-[:CONCERNS]->(pa)
      MERGE (d)-[:CONCERNS]->(pb)
      WITH d
      MERGE (dec:Decision {uid: $decisionUid})
      SET dec.decisionType = 'dispute',
          dec.kind = $kind,
          dec.status = 'accepted',
          dec.actor = 'system',
          dec.sourceRelationshipDecisionUid = $sourceRelUid,
          dec.createdAt = coalesce(dec.createdAt, datetime()),
          dec.updatedAt = datetime()
      MERGE (d)-[:DECIDED_BY]->(dec)
      WITH d
      MATCH (d)-[:CONCERNS]->(p:Proposition)<-[:ADVANCES]-(:Viewpoint)<-[:INCLUDES]-(c:Controversy)
      MERGE (d)-[:SURFACES_IN]->(c)
      `,
      {
        uid,
        a: row.a,
        b: row.b,
        kind: row.kind,
        summary: String(row.rationale || row.kind).slice(0, 500),
        decisionUid: disputeDecisionUid,
        sourceRelUid: row.decisionUid || null,
      }
    );
    written += 1;
  }

  if (activeUids.length) {
    await runCypher(
      `
      MATCH (d:Dispute)
      WHERE NOT d.uid IN $activeUids
      OPTIONAL MATCH (d)-[:DECIDED_BY]->(dec:Decision {decisionType: 'dispute'})
      DETACH DELETE dec, d
      `,
      { activeUids }
    );
  } else {
    await runCypher(
      `
      MATCH (d:Dispute)
      OPTIONAL MATCH (d)-[:DECIDED_BY]->(dec:Decision {decisionType: 'dispute'})
      DETACH DELETE dec, d
      `
    );
  }

  return json({ ok: true, dispute_count: written });
};
