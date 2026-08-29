// Supabase Edge Function: extract_citations.
// Citation source pointers (Segment) for Propositions — never a support verdict.
// Env: NEO4J_*. Body: { dry_run?: boolean, limit?: number }

import { corsHeaders, json, clampInt, requireInternalAuth } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_LIMIT = 100;

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const limit = clampInt(body.limit, 1, 1000, DEFAULT_LIMIT);

  try {
    const rows = await runCypher<{
      propositionUid: string;
      segmentUid: string;
      documentUid: string;
      surfaceForm: string;
    }>(
      `
      MATCH (u:Utterance)-[:EXPRESSES]->(p:Proposition)
      MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
      WHERE NOT EXISTS {
        MATCH (c:Citation {uid: 'cite:' + p.uid + ':' + seg.uid})
      }
      RETURN DISTINCT p.uid AS propositionUid,
             seg.uid AS segmentUid,
             coalesce(u.documentUid, '') AS documentUid,
             left(coalesce(seg.text, u.text, ''), 120) AS surfaceForm
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, citation_count: rows.length });
    }

    const written = await runCypher<{ uid: string }>(
      `
      UNWIND $rows AS row
      MATCH (p:Proposition {uid: row.propositionUid})
      MATCH (seg:Segment {uid: row.segmentUid})
      MERGE (c:Citation {uid: row.citationUid})
      ON CREATE SET
        c.surfaceForm = row.surfaceForm,
        c.documentUid = row.documentUid,
        c.segmentUid = row.segmentUid,
        c.propositionUid = row.propositionUid,
        c.schemaVersion = '3.0.0',
        c.createdAt = datetime()
      SET c.updatedAt = datetime()
      MERGE (c)-[:CITES]->(seg)
      MERGE (c)-[:ABOUT]->(p)
      MERGE (dec:Decision {uid: row.decisionUid})
      ON CREATE SET
        dec.decisionType = 'citation_link',
        dec.status = 'accepted',
        dec.actor = 'system',
        dec.createdAt = datetime()
      SET dec.updatedAt = datetime()
      MERGE (dec)-[:ABOUT]->(c)
      MERGE (c)-[:DECIDED_BY]->(dec)
      RETURN c.uid AS uid
      `,
      {
        rows: rows.map((r) => ({
          ...r,
          citationUid: `cite:${r.propositionUid}:${r.segmentUid}`,
          decisionUid: `citedec:${r.propositionUid}:${r.segmentUid}`,
        })),
      }
    );

    return json({ ok: true, citation_count: rows.length, written: written.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extract_citations]", message);
    return json({ error: message }, 500);
  }
};
