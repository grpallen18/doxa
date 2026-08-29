// Supabase Edge Function: run_l3_curator.
// Claim membership/mint/consolidate leases, call LLM, submit proposals.
// Body: { dry_run?, limit?, kind? }
// Env: NEO4J_*, SUPABASE_*, LLM_* / OPENAI_*

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { getQuestionDossier, getMintClusterDossier } from "../../../../lib/debate/dossier.ts";
import { chatJson, estimateCostUsd, llmConfigFromDeno } from "../../../../lib/debate/llm.ts";
import { CURATOR_SYSTEM } from "../../../../lib/debate/prompts.ts";
import { normalizeOp, initialProposalStatus } from "../../../../lib/debate/proposal-ops.ts";
import { notifyPendingProposal } from "../../../../lib/debate/notify-approval.ts";
import { loadBootstrapState } from "../../../../lib/debate/bootstrap-config.ts";

const DEFAULT_LIMIT = 5;

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
  const limit = clampInt(body.limit, 1, 15, DEFAULT_LIMIT);
  const botId = "curator";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const bootstrap = (await loadBootstrapState(supabase)).bootstrap;
  const kinds =
    typeof body.kind === "string" && body.kind.trim()
      ? [body.kind.trim()]
      : bootstrap
        ? ["mint"]
        : ["membership", "mint", "consolidate"];
  const items: Array<Record<string, unknown>> = [];
  for (const kind of kinds) {
    const remaining = Math.max(1, limit - items.length);
    const { data: claimed, error: claimErr } = await supabase.rpc("claim_l3_review_batch", {
      p_bot_id: botId,
      p_kind: kind,
      p_limit: remaining,
      p_lease_seconds: 900,
    });
    if (claimErr) return json({ error: claimErr.message }, 500);
    for (const row of claimed ?? []) items.push({ ...(row as Record<string, unknown>), kind });
    if (items.length >= limit) break;
  }
  if (dryRun) {
    return json({ ok: true, dry_run: true, claimed: items.length, kinds });
  }

  let submitted = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const t0 = performance.now();

  for (const item of items as Array<Record<string, unknown>>) {
    const questionUid = String(item.question_uid ?? "");
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const propUids = Array.isArray(payload.prop_uids)
      ? payload.prop_uids.map((x) => String(x)).filter(Boolean)
      : [];
    const dossier = questionUid
      ? await getQuestionDossier(runCypher, questionUid)
      : propUids.length
        ? await getMintClusterDossier(runCypher, propUids)
        : { mint_cluster: payload };
    if (!dossier) {
      await supabase
        .from("l3_review_queue")
        .update({
          state: "blocked",
          dirty_reason: "missing_dossier",
          updated_at: new Date().toISOString(),
        })
        .eq("item_id", item.item_id);
      continue;
    }
    try {
      const result = await chatJson<Record<string, unknown>>(llm, CURATOR_SYSTEM, dossier);
      promptTokens += result.usage.prompt_tokens;
      completionTokens += result.usage.completion_tokens;
      const ops = Array.isArray(result.parsed.ops)
        ? result.parsed.ops
            .map((o) => normalizeOp((o ?? {}) as Record<string, unknown>))
            .filter((o): o is NonNullable<typeof o> => o != null)
        : [];
      const kind = String(item.kind ?? "membership");
      const proposalUid = `curator:${item.lease_id}:${item.item_id}`;
      const status = initialProposalStatus(kind, ops);
      await supabase.from("l3_proposals").upsert({
        proposal_uid: proposalUid,
        bot_id: botId,
        kind,
        question_uid: questionUid || null,
        lease_id: item.lease_id,
        payload: {
          question_uid: result.parsed.question_uid ?? questionUid,
          overall_rationale: result.parsed.overall_rationale ?? "",
          ops,
          // Lets the applier close this one queue item (a lease covers a whole
          // batch) and mark a declined cluster as reviewed.
          item_id: item.item_id,
          cluster_prop_uids: Array.isArray(payload.prop_uids) ? payload.prop_uids : undefined,
        },
        status,
        updated_at: new Date().toISOString(),
      });
      if (status === "pending_approval") {
        await notifyPendingProposal(proposalUid);
      }
      await supabase
        .from("l3_review_queue")
        .update({ state: "proposed", updated_at: new Date().toISOString() })
        .eq("item_id", item.item_id);
      submitted += 1;
    } catch (err) {
      await supabase
        .from("l3_review_queue")
        .update({
          state: "blocked",
          dirty_reason: err instanceof Error ? err.message : String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("item_id", item.item_id);
    }
  }

  const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens };
  await supabase.from("l3_runs").insert({
    bot_id: botId,
    kind: kinds.join(","),
    lease_id: items[0]?.lease_id ?? null,
    items: items.length,
    ops_submitted: submitted,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost_usd: estimateCostUsd(usage),
    wall_ms: Math.round(performance.now() - t0),
  });

  return json({ ok: true, claimed: items.length, submitted });
};
