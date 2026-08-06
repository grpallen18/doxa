// Supabase Edge Function: link_derived_media_clips.
// Create Segment-backed clip MediaAssets with DERIVED_FROM → parent article asset.
// Env: NEO4J_*. Body: { dry_run?: boolean, limit?: number }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_LIMIT = 100;

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
  const limit = clampInt(body.limit, 1, 1000, DEFAULT_LIMIT);

  try {
    const rows = await runCypher<{
      segmentUid: string;
      parentUid: string;
      documentUid: string;
      charStart: number;
      charEnd: number;
    }>(
      `
      MATCH (d:Document)-[:HAS_ASSET]->(parent:MediaAsset)
      MATCH (d)-[:CONTAINS]->(seg:Segment)
      WHERE NOT EXISTS {
        MATCH (clip:MediaAsset {uid: seg.uid + ':clip'})-[:DERIVED_FROM]->(parent)
      }
      RETURN seg.uid AS segmentUid,
             parent.uid AS parentUid,
             d.uid AS documentUid,
             coalesce(seg.charStart, 0) AS charStart,
             coalesce(seg.charEnd, 0) AS charEnd
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, clip_count: rows.length });
    }

    const written = await runCypher<{ uid: string }>(
      `
      UNWIND $rows AS row
      MATCH (parent:MediaAsset {uid: row.parentUid})
      MATCH (seg:Segment {uid: row.segmentUid})
      MERGE (clip:MediaAsset {uid: row.clipUid})
      ON CREATE SET
        clip.kind = 'clip',
        clip.documentUid = row.documentUid,
        clip.charStart = row.charStart,
        clip.charEnd = row.charEnd,
        clip.schemaVersion = '3.0.0',
        clip.createdAt = datetime()
      SET clip.updatedAt = datetime(),
          clip.parentUid = row.parentUid
      MERGE (clip)-[:DERIVED_FROM]->(parent)
      MERGE (clip)-[:GROUNDED_IN]->(seg)
      RETURN clip.uid AS uid
      `,
      {
        rows: rows.map((r) => ({
          ...r,
          clipUid: `${r.segmentUid}:clip`,
        })),
      }
    );

    return json({ ok: true, clip_count: rows.length, written: written.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[link_derived_media_clips]", message);
    return json({ error: message }, 500);
  }
};
