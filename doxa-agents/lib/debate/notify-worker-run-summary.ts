/**
 * Ping Next.js so editor/auditor run summaries post from the app (not Edge).
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

export type NotifyWorkerRunSummaryResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  posted?: boolean;
};

export type WorkerRunSummaryPayload = {
  worker: "editor" | "auditor";
  bot_id: string;
  run_id: string;
  buckets_scanned?: number;
  pending_scanned?: number;
  items: Array<Record<string, unknown>>;
};

export async function notifyWorkerRunSummary(
  summary: WorkerRunSummaryPayload
): Promise<NotifyWorkerRunSummaryResult> {
  const appUrl = (
    envGet("DOXA_APP_URL") ||
    envGet("NEXT_PUBLIC_SITE_URL") ||
    "https://doxa-two.vercel.app"
  ).replace(/\/$/, "");
  const secret = envGet("SLACK_NOTIFY_SECRET") || envGet("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !summary.run_id) {
    return { ok: false, skipped: true, reason: "missing_secret_or_run_id" };
  }

  try {
    const res = await fetch(`${appUrl}/api/slack/worker-run-summary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(summary),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok || body.ok === false) {
      const err = String(body.error ?? body.reason ?? res.statusText ?? "notify_failed");
      console.error(`[notify-worker-run-summary] failed for run ${summary.run_id}: ${err}`);
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
    console.error(`[notify-worker-run-summary] request failed for run ${summary.run_id}: ${message}`);
    return { ok: false, reason: message };
  }
}
