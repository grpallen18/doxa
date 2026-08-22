// Supabase Edge Function: label_cq_gold_batch.
// Draft-labels thesis-like propositions for docs/gold review.
// Body: { rows: [{ proposition_uid, text, speech_acts, has_roles }] }
// Env: OPENAI_API_KEY, optional OPENAI_MODEL
// JWT-off (service-role ops).

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";

const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM = `You label news propositions for a contested-question gold set.
Return ONLY JSON: {"labels":[{...},...]} with one object per input row, **same order**, each including proposition_uid copied from input.

Required fields on every label object:
- proposition_uid (must match input)
- debate_role: thesis | premise | background
  thesis = can found/answer a contested question (prescription, judgment as evaluation, allegation as charge, contested prediction)
  premise = evidence/support for some thesis, not a side by itself
  background = thin personal color, sports, pure reporting, wishes of health, empty rhetoric
- question: one specific interrogative this proposition answers, or "none"
  Prefer policy/factual/causal questions people argue. Never a bare entity ("Ukraine"). Not "What happened?"
- question_type: policy | factual | causal | definitional | "" if question is none
- exclusivity: exclusive | compatible | unknown | "" if none
  exclusive = answers cannot all be true (primary cause; binary should/shouldn't)
  compatible = multiple answers can coexist (contributing factors)
- polarity toward that question:
  policy: FAVOR | AGAINST | QUALIFY | NONE
  factual: AFFIRMS | DENIES | UNCERTAIN | NONE
  causal: AFFIRMS/DENIES if asserting a cause else NONE
  use NONE for premise when not taking a side; empty for background with question=none
- key_point: short recurring reason if thesis (≤12 words), else ""
- notes: brief caveat if ambiguous, else ""

Be conservative: if unsure the prop is debate-worthy, use background and question=none.
Prefer under-claim on question specificity.`;

type InRow = {
  proposition_uid: string;
  text: string;
  speech_acts: string;
  has_roles: string;
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const model = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
  if (!apiKey) return json({ error: "Missing OPENAI_API_KEY" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const rows = Array.isArray(body.rows) ? (body.rows as InRow[]) : [];
  if (!rows.length || rows.length > 25) {
    return json({ error: "rows required (1–25)" }, 400);
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify({ rows }) },
      ],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    return json({ error: `OpenAI ${resp.status}`, detail: errText.slice(0, 500) }, 502);
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { labels?: unknown[] } = {};
  try {
    parsed = JSON.parse(raw) as { labels?: unknown[] };
  } catch {
    return json({ error: "bad model JSON", raw: raw.slice(0, 300) }, 502);
  }
  return json({ ok: true, labels: parsed.labels ?? [], model });
};
