// Supabase Edge Function: generate_proposition_pair_candidates.
// Blocked candidate pairs over Proposition embeddings / shared Entities.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEO4J_*.
// Body: { dry_run?: boolean, limit?: number, min_similarity?: number }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_LIMIT = 200;
const DEFAULT_MIN_SIM = 0.72;

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  if (!getNeo4jEnv()) {
    return json({ error: "Neo4j not configured" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  try {
    const dryRun = Boolean(body.dry_run ?? false);
    const limit = clampInt(body.limit, 10, 2000, DEFAULT_LIMIT);
    const minSim = typeof body.min_similarity === "number" ? body.min_similarity : DEFAULT_MIN_SIM;

    // Shared-entity blocked pairs + high cosine similarity (embedding on Proposition).
    // Cap the knn seed set — full cartesian over all embeddings OOMs Edge isolates.
    const sharedEntityPairs = await runCypher<{
      a: string;
      b: string;
      blockReason: string;
      topicKey: string;
      score: number;
    }>(
      `
      MATCH (u1:Utterance)-[:EXPRESSES]->(p1:Proposition)
      MATCH (u1)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(u2:Utterance)-[:EXPRESSES]->(p2:Proposition)
      WHERE p1.uid < p2.uid
      WITH p1, p2, e, count(*) AS sharedHits
      WHERE sharedHits >= 1
      RETURN p1.uid AS a, p2.uid AS b,
             'shared_entity' AS blockReason,
             coalesce(e.normalizedName, e.uid) AS topicKey,
             1.0 AS score
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    const seedLimit = Math.min(200, Math.max(limit, 50));
    const knnPairs = await runCypher<{
      a: string;
      b: string;
      blockReason: string;
      topicKey: string;
      score: number;
    }>(
      `
      MATCH (p1:Proposition)
      WHERE p1.embedding IS NOT NULL
      WITH p1, rand() AS r
      ORDER BY r
      LIMIT $seedLimit
      MATCH (p2:Proposition)
      WHERE p2.uid <> p1.uid AND p2.embedding IS NOT NULL
      WITH CASE WHEN p1.uid < p2.uid THEN p1 ELSE p2 END AS leftP,
           CASE WHEN p1.uid < p2.uid THEN p2 ELSE p1 END AS rightP,
           p1, p2
      WITH leftP, rightP,
           reduce(dot = 0.0, i IN range(0, size(leftP.embedding)-1) |
             dot + leftP.embedding[i] * rightP.embedding[i]) AS dot,
           sqrt(reduce(s = 0.0, x IN leftP.embedding | s + x*x)) AS n1,
           sqrt(reduce(s = 0.0, x IN rightP.embedding | s + x*x)) AS n2
      WITH leftP, rightP,
           CASE WHEN n1 > 0 AND n2 > 0 THEN dot / (n1 * n2) ELSE 0.0 END AS score
      WHERE score >= $minSim
      RETURN DISTINCT leftP.uid AS a, rightP.uid AS b,
             'embedding_knn' AS blockReason,
             'sim:' + left(leftP.uid, 12) AS topicKey,
             score
      ORDER BY score DESC
      LIMIT $limit
      `,
      { limit: neoInt(limit), minSim, seedLimit: neoInt(seedLimit) }
    );

    const seen = new Set<string>();
    const candidates: Array<{
      a: string;
      b: string;
      blockReason: string;
      topicKey: string;
      score: number;
    }> = [];
    for (const row of [...sharedEntityPairs, ...knnPairs]) {
      const key = `${row.a}|${row.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(row);
    }

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        candidate_count: candidates.length,
        sample: candidates.slice(0, 20),
      });
    }

    // Persist as CandidatePair Decision nodes (quarantined until classify).
    const written = await runCypher<{ uid: string }>(
      `
      UNWIND $rows AS row
      MERGE (pa:Proposition {uid: row.a})
      MERGE (pb:Proposition {uid: row.b})
      WITH pa, pb, row
      WHERE pa.uid IS NOT NULL AND pb.uid IS NOT NULL
      MERGE (dec:Decision {uid: row.decisionUid})
      ON CREATE SET
        dec.decisionType = 'proposition_pair_candidate',
        dec.status = 'pending',
        dec.actor = 'system',
        dec.blockReason = row.blockReason,
        dec.topicKey = row.topicKey,
        dec.score = row.score,
        dec.createdAt = datetime()
      SET dec.updatedAt = datetime(),
          dec.score = row.score,
          dec.blockReason = row.blockReason,
          dec.topicKey = row.topicKey
      MERGE (dec)-[:ABOUT]->(pa)
      MERGE (dec)-[:ABOUT]->(pb)
      RETURN dec.uid AS uid
      `,
      {
        rows: candidates.slice(0, limit).map((c) => ({
          ...c,
          decisionUid: `paircand:${c.a}:${c.b}`,
        })),
      }
    );

    return json({
      ok: true,
      dry_run: false,
      candidate_count: candidates.length,
      written: written.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate_proposition_pair_candidates]", message);
    return json({ error: message }, 500);
  }
};
