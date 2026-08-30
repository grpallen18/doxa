// Supabase Edge Function: run_l3_editor.
// Set-level viewpoint synthesis per (question, polarity). Body: { dry_run?, limit?, question_uid? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { getQuestionDossier } from "../../../../lib/debate/dossier.ts";
import { chatJson, estimateCostUsd, llmConfigFromDeno } from "../../../../lib/debate/llm.ts";
import { EDITOR_SYSTEM } from "../../../../lib/debate/prompts.ts";
import { ESTABLISH_MIN_CONFIDENCE } from "../../../../lib/debate/qualify-controversy.ts";
import { notifyWorkerRunSummary } from "../../../../lib/debate/notify-worker-run-summary.ts";

const DEFAULT_LIMIT = 8;

type Bucket = { questionUid: string; polarity: string };

type EditorSummaryItem = {
  question_uid: string;
  polarity: string;
  question_text: string;
  outcome: "submitted" | "skipped" | "error";
  cluster_count?: number;
  key_points?: string[];
  proposal_uid?: string;
  detail?: string;
};

function keyPointsFromClusters(clusters: unknown): string[] {
  if (!Array.isArray(clusters)) return [];
  return clusters
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      const row = c as Record<string, unknown>;
      return String(row.key_point ?? row.label ?? "").trim();
    })
    .filter(Boolean);
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const llm = llmConfigFromDeno((k) => Deno.env.get(k));
  if (!llm) return json({ error: "Missing LLM_API_KEY or OPENAI_API_KEY" }, 500);

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
  const limit = clampInt(body.limit, 1, 20, DEFAULT_LIMIT);
  const questionUid =
    typeof body.question_uid === "string" ? body.question_uid.trim() : "";

  const buckets = await runCypher<Bucket>(
    `
    MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q:Question)
    WHERE $questionUid = '' OR q.uid = $questionUid
    MATCH (q)<-[a:ANSWERS]-(p:Proposition)
    WHERE coalesce(a.debateRole, 'thesis') = 'thesis'
      AND a.polarity IS NOT NULL
      AND a.polarity <> 'NONE'
      AND a.polarity <> 'UNCERTAIN'
      AND coalesce(a.confidence, 0) >= $minConf
    WITH q, a.polarity AS polarity, count(DISTINCT p) AS n
    WHERE n >= 1
    OPTIONAL MATCH (v:Viewpoint {questionUid: q.uid, polarity: polarity})
    WITH q, polarity, n, v
    WHERE v IS NULL
    RETURN q.uid AS questionUid, polarity
    ORDER BY n DESC, q.uid, polarity
    LIMIT $limit
    `,
    { questionUid, minConf: ESTABLISH_MIN_CONFIDENCE, limit: neoInt(limit) }
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, buckets: buckets.length, items: buckets });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const runId = crypto.randomUUID();
  const summaryItems: EditorSummaryItem[] = [];
  let submitted = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const t0 = performance.now();

  for (const b of buckets) {
    const dossier = await getQuestionDossier(runCypher, b.questionUid);
    const questionText = dossier?.question?.text ?? b.questionUid;
    if (!dossier) {
      summaryItems.push({
        question_uid: b.questionUid,
        polarity: b.polarity,
        question_text: questionText,
        outcome: "skipped",
        detail: "missing dossier",
      });
      continue;
    }
    const members = dossier.members.filter((m) => m.polarity === b.polarity);
    if (!members.length) {
      summaryItems.push({
        question_uid: b.questionUid,
        polarity: b.polarity,
        question_text: questionText,
        outcome: "skipped",
        detail: "no members on polarity",
      });
      continue;
    }
    try {
      const result = await chatJson<Record<string, unknown>>(llm, EDITOR_SYSTEM, {
        question: dossier.question,
        polarity: b.polarity,
        members,
      });
      promptTokens += result.usage.prompt_tokens;
      completionTokens += result.usage.completion_tokens;
      const clusters = result.parsed.clusters ?? [];
      const proposalUid = `editor:${b.questionUid}:${b.polarity}`;
      await supabase.from("l3_proposals").upsert({
        proposal_uid: proposalUid,
        bot_id: "editor",
        kind: "viewpoint",
        question_uid: b.questionUid,
        payload: {
          question_uid: b.questionUid,
          polarity: b.polarity,
          shared_bullets: result.parsed.shared_bullets ?? [],
          clash_bullets: result.parsed.clash_bullets ?? [],
          clusters,
        },
        status: "submitted",
        updated_at: new Date().toISOString(),
      });
      submitted += 1;
      summaryItems.push({
        question_uid: b.questionUid,
        polarity: b.polarity,
        question_text: questionText,
        outcome: "submitted",
        cluster_count: Array.isArray(clusters) ? clusters.length : 0,
        key_points: keyPointsFromClusters(clusters),
        proposal_uid: proposalUid,
      });
    } catch (err) {
      summaryItems.push({
        question_uid: b.questionUid,
        polarity: b.polarity,
        question_text: questionText,
        outcome: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await supabase.from("l3_runs").insert({
    run_id: runId,
    bot_id: "editor",
    kind: "viewpoint",
    items: buckets.length,
    ops_submitted: submitted,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost_usd: estimateCostUsd({
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    }),
    wall_ms: Math.round(performance.now() - t0),
    result: { summary_items: summaryItems },
  });

  await notifyWorkerRunSummary({
    worker: "editor",
    bot_id: "editor",
    run_id: runId,
    buckets_scanned: buckets.length,
    items: summaryItems,
  });

  return json({ ok: true, run_id: runId, buckets: buckets.length, submitted });
};
