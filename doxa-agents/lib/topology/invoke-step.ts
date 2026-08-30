// Deployed to the Deno edge runtime; declare the global for the Next.js tsconfig.
declare const Deno: { env: { get(key: string): string | undefined } };

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

export type StepResult = {
  name: string;
  status: "success" | "failed" | "skipped";
  duration_ms: number;
  http_status?: number;
  result?: Record<string, unknown>;
  error?: string;
  error_detail?: unknown;
};

export async function invokeFunction(
  baseUrl: string,
  serviceRole: string,
  name: string,
  body: Record<string, unknown> = {}
): Promise<{ ok: boolean; http_status: number; data: Record<string, unknown> }> {
  const url = `${baseUrl}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { error: "Invalid JSON response", raw: rawText.slice(0, 500) };
  }
  const data: Record<string, unknown> =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { ok: res.ok, http_status: res.status, data };
}

export function toErrorString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "message" in v && typeof (v as { message?: unknown }).message === "string") {
    return (v as { message: string }).message;
  }
  return String(v);
}

export async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compare via fixed-length digests so length/content differences don't leak timing.
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(presented), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Auth gate for internal-only edge functions deployed with verify_jwt = false.
 * Accepts only the service-role key (what pg_cron, orchestrators, admin
 * routes, and ops scripts send) or an INTERNAL_FN_SECRET override for setups
 * where the caller's key format differs from the function's injected env
 * (e.g. sb_secret_... vs legacy JWT). Returns a 401 Response to short-circuit
 * with, or null when the caller is authorized.
 */
export async function requireInternalAuth(req: Request): Promise<Response | null> {
  const secrets = [
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ...(Deno.env.get("INTERNAL_FN_SECRET") ?? "").split(","),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();

  if (token && secrets.length > 0) {
    for (const secret of secrets) {
      if (await tokenMatches(token, secret)) return null;
    }
  }
  return json({ error: "Unauthorized" }, 401);
}
