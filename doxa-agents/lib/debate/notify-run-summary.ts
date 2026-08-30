/**
 * Ping Next.js so curator run summaries post from the app (not Edge).
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

export type NotifyRunSummaryResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  posted?: boolean;
};

export async function notifyCuratorRunSummary(
  leaseId: string,
  botId: string
): Promise<NotifyRunSummaryResult> {
  const appUrl = (
    envGet("DOXA_APP_URL") ||
    envGet("NEXT_PUBLIC_SITE_URL") ||
    "https://doxa-two.vercel.app"
  ).replace(/\/$/, "");
  const secret = envGet("SLACK_NOTIFY_SECRET") || envGet("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !leaseId) {
    return { ok: false, skipped: true, reason: "missing_secret_or_lease_id" };
  }

  try {
    const res = await fetch(`${appUrl}/api/slack/run-summary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lease_id: leaseId, bot_id: botId }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok || body.ok === false) {
      const err = String(body.error ?? body.reason ?? res.statusText ?? "notify_failed");
      console.error(`[notify-run-summary] failed for lease ${leaseId}: ${err}`);
      return { ok: false, reason: err };
    }

    return {
      ok: true,
      posted: Boolean(body.posted),
      skipped: Boolean(body.skipped),
      reason: body.reason ? String(body.reason) : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notify-run-summary] request failed for lease ${leaseId}: ${message}`);
    return { ok: false, reason: message };
  }
}
