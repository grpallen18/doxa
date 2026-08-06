// Supabase Edge Function: generate_evidence_check_candidates.
// Pending Decisions for Proposition ↔ Segment pairs (EXPRESSES path).
// Env: NEO4J_*. Body: { dry_run?: boolean, limit?: number }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_LIMIT = 80;

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
  const limit = clampInt(body.limit, 1, 500, DEFAULT_LIMIT);

  try {
    const rows = await runCypher<{
      propositionUid: string;
      segmentUid: string;
      documentUid: string;
    }>(
      `
      MATCH (u:Utterance)-[:EXPRESSES]->(p:Proposition)
      MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
      WHERE NOT EXISTS {
        MATCH (dec:Decision {decisionType: 'evidence_check_candidate'})-[:ABOUT]->(p)
        MATCH (dec)-[:ABOUT]->(seg)
        WHERE dec.status IN ['pending', 'consumed']
      }
      RETURN DISTINCT p.uid AS propositionUid,
             seg.uid AS segmentUid,
             coalesce(u.documentUid, '') AS documentUid
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, candidate_count: rows.length, sample: rows.slice(0, 10) });
    }

    const written = await runCypher<{ uid: string }>(
      `
      UNWIND $rows AS row
      MATCH (p:Proposition {uid: row.propositionUid})
      MATCH (seg:Segment {uid: row.segmentUid})
      MERGE (dec:Decision {uid: row.decisionUid})
      ON CREATE SET
        dec.decisionType = 'evidence_check_candidate',
        dec.status = 'pending',
        dec.actor = 'system',
        dec.documentUid = row.documentUid,
        dec.createdAt = datetime()
      SET dec.updatedAt = datetime()
      MERGE (dec)-[:ABOUT]->(p)
      MERGE (dec)-[:ABOUT]->(seg)
      RETURN dec.uid AS uid
      `,
      {
        rows: rows.map((r) => ({
          ...r,
          decisionUid: `ecand:${r.propositionUid}:${r.segmentUid}`,
        })),
      }
    );

    return json({ ok: true, candidate_count: rows.length, written: written.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate_evidence_check_candidates]", message);
    return json({ error: message }, 500);
  }
};
