// Supabase Edge Function: generate_proposition_pair_candidates.
// Novel candidate pairs over Proposition embeddings / shared Entities.
// Skips pairs that already have a proposition_pair_candidate Decision so
// hourly runs keep discovering new work on large graphs.
// Also MERGEs Issue buckets and (Proposition)-[:IN_ISSUE]->(Issue).
//
// Memory: shared-entity and knn queries are hard-capped (per-entity CALL
// subqueries + neighbor samples). Never cartesian all Proposition embeddings.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEO4J_*.
// Body: { dry_run?: boolean, limit?: number, min_similarity?: number }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { resolveIssueUid } from "../../../../lib/debate/issue-assignment.ts";

const DEFAULT_LIMIT = 200;
const DEFAULT_MIN_SIM = 0.72;
/** Props kept per sampled entity (CALL subquery LIMIT — not collect-all-then-slice). */
const PROPS_PER_ENTITY = 8;
/** Max entities sampled per run (Aura txn memory). */
const MAX_ENTITY_SAMPLE = 40;
/** Seed propositions for knn. */
const MAX_KNN_SEEDS = 25;
/** Random neighbors compared per seed (avoids full embedding cartesian). */
const KNN_NEIGHBOR_SAMPLE = 40;

type PairRow = {
  a: string;
  b: string;
  blockReason: string;
  topicKey: string;
  score: number;
  entityUid?: string | null;
};

function pairKey(a: string, b: string): string {
  return `${a}|${b}`;
}

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

    const sharedQuota = Math.max(1, Math.floor(limit / 2));
    const knnQuota = Math.max(1, limit - sharedQuota);
    const entitySample = Math.min(MAX_ENTITY_SAMPLE, Math.max(15, Math.floor(limit / 2)));
    const seedLimit = Math.min(MAX_KNN_SEEDS, Math.max(10, Math.floor(limit / 3)));

    // Shared-entity pairs: sample few entities; limit props inside CALL (no full collect).
    const sharedEntityPairs = await runCypher<PairRow>(
      `
      MATCH (e:Entity)
      WHERE EXISTS {
        MATCH (e)<-[:MENTIONS]-(:Utterance)-[:EXPRESSES]->(:Proposition)
      }
      WITH e, rand() AS r
      ORDER BY r
      LIMIT $entitySample
      CALL {
        WITH e
        MATCH (e)<-[:MENTIONS]-(:Utterance)-[:EXPRESSES]->(p:Proposition)
        WITH p, rand() AS rp
        ORDER BY rp
        LIMIT $propsPerEntity
        RETURN collect(p) AS props
      }
      WITH e, props
      WHERE size(props) >= 2
      UNWIND props AS p1
      UNWIND props AS p2
      WITH e, p1, p2
      WHERE p1.uid < p2.uid
        AND NOT EXISTS {
          MATCH (d:Decision {uid: 'paircand:' + p1.uid + ':' + p2.uid})
          WHERE d.status IN ['pending', 'consumed', 'quarantined']
        }
      WITH p1, p2, e, rand() AS r
      ORDER BY r
      RETURN p1.uid AS a, p2.uid AS b,
             'shared_entity' AS blockReason,
             coalesce(e.normalizedName, e.uid) AS topicKey,
             e.uid AS entityUid,
             1.0 AS score
      LIMIT $sharedQuota
      `,
      {
        entitySample: neoInt(entitySample),
        sharedQuota: neoInt(sharedQuota),
        propsPerEntity: neoInt(PROPS_PER_ENTITY),
      }
    );

    // Knn: each seed vs a small random neighbor sample — never all Proposition rows.
    const knnLimit = Math.max(knnQuota, limit - sharedEntityPairs.length);
    const knnPairs = await runCypher<PairRow>(
      `
      MATCH (p1:Proposition)
      WHERE p1.embedding IS NOT NULL
      WITH p1, rand() AS r
      ORDER BY r
      LIMIT $seedLimit
      CALL {
        WITH p1
        MATCH (p2:Proposition)
        WHERE p2.uid <> p1.uid AND p2.embedding IS NOT NULL
        WITH p2, rand() AS r
        ORDER BY r
        LIMIT $neighborSample
        RETURN p2
      }
      WITH CASE WHEN p1.uid < p2.uid THEN p1 ELSE p2 END AS leftP,
           CASE WHEN p1.uid < p2.uid THEN p2 ELSE p1 END AS rightP
      WITH leftP, rightP,
           reduce(dot = 0.0, i IN range(0, size(leftP.embedding)-1) |
             dot + leftP.embedding[i] * rightP.embedding[i]) AS dot,
           sqrt(reduce(s = 0.0, x IN leftP.embedding | s + x*x)) AS n1,
           sqrt(reduce(s = 0.0, x IN rightP.embedding | s + x*x)) AS n2
      WITH leftP, rightP,
           CASE WHEN n1 > 0 AND n2 > 0 THEN dot / (n1 * n2) ELSE 0.0 END AS score
      WHERE score >= $minSim
        AND NOT EXISTS {
          MATCH (d:Decision {uid: 'paircand:' + leftP.uid + ':' + rightP.uid})
          WHERE d.status IN ['pending', 'consumed', 'quarantined']
        }
      RETURN DISTINCT leftP.uid AS a, rightP.uid AS b,
             'embedding_knn' AS blockReason,
             'sim:' + left(leftP.uid, 12) AS topicKey,
             score
      ORDER BY score DESC
      LIMIT $knnLimit
      `,
      {
        knnLimit: neoInt(knnLimit),
        minSim,
        seedLimit: neoInt(seedLimit),
        neighborSample: neoInt(KNN_NEIGHBOR_SAMPLE),
      }
    );

    const seen = new Set<string>();
    const candidates: PairRow[] = [];
    for (const row of [...sharedEntityPairs, ...knnPairs]) {
      if (!row.a || !row.b) continue;
      const key = pairKey(row.a, row.b);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(row);
      if (candidates.length >= limit) break;
    }

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        candidate_count: candidates.length,
        shared_entity: sharedEntityPairs.length,
        embedding_knn: knnPairs.length,
        caps: {
          entity_sample: entitySample,
          props_per_entity: PROPS_PER_ENTITY,
          knn_seeds: seedLimit,
          knn_neighbors: KNN_NEIGHBOR_SAMPLE,
        },
        sample: candidates.slice(0, 20),
      });
    }

    const rows = candidates.map((c) => {
      const issueUid = resolveIssueUid({
        blockReason: c.blockReason,
        entityUid: c.entityUid,
        topicKey: c.topicKey,
      });
      return {
        a: c.a,
        b: c.b,
        blockReason: c.blockReason,
        topicKey: c.topicKey,
        score: c.score,
        entityUid: c.entityUid ?? null,
        issueUid,
        decisionUid: `paircand:${c.a}:${c.b}`,
      };
    });

    const written = rows.length
      ? await runCypher<{ uid: string }>(
          `
          UNWIND $rows AS row
          MATCH (pa:Proposition {uid: row.a})
          MATCH (pb:Proposition {uid: row.b})
          MERGE (dec:Decision {uid: row.decisionUid})
          ON CREATE SET
            dec.decisionType = 'proposition_pair_candidate',
            dec.status = 'pending',
            dec.actor = 'system',
            dec.blockReason = row.blockReason,
            dec.topicKey = row.topicKey,
            dec.entityUid = row.entityUid,
            dec.issueUid = row.issueUid,
            dec.score = row.score,
            dec.createdAt = datetime(),
            dec.updatedAt = datetime()
          ON MATCH SET
            dec.error = CASE WHEN dec.status = 'failed' THEN null ELSE dec.error END,
            dec.updatedAt = CASE WHEN dec.status = 'failed' THEN datetime() ELSE dec.updatedAt END,
            dec.status = CASE WHEN dec.status = 'failed' THEN 'pending' ELSE dec.status END,
            dec.blockReason = coalesce(dec.blockReason, row.blockReason),
            dec.topicKey = coalesce(dec.topicKey, row.topicKey),
            dec.entityUid = coalesce(dec.entityUid, row.entityUid),
            dec.issueUid = coalesce(dec.issueUid, row.issueUid),
            dec.score = coalesce(dec.score, row.score)
          WITH dec, pa, pb, row
          WHERE dec.decisionType = 'proposition_pair_candidate'
            AND dec.status = 'pending'
          MERGE (dec)-[:ABOUT]->(pa)
          MERGE (dec)-[:ABOUT]->(pb)
          MERGE (iss:Issue {uid: row.issueUid})
          ON CREATE SET
            iss.topicKey = row.topicKey,
            iss.dirty = false,
            iss.schemaVersion = '2.3.0',
            iss.createdAt = datetime()
          SET iss.topicKey = coalesce(iss.topicKey, row.topicKey),
              iss.updatedAt = datetime()
          MERGE (pa)-[:IN_ISSUE]->(iss)
          MERGE (pb)-[:IN_ISSUE]->(iss)
          RETURN dec.uid AS uid
          `,
          { rows }
        )
      : [];

    return json({
      ok: true,
      dry_run: false,
      candidate_count: candidates.length,
      created: written.length,
      shared_entity: sharedEntityPairs.length,
      embedding_knn: knnPairs.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate_proposition_pair_candidates]", message);
    return json({ error: message }, 500);
  }
};
