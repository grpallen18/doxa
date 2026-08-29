// Supabase Edge Function: update_held_by_tracks.
// Temporal Agent→Proposition HELD_BY intervals from ASSERTED_BY + EXPRESSES.
// Env: NEO4J_*. Body: { dry_run?: boolean, limit?: number }

import { corsHeaders, json, clampInt, requireInternalAuth } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_LIMIT = 200;

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
  const limit = clampInt(body.limit, 1, 2000, DEFAULT_LIMIT);

  try {
    const rows = await runCypher<{
      agentUid: string;
      propositionUid: string;
      polarity: string;
      documentUid: string;
    }>(
      `
      MATCH (u:Utterance)-[:ASSERTED_BY]->(a:Agent)
      MATCH (u)-[:EXPRESSES]->(p:Proposition)
      WITH a, p, u
      ORDER BY coalesce(u.createdAt, u.updatedAt, datetime({epochMillis: 0})) DESC
      WITH a, p, head(collect(u)) AS latest
      WITH a, p,
           coalesce(latest.polarity, 'affirms') AS polarity,
           coalesce(latest.documentUid, '') AS documentUid
      WHERE NOT EXISTS {
        MATCH (a)-[h:HELD_BY {open: true}]->(p)
        WHERE h.polarity = polarity
      }
      RETURN a.uid AS agentUid,
             p.uid AS propositionUid,
             polarity,
             documentUid
      ORDER BY agentUid, propositionUid
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, pair_count: rows.length });
    }

    let opened = 0;
    let closed = 0;

    for (const row of rows) {
      const decisionUid = `held:${row.agentUid}:${row.propositionUid}`;
      const result = await runCypher<{ action: string }>(
        `
        MATCH (a:Agent {uid: $agentUid})
        MATCH (p:Proposition {uid: $propositionUid})
        OPTIONAL MATCH (a)-[existing:HELD_BY {open: true}]->(p)
        WITH a, p, existing, $polarity AS polarity, $decisionUid AS decisionUid, $documentUid AS documentUid
        FOREACH (_ IN CASE WHEN existing IS NULL THEN [1] ELSE [] END |
          MERGE (dec:Decision {uid: decisionUid})
          ON CREATE SET
            dec.decisionType = 'held_by',
            dec.status = 'accepted',
            dec.actor = 'system',
            dec.createdAt = datetime()
          SET dec.updatedAt = datetime(),
              dec.polarity = polarity,
              dec.documentUid = documentUid
          MERGE (dec)-[:ABOUT]->(a)
          MERGE (dec)-[:ABOUT]->(p)
          CREATE (a)-[h:HELD_BY]->(p)
          SET h.validFrom = datetime(),
              h.validTo = null,
              h.open = true,
              h.polarity = polarity,
              h.decisionUid = decisionUid,
              h.documentUid = documentUid
        )
        FOREACH (_ IN CASE
          WHEN existing IS NOT NULL AND existing.polarity <> polarity THEN [1]
          ELSE [] END |
          SET existing.validTo = datetime(),
              existing.open = false
          MERGE (dec2:Decision {uid: decisionUid + ':' + toString(timestamp())})
          SET dec2.decisionType = 'held_by',
              dec2.status = 'accepted',
              dec2.actor = 'system',
              dec2.polarity = polarity,
              dec2.createdAt = datetime(),
              dec2.updatedAt = datetime()
          MERGE (dec2)-[:ABOUT]->(a)
          MERGE (dec2)-[:ABOUT]->(p)
          CREATE (a)-[h2:HELD_BY]->(p)
          SET h2.validFrom = datetime(),
              h2.validTo = null,
              h2.open = true,
              h2.polarity = polarity,
              h2.decisionUid = dec2.uid,
              h2.documentUid = documentUid
        )
        RETURN CASE
          WHEN existing IS NULL THEN 'opened'
          WHEN existing.polarity <> polarity THEN 'rotated'
          ELSE 'noop'
        END AS action
        `,
        {
          agentUid: row.agentUid,
          propositionUid: row.propositionUid,
          polarity: row.polarity,
          decisionUid,
          documentUid: row.documentUid,
        }
      );
      const action = result[0]?.action;
      if (action === "opened") opened += 1;
      if (action === "rotated") {
        opened += 1;
        closed += 1;
      }
    }

    return json({ ok: true, pairs: rows.length, opened, closed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[update_held_by_tracks]", message);
    return json({ error: message }, 500);
  }
};
