/**
 * Ping Next.js so Slack cards post from the app (not Edge).
 * Logs failures — Slack delivery must not fail silently.
 */

function envGet(key: string): string {
  try {
    const deno = (globalThis as { Deno?: { env?: { get: (k: string) => string | undefined } } }).Deno;
    const fromDeno = deno?.env?.get?.(key);
    if (fromDeno) return fromDeno;
  } catch {
    /* not Deno */
  }
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return proc?.env?.[key] ?? "";
  } catch {
    return "";
  }
}

export type NotifyPendingProposalResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  usedFallback?: boolean;
  warning?: string;
};

export async function notifyPendingProposal(
  proposalUid: string
): Promise<NotifyPendingProposalResult> {
  const appUrl = (
    envGet("DOXA_APP_URL") ||
    envGet("NEXT_PUBLIC_SITE_URL") ||
    "https://doxa-two.vercel.app"
  ).replace(/\/$/, "");
  const secret = envGet("SLACK_NOTIFY_SECRET") || envGet("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !proposalUid) {
    return { ok: false, skipped: true, reason: "missing_secret_or_proposal_uid" };
  }

  try {
    const res = await fetch(`${appUrl}/api/slack/notify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ proposal_uid: proposalUid }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok || body.ok === false) {
      const err = String(body.error ?? body.reason ?? res.statusText ?? "notify_failed");
      console.error(`[notify-approval] Slack notify failed for ${proposalUid}: ${err}`);
      return { ok: false, reason: err };
    }

    if (body.used_fallback) {
      console.warn(
        `[notify-approval] Slack used compact fallback for ${proposalUid}: ${String(body.warning ?? "")}`
      );
    }

    return {
      ok: true,
      usedFallback: Boolean(body.used_fallback),
      warning: body.warning ? String(body.warning) : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notify-approval] Slack notify request failed for ${proposalUid}: ${message}`);
    return { ok: false, reason: message };
  }
}
