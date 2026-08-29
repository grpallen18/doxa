// Supabase Edge Function: sweep_counter_side.
// For one-sided questions, bind CANDIDATE_FOR from counter-thesis kNN.
// Body: { dry_run?, limit? }

import { corsHeaders, json, clampInt, requireInternalAuth } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { getCounterSideCandidates } from "../../../../lib/debate/dossier.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadBootstrapState } from "../../../../lib/debate/bootstrap-config.ts";

const DEFAULT_LIMIT = 20;

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
  const limit = clampInt(body.limit, 1, 50, DEFAULT_LIMIT);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (SUPABASE_URL && SERVICE_ROLE) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { bootstrap, questionCount } = await loadBootstrapState(supabase);
    if (bootstrap) {
      return json({
        ok: true,
        skipped: true,
        reason: "bootstrap",
        question_count: questionCount,
        bound: 0,
      });
    }
  }

  const onesided = await runCypher<{ uid: string; pols: string[] }>(
    `
    MATCH (q:Question)<-[a:ANSWERS]-(:Proposition)
    WITH q, collect(DISTINCT a.polarity) AS pols
    WHERE size(pols) = 1
    RETURN q.uid AS uid, pols
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );

  if (dryRun) return json({ ok: true, dry_run: true, questions: onesided.length });

  let bound = 0;
  for (const q of onesided) {
    const hits = await getCounterSideCandidates(runCypher, q.uid);
    if (!hits.length) continue;
    await runCypher(
      `
      UNWIND $hits AS hit
      MATCH (p:Proposition {uid: hit.propUid})
      MATCH (q:Question {uid: $questionUid})
      MERGE (p)-[c:CANDIDATE_FOR]->(q)
      SET c.score = hit.score,
          c.method = 'counter_knn',
          c.createdAt = coalesce(c.createdAt, datetime()),
          c.updatedAt = datetime()
      `,
      { hits, questionUid: q.uid }
    );
    bound += hits.length;
  }

  return json({ ok: true, questions: onesided.length, bound });
};
