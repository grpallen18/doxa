// Supabase Edge Function: enqueue_l3_reviews.
// Dirty Questions + unbound clusters → l3_review_queue.
// Body: { dry_run?, limit? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { cosineSimilarity, UNBOUND_CLUSTER_COSINE } from "../../../../lib/debate/question-identity.ts";
import { loadBootstrapState, UNBOUND_CLUSTER_MIN_SIZE } from "../../../../lib/debate/bootstrap-config.ts";

const DEFAULT_LIMIT = 80;
const DEFAULT_UNBOUND_SCAN = 500;

type QRow = {
  uid: string;
  status: string | null;
  memberCount: number;
  candidateCount: number;
  lastReviewed: string | null;
  hasControversy: boolean;
};

type UnboundRow = {
  uid: string;
  text: string;
  embedding: number[] | null;
  reviewed: boolean;
};

function priority(row: QRow): number {
  const published = row.hasControversy ? 3 : 1;
  const recency = row.lastReviewed ? 1 : 2;
  return published * recency * Math.max(1, row.candidateCount) * Math.max(1, row.memberCount);
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const limit = clampInt(body.limit, 1, 200, DEFAULT_LIMIT);
  const unboundScanLimit = clampInt(body.unbound_limit, 100, 1000, DEFAULT_UNBOUND_SCAN);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const bootstrap =
    body.bootstrap != null
      ? Boolean(body.bootstrap)
      : (await loadBootstrapState(supabase)).bootstrap;

  const questions = bootstrap
    ? []
    : await runCypher<QRow>(
    `
    MATCH (q:Question)
    OPTIONAL MATCH (p:Proposition)-[:ANSWERS]->(q)
    OPTIONAL MATCH (c2:Proposition)-[cf:CANDIDATE_FOR]->(q)
      WHERE q.lastReviewedAt IS NULL
         OR coalesce(cf.createdAt, cf.updatedAt) > q.lastReviewedAt
    OPTIONAL MATCH (ctr:Controversy)-[:ABOUT]->(q)
    WITH q,
         count(DISTINCT p) AS memberCount,
         count(DISTINCT c2) AS candidateCount,
         toString(q.lastReviewedAt) AS lastReviewed,
         count(DISTINCT ctr) > 0 AS hasControversy
    WHERE candidateCount > 0
       OR q.lastReviewedAt IS NULL
    RETURN q.uid AS uid,
           q.status AS status,
           memberCount,
           candidateCount,
           lastReviewed,
           hasControversy
    ORDER BY candidateCount DESC
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );

  const unbound = await runCypher<UnboundRow>(
    `
    MATCH (p:Proposition)
    WHERE p.embedding IS NOT NULL
      AND coalesce(p.debateEligible, true) <> false
      AND NOT EXISTS { MATCH (p)-[:ANSWERS]->(:Question) }
      AND NOT EXISTS { MATCH (p)-[:CANDIDATE_FOR]->(:Question) }
    RETURN p.uid AS uid,
           coalesce(p.text, p.normalizedText, '') AS text,
           p.embedding AS embedding,
           p.l3ReviewedAt IS NOT NULL AS reviewed
    ORDER BY
      CASE WHEN p.l3ReviewedAt IS NULL THEN 0 ELSE 1 END,
      coalesce(p.l3EnqueueScannedAt, datetime({epochMillis: 0})),
      p.uid
    LIMIT $limit
    `,
    { limit: neoInt(unboundScanLimit) }
  );

  const clusters: string[][] = [];
  const used = new Set<string>();
  const reviewed = new Set(unbound.filter((p) => p.reviewed).map((p) => p.uid));
  for (const a of unbound) {
    if (used.has(a.uid)) continue;
    const group = [a.uid];
    used.add(a.uid);
    for (const b of unbound) {
      if (used.has(b.uid)) continue;
      if (cosineSimilarity(a.embedding ?? [], b.embedding ?? []) >= UNBOUND_CLUSTER_COSINE) {
        group.push(b.uid);
        used.add(b.uid);
      }
    }
    if (group.length < UNBOUND_CLUSTER_MIN_SIZE) continue;
    // A cluster the curator already declined stays quiet until a new unbound
    // proposition joins it; otherwise it re-enqueues on every tick.
    if (group.every((uid) => reviewed.has(uid))) continue;
    clusters.push(group);
  }

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      bootstrap,
      dirty_questions: questions.length,
      unbound_clusters: clusters.length,
      unbound_scanned: unbound.length,
    });
  }
  let enqueued = 0;

  for (const q of questions) {
    const kind = q.memberCount <= 1 && q.candidateCount === 0 ? "consolidate" : "membership";
    const { data: existing } = await supabase
      .from("l3_review_queue")
      .select("item_id")
      .eq("question_uid", q.uid)
      .eq("kind", kind)
      .in("state", ["pending", "leased"])
      .limit(1);
    if (existing?.length) continue;
    const { error } = await supabase.from("l3_review_queue").insert({
      kind,
      question_uid: q.uid,
      priority: priority(q),
      dirty_reason: q.memberCount <= 1 ? "q1_or_unreviewed" : "candidates",
    });
    if (!error) enqueued += 1;
  }

  for (const group of clusters) {
    const clusterId = `unbound:${group.slice(0, 2).join(":")}`;
    const { data: existing } = await supabase
      .from("l3_review_queue")
      .select("item_id")
      .eq("cluster_id", clusterId)
      .in("state", ["pending", "leased"])
      .limit(1);
    if (existing?.length) continue;
    const { error } = await supabase.from("l3_review_queue").insert({
      kind: "mint",
      cluster_id: clusterId,
      priority: 40,
      dirty_reason: "unbound_cluster",
      payload: { prop_uids: group },
    });
    if (!error) enqueued += 1;
  }

  const scannedUids = unbound.map((p) => p.uid).filter(Boolean);
  if (scannedUids.length) {
    await runCypher(
      `MATCH (p:Proposition) WHERE p.uid IN $uids SET p.l3EnqueueScannedAt = datetime()`,
      { uids: scannedUids }
    );
  }

  let leadRequests = 0;
  if (!bootstrap) {
    const onesided = await runCypher<{ uid: string; thesis: string | null }>(
      `
      MATCH (q:Question)<-[a:ANSWERS]-(:Proposition)
      WITH q, collect(DISTINCT a.polarity) AS pols
      WHERE size(pols) = 1
      RETURN q.uid AS uid, q.expectedCounterThesis AS thesis
      LIMIT $limit
      `,
      { limit: neoInt(Math.min(limit, 40)) }
    );
    for (const q of onesided) {
      const { data: existing } = await supabase
        .from("lead_requests")
        .select("request_id")
        .eq("question_uid", q.uid)
        .in("state", ["pending", "claimed"])
        .limit(1);
      if (existing?.length) continue;
      const { error } = await supabase.from("lead_requests").insert({
        question_uid: q.uid,
        expected_counter_thesis: q.thesis,
        priority: 50,
        created_by: "enqueue_l3_reviews",
      });
      if (!error) leadRequests += 1;
    }
  }

  return json({
    ok: true,
    dirty_questions: questions.length,
    unbound_clusters: clusters.length,
    unbound_scanned: unbound.length,
    enqueued,
    lead_requests: leadRequests,
    bootstrap,
  });
};
