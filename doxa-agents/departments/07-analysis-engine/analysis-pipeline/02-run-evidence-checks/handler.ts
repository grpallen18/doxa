// Supabase Edge Function: run_evidence_checks.
// LLM EvidenceCheck for pending candidates; Decision + EvidenceCheck nodes.
// Env: NEO4J_*, OPENAI_API_KEY. Body: { dry_run?: boolean, limit?: number }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import {
  ANALYSIS_AUTO_ACCEPT_MIN_CONFIDENCE,
  parseEvidenceVerdict,
  type EvidenceVerdict,
} from "../../../../lib/debate/analysis-taxonomy.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_LIMIT = 20;

async function checkEvidence(
  apiKey: string,
  model: string,
  propText: string,
  segText: string
): Promise<{ verdict: EvidenceVerdict; confidence: number; rationale: string }> {
  const system = `You judge whether a text segment supports a proposition.
Return ONLY JSON: {"verdict":"supported|weak|unsupported|not_applicable","confidence":0.0-1.0,"rationale":"..."}
Prefer under-claim: use unsupported or weak when unsure. not_applicable if segment is off-topic.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({ proposition: propText, segment: segText }),
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const verdict = parseEvidenceVerdict(parsed.verdict) ?? "not_applicable";
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  return {
    verdict,
    confidence,
    rationale: String(parsed.rationale ?? "").slice(0, 500),
  };
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
  if (!OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const limit = clampInt(body.limit, 1, 100, DEFAULT_LIMIT);

  try {
    const pending = await runCypher<{
      decisionUid: string;
      propositionUid: string;
      segmentUid: string;
      propText: string;
      segText: string;
    }>(
      `
      MATCH (dec:Decision {decisionType: 'evidence_check_candidate', status: 'pending'})-[:ABOUT]->(p:Proposition)
      MATCH (dec)-[:ABOUT]->(seg:Segment)
      RETURN dec.uid AS decisionUid,
             p.uid AS propositionUid,
             seg.uid AS segmentUid,
             coalesce(p.text, p.normalizedText, '') AS propText,
             coalesce(seg.text, '') AS segText
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, pending: pending.length });
    }

    const methodRunUid = `mrun:evidence_check:${new Date().toISOString()}`;
    await runCypher(
      `
      MERGE (m:MethodRun {uid: $uid})
      SET m.methodId = 'evidence_check',
          m.model = $model,
          m.schemaVersion = '3.0.0',
          m.createdAt = coalesce(m.createdAt, datetime()),
          m.updatedAt = datetime()
      `,
      { uid: methodRunUid, model: MODEL }
    );

    let accepted = 0;
    let quarantined = 0;
    let skipped = 0;

    for (const row of pending) {
      let result: { verdict: EvidenceVerdict; confidence: number; rationale: string };
      try {
        result = await checkEvidence(OPENAI_API_KEY, MODEL, row.propText, row.segText);
      } catch (err) {
        skipped += 1;
        await runCypher(
          `
          MATCH (cand:Decision {uid: $candUid})
          SET cand.status = 'failed',
              cand.error = $error,
              cand.updatedAt = datetime()
          `,
          {
            candUid: row.decisionUid,
            error: String(err instanceof Error ? err.message : err).slice(0, 400),
          }
        );
        continue;
      }

      const status =
        result.confidence >= ANALYSIS_AUTO_ACCEPT_MIN_CONFIDENCE ? "accepted" : "quarantined";
      if (status === "accepted") accepted += 1;
      else quarantined += 1;

      const checkUid = `echeck:${row.propositionUid}:${row.segmentUid}`;
      const relUid = `echeckdec:${row.propositionUid}:${row.segmentUid}`;

      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})
        MATCH (seg:Segment {uid: $segUid})
        MATCH (cand:Decision {uid: $candUid})
        MATCH (m:MethodRun {uid: $methodRunUid})
        SET cand.status = 'consumed', cand.updatedAt = datetime()
        MERGE (dec:Decision {uid: $relUid})
        SET dec.decisionType = 'evidence_check',
            dec.verdict = $verdict,
            dec.confidence = $confidence,
            dec.rationale = $rationale,
            dec.status = $status,
            dec.actor = 'model',
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(seg)
        WITH p, seg, dec, m, $status AS status, $verdict AS verdict,
             $confidence AS confidence, $rationale AS rationale, $checkUid AS checkUid
        FOREACH (_ IN CASE WHEN status = 'accepted' THEN [1] ELSE [] END |
          MERGE (ec:EvidenceCheck {uid: checkUid})
          SET ec.verdict = verdict,
              ec.confidence = confidence,
              ec.rationale = rationale,
              ec.propositionUid = p.uid,
              ec.segmentUid = seg.uid,
              ec.schemaVersion = '3.0.0',
              ec.updatedAt = datetime(),
              ec.createdAt = coalesce(ec.createdAt, datetime())
          MERGE (ec)-[:CHECKS]->(p)
          MERGE (ec)-[:GROUNDED_IN]->(seg)
          MERGE (ec)-[:PRODUCED_BY]->(m)
          MERGE (ec)-[:DECIDED_BY]->(dec)
        )
        `,
        {
          propUid: row.propositionUid,
          segUid: row.segmentUid,
          candUid: row.decisionUid,
          methodRunUid,
          relUid,
          checkUid,
          verdict: result.verdict,
          confidence: result.confidence,
          rationale: result.rationale,
          status,
        }
      );
    }

    return json({
      ok: true,
      processed: pending.length,
      accepted,
      quarantined,
      skipped,
      methodRunUid,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[run_evidence_checks]", message);
    return json({ error: message }, 500);
  }
};
