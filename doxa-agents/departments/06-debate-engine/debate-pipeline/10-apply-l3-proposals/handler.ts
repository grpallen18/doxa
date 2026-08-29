// Supabase Edge Function: apply_l3_proposals.
// Validate + apply submitted proposals. Body: { dry_run?, proposal_uid?, limit?, revert_proposal_uid?, auto_apply? }
// Env: NEO4J_*, SUPABASE_*

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import {
  MEMBERSHIP_APPLY_ALL,
  normalizeOp,
  precisionAllowlist,
  type MembershipProposalPayload,
  type ViewpointProposalPayload,
  type AuditVerdictPayload,
} from "../../../../lib/debate/proposal-ops.ts";
import {
  validateAuditVerdict,
  validateMembershipProposal,
  validateViewpointProposal,
} from "../../../../lib/debate/proposal-validator.ts";
import {
  applyMembershipProposal,
  applyViewpointProposal,
} from "../../../../lib/debate/proposal-applier.ts";
import { ingestSourceLead } from "../../../../lib/debate/source-lead.ts";

const DEFAULT_LIMIT = 20;

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
  const limit = clampInt(body.limit, 1, 50, DEFAULT_LIMIT);
  const onlyUid = typeof body.proposal_uid === "string" ? body.proposal_uid.trim() : "";
  const revertUid = typeof body.revert_proposal_uid === "string" ? body.revert_proposal_uid.trim() : "";
  const autoApplyTypes = Array.isArray(body.auto_apply)
    ? body.auto_apply.map((x) => String(x).toUpperCase())
    : null;
  const forceApplyAll = Boolean(body.force_apply_all ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let allowTypes = autoApplyTypes;
  if (!allowTypes) {
    if (forceApplyAll) {
      allowTypes = [...MEMBERSHIP_APPLY_ALL];
    } else {
      const { data: judged } = await supabase
        .from("l3_proposal_ops")
        .select("op_type, status, gold_negative");
      allowTypes = precisionAllowlist(judged ?? []);
    }
  }

  if (revertUid) {
    const { data: parent } = await supabase
      .from("l3_proposals")
      .select("question_uid")
      .eq("proposal_uid", revertUid)
      .maybeSingle();
    const { data: ops } = await supabase
      .from("l3_proposal_ops")
      .select("*")
      .eq("proposal_uid", revertUid)
      .eq("status", "applied")
      .in("op_type", ["ADMIT", "EVICT"]);
    let reverted = 0;
    const qUid = String(parent?.question_uid ?? "");
    for (const op of ops ?? []) {
      const payload = op.payload as { prop_uid?: string; polarity?: string; confidence?: number };
      if (!payload.prop_uid || !qUid) continue;
      if (op.op_type === "ADMIT") {
        await runCypher(
          `MATCH (p:Proposition {uid: $p})-[a:ANSWERS]->(q:Question {uid: $q}) DELETE a`,
          { p: payload.prop_uid, q: qUid }
        );
        reverted += 1;
      } else if (op.op_type === "EVICT") {
        await runCypher(
          `
          MATCH (p:Proposition {uid: $p})
          MATCH (q:Question {uid: $q})
          MERGE (p)-[a:ANSWERS]->(q)
          SET a.polarity = coalesce($polarity, a.polarity, 'NONE'),
              a.confidence = coalesce($confidence, a.confidence, 0.5),
              a.updatedAt = datetime()
          `,
          {
            p: payload.prop_uid,
            q: qUid,
            polarity: payload.polarity ?? "NONE",
            confidence: Number(payload.confidence) || 0.5,
          }
        );
        reverted += 1;
      }
    }
    await supabase.from("l3_proposals").update({ status: "reverted", updated_at: new Date().toISOString() }).eq("proposal_uid", revertUid);
    await supabase.from("l3_proposal_ops").update({ status: "reverted" }).eq("proposal_uid", revertUid);
    return json({
      ok: true,
      reverted,
      proposal_uid: revertUid,
      note: "ADMIT/EVICT membership edges reverted; MERGE/MINT/RETITLE left in graph",
    });
  }

  let query = supabase
    .from("l3_proposals")
    .select("*")
    .in("status", ["submitted", "validated"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (onlyUid) query = supabase.from("l3_proposals").select("*").eq("proposal_uid", onlyUid).limit(1);

  const { data: rows, error } = await query;
  if (error) return json({ error: error.message }, 500);

  if (dryRun) {
    return json({ ok: true, dry_run: true, pending: rows?.length ?? 0 });
  }

  let applied = 0;
  let rejected = 0;
  let partial = 0;

  for (const row of rows ?? []) {
    const kind = row.kind as string;
    const payload = row.payload as Record<string, unknown>;
    const actor = `bot:${row.bot_id ?? "unknown"}`;
    const meta = {
      proposalUid: row.proposal_uid as string,
      botId: String(row.bot_id ?? "unknown"),
      actor,
      openaiApiKey: Deno.env.get("OPENAI_API_KEY") ?? undefined,
    };

    if (kind === "membership" || kind === "mint" || kind === "consolidate") {
      const ops = Array.isArray(payload.ops)
        ? payload.ops
            .map((o) => normalizeOp((o ?? {}) as Record<string, unknown>))
            .filter((o): o is NonNullable<typeof o> => o != null)
        : [];
      const membership: MembershipProposalPayload = {
        question_uid: String(payload.question_uid ?? row.question_uid ?? ""),
        overall_rationale: String(payload.overall_rationale ?? ""),
        ops,
      };
      const validation = await validateMembershipProposal(runCypher, membership);
      const opRows = ops.map((op, i) => ({
        proposal_uid: row.proposal_uid,
        op_index: i,
        op_type: op.type,
        payload: op,
        status: validation.ops[i]?.ok ? "accepted" : "rejected",
        validator_errors: validation.ops[i]?.errors ?? [],
      }));
      await supabase.from("l3_proposal_ops").upsert(opRows, { onConflict: "proposal_uid,op_index" });

      const autoIndexes = ops
        .map((op, i) =>
          validation.ops[i]?.ok && (allowTypes ?? []).includes(op.type) ? i : -1
        )
        .filter((i) => i >= 0);
      const autoOk = autoIndexes.map((i) => ops[i]);

      if (!autoOk.length) {
        await supabase
          .from("l3_proposals")
          .update({
            status: validation.ok ? "validated" : "rejected",
            validator_errors: { errors: validation.errors, ops: validation.ops },
            updated_at: new Date().toISOString(),
          })
          .eq("proposal_uid", row.proposal_uid);
        if (row.lease_id) {
          await supabase
            .from("l3_review_queue")
            .update({
              state: validation.ok ? "proposed" : "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("lease_id", row.lease_id);
        }
        if (!validation.ok) rejected += 1;
        continue;
      }

      const result = await applyMembershipProposal(
        runCypher,
        { ...membership, ops: autoOk },
        meta
      );
      const leftoverAccepted = ops.filter(
        (_, i) => validation.ops[i]?.ok && !autoIndexes.includes(i)
      );
      const status =
        leftoverAccepted.length && result.applied
          ? "partially_applied"
          : result.skipped && result.applied
            ? "partially_applied"
            : result.applied
              ? "applied"
              : "rejected";
      await supabase
        .from("l3_proposals")
        .update({
          status,
          validator_errors: { apply: result.errors, validation: validation.errors },
          updated_at: new Date().toISOString(),
        })
        .eq("proposal_uid", row.proposal_uid);
      for (const i of autoIndexes) {
        await supabase
          .from("l3_proposal_ops")
          .update({ status: "applied" })
          .eq("proposal_uid", row.proposal_uid)
          .eq("op_index", i);
      }
      if (row.lease_id) {
        await supabase
          .from("l3_review_queue")
          .update({
            state: leftoverAccepted.length ? "proposed" : "applied",
            updated_at: new Date().toISOString(),
          })
          .eq("lease_id", row.lease_id);
      }
      if (status === "applied") applied += 1;
      else if (status === "partially_applied") partial += 1;
      else rejected += 1;
      continue;
    }

    if (kind === "viewpoint") {
      const vp = payload as unknown as ViewpointProposalPayload;
      const validation = validateViewpointProposal(vp);
      if (!validation.ok) {
        await supabase
          .from("l3_proposals")
          .update({
            status: "rejected",
            validator_errors: validation,
            updated_at: new Date().toISOString(),
          })
          .eq("proposal_uid", row.proposal_uid);
        rejected += 1;
        continue;
      }
      await applyViewpointProposal(runCypher, vp, meta);
      await supabase
        .from("l3_proposals")
        .update({ status: "applied", updated_at: new Date().toISOString() })
        .eq("proposal_uid", row.proposal_uid);
      applied += 1;
      continue;
    }

    if (kind === "audit") {
      const audit = payload as unknown as AuditVerdictPayload;
      const validation = validateAuditVerdict(audit);
      if (!validation.ok) {
        await supabase
          .from("l3_proposals")
          .update({
            status: "rejected",
            validator_errors: validation,
            updated_at: new Date().toISOString(),
          })
          .eq("proposal_uid", row.proposal_uid);
        rejected += 1;
        continue;
      }
      await runCypher(
        `
        MATCH (c:Controversy {uid: $uid})
        SET c.auditVerdict = $verdict,
            c.auditWeakestMember = $weak,
            c.auditReason = $reason,
            c.updatedAt = datetime()
        `,
        {
          uid: audit.controversy_uid,
          verdict: audit.verdict,
          weak: audit.weakest_member_uid,
          reason: audit.reason,
        }
      );
      await supabase
        .from("l3_proposals")
        .update({ status: "applied", updated_at: new Date().toISOString() })
        .eq("proposal_uid", row.proposal_uid);
      applied += 1;
    }

    if (kind === "source_lead") {
      const url = String(payload.url ?? "");
      const questionUid = String(payload.question_uid ?? row.question_uid ?? "");
      if (!url || !questionUid) {
        await supabase
          .from("l3_proposals")
          .update({
            status: "rejected",
            validator_errors: { errors: ["url and question_uid required"] },
            updated_at: new Date().toISOString(),
          })
          .eq("proposal_uid", row.proposal_uid);
        rejected += 1;
        continue;
      }
      try {
        await ingestSourceLead(supabase, {
          url,
          title: payload.title ? String(payload.title) : undefined,
          question_uid: questionUid,
          note: payload.note ? String(payload.note) : undefined,
        });
        await supabase
          .from("l3_proposals")
          .update({ status: "applied", updated_at: new Date().toISOString() })
          .eq("proposal_uid", row.proposal_uid);
        applied += 1;
      } catch (err) {
        await supabase
          .from("l3_proposals")
          .update({
            status: "rejected",
            validator_errors: { errors: [err instanceof Error ? err.message : String(err)] },
            updated_at: new Date().toISOString(),
          })
          .eq("proposal_uid", row.proposal_uid);
        rejected += 1;
      }
    }
  }

  return json({
    ok: true,
    scanned: rows?.length ?? 0,
    applied,
    rejected,
    partial,
    auto_apply: allowTypes,
  });
};
