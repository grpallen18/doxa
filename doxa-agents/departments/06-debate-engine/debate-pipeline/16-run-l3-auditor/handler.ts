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

const DEFAULT_LIMIT = 8;

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
    RETURN c.uid AS uid
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );

  if (dryRun) return json({ ok: true, dry_run: true, pending: rows.length });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let submitted = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const t0 = performance.now();

  for (const row of rows) {
    const dossier = await getControversyDossier(runCypher, row.uid);
    if (!dossier) continue;
    try {
      const result = await chatJson<Record<string, unknown>>(llm, AUDITOR_SYSTEM, dossier);
      promptTokens += result.usage.prompt_tokens;
      completionTokens += result.usage.completion_tokens;
      const proposalUid = `audit:${row.uid}`;
      await supabase.from("l3_proposals").upsert({
        proposal_uid: proposalUid,
        bot_id: "auditor",
        kind: "audit",
        controversy_uid: row.uid,
        question_uid: dossier.questionUid,
        payload: {
          controversy_uid: row.uid,
          question_uid: dossier.questionUid,
          verdict: result.parsed.verdict ?? "block",
          weakest_member_uid: result.parsed.weakest_member_uid ?? "",
          reason: result.parsed.reason ?? "",
          cited_utterance_uids: result.parsed.cited_utterance_uids ?? [],
        },
        status: "submitted",
        updated_at: new Date().toISOString(),
      });
      submitted += 1;
    } catch {
      /* skip */
    }
  }

  await supabase.from("l3_runs").insert({
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
  });

  return json({ ok: true, pending: rows.length, submitted });
};
