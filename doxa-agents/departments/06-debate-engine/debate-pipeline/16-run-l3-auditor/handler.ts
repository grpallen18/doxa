// Supabase Edge Function: run_l3_auditor.
// Adversarial publish gate. Body: { dry_run?, limit? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { getControversyDossier } from "../../../../lib/debate/dossier.ts";
import { chatJson, estimateCostUsd, llmConfigFromDeno } from "../../../../lib/debate/llm.ts";
import { AUDITOR_SYSTEM } from "../../../../lib/debate/prompts.ts";
import { notifyWorkerRunSummary } from "../../../../lib/debate/notify-worker-run-summary.ts";

const DEFAULT_LIMIT = 8;

type AuditorSummaryItem = {
  controversy_uid: string;
  question_uid: string;
  question_text: string;
  outcome: "submitted" | "skipped" | "error";
  verdict?: "pass" | "block";
  reason?: string;
  weakest_member_uid?: string;
  proposal_uid?: string;
  detail?: string;
};

function normalizeVerdict(raw: unknown): "pass" | "block" | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "pass") return "pass";
  if (v === "block") return "block";
  return undefined;
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

  const rows = await runCypher<{ uid: string }>(
    `
    MATCH (c:Controversy {status: 'established'})
    WHERE c.auditVerdict IS NULL OR c.auditVerdict = 'pending'
    OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
    WITH c, [p IN collect(DISTINCT v.polarity) WHERE p IS NOT NULL] AS polarities
    WHERE size(polarities) >= 2
    RETURN c.uid AS uid
    ORDER BY c.updatedAt DESC
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );

  if (dryRun) return json({ ok: true, dry_run: true, pending: rows.length });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const runId = crypto.randomUUID();
  const summaryItems: AuditorSummaryItem[] = [];
  let submitted = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const t0 = performance.now();

  for (const row of rows) {
    const dossier = await getControversyDossier(runCypher, row.uid);
    if (!dossier) {
      summaryItems.push({
        controversy_uid: row.uid,
        question_uid: "",
        question_text: row.uid,
        outcome: "skipped",
        detail: "missing dossier",
      });
      continue;
    }
    const questionText = dossier.question ?? dossier.questionUid;
    try {
      const result = await chatJson<Record<string, unknown>>(llm, AUDITOR_SYSTEM, dossier);
      promptTokens += result.usage.prompt_tokens;
      completionTokens += result.usage.completion_tokens;
      const verdict = normalizeVerdict(result.parsed.verdict) ?? "block";
      const proposalUid = `audit:${row.uid}`;
      const reason = String(result.parsed.reason ?? "");
      const weakest = String(result.parsed.weakest_member_uid ?? "");
      await supabase.from("l3_proposals").upsert({
        proposal_uid: proposalUid,
        bot_id: "auditor",
        kind: "audit",
        controversy_uid: row.uid,
        question_uid: dossier.questionUid,
        payload: {
          controversy_uid: row.uid,
          question_uid: dossier.questionUid,
          verdict,
          weakest_member_uid: weakest,
          reason,
          cited_utterance_uids: result.parsed.cited_utterance_uids ?? [],
        },
        status: "submitted",
        updated_at: new Date().toISOString(),
      });
      submitted += 1;
      summaryItems.push({
        controversy_uid: row.uid,
        question_uid: dossier.questionUid,
        question_text: questionText,
        outcome: "submitted",
        verdict,
        reason,
        weakest_member_uid: weakest || undefined,
        proposal_uid: proposalUid,
      });
    } catch (err) {
      summaryItems.push({
        controversy_uid: row.uid,
        question_uid: dossier.questionUid,
        question_text: questionText,
        outcome: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await supabase.from("l3_runs").insert({
    run_id: runId,
    bot_id: "auditor",
    kind: "audit",
    items: rows.length,
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
    worker: "auditor",
    bot_id: "auditor",
    run_id: runId,
    pending_scanned: rows.length,
    items: summaryItems,
  });

  return json({ ok: true, run_id: runId, pending: rows.length, submitted });
};
