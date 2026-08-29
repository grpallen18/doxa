/**
 * Fire-and-forget ping so Slack cards post from the Next.js app (not Edge).
 * No-ops when DOXA_APP_URL / secrets are missing.
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

export async function notifyPendingProposal(proposalUid: string): Promise<void> {
  const appUrl = (
    envGet("DOXA_APP_URL") ||
    envGet("NEXT_PUBLIC_SITE_URL") ||
    "https://doxa-two.vercel.app"
  ).replace(/\/$/, "");
  const secret = envGet("SLACK_NOTIFY_SECRET") || envGet("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !proposalUid) return;
  try {
    await fetch(`${appUrl}/api/slack/notify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ proposal_uid: proposalUid }),
    });
  } catch {
    /* Slack is optional during local/bootstrap */
  }
}
