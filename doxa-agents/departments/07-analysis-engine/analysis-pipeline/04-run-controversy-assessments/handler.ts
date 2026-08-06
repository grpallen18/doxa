// Supabase Edge Function: run_controversy_assessments.
// Assessment + MethodRun for Controversies (analyzed, not extracted facts).
// Env: NEO4J_*, OPENAI_API_KEY. Body: { dry_run?: boolean, limit?: number }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import {
  ANALYSIS_AUTO_ACCEPT_MIN_CONFIDENCE,
  parseAssessmentKind,
  type AssessmentKind,
} from "../../../../lib/debate/analysis-taxonomy.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_LIMIT = 10;

async function assessControversy(
  apiKey: string,
  model: string,
  title: string,
  summary: string,
  sides: number
): Promise<{ kind: AssessmentKind; summary: string; confidence: number }> {
  const system = `You write a short analytical assessment of a multi-sided controversy.
Return ONLY JSON: {"kind":"framing|strength|coherence|other","summary":"...","confidence":0.0-1.0}
This is model analysis, not a factual claim. Use confidence 0.75-0.9 when the title/summary clearly describe opposing sides; use below 0.75 only when input is empty or incoherent.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({ title, summary, sides_count: sides }),
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
  const kind = parseAssessmentKind(parsed.kind) ?? "other";
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  return {
    kind,
    summary: String(parsed.summary ?? "").slice(0, 800),
    confidence,
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
  const limit = clampInt(body.limit, 1, 50, DEFAULT_LIMIT);

  try {
    const controversies = await runCypher<{
      uid: string;
      title: string;
      summary: string;
      sidesCount: number;
    }>(
      `
      MATCH (c:Controversy)
      WHERE NOT EXISTS {
        MATCH (a:Assessment {targetUid: c.uid, targetKind: 'controversy'})
      }
      AND NOT EXISTS {
        MATCH (d:Decision {decisionType: 'assessment'})-[:ABOUT]->(c)
        WHERE d.status = 'accepted' OR coalesce(d.attempts, 0) >= 3
      }
      RETURN c.uid AS uid,
             coalesce(c.title, c.uid) AS title,
             coalesce(c.summary, '') AS summary,
             coalesce(c.sidesCount, 0) AS sidesCount
      ORDER BY c.updatedAt DESC
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, pending: controversies.length });
    }

    const methodRunUid = `mrun:controversy_assessment:${new Date().toISOString()}`;
    await runCypher(
      `
      MERGE (m:MethodRun {uid: $uid})
      SET m.methodId = 'controversy_assessment',
          m.model = $model,
          m.schemaVersion = '3.0.0',
          m.createdAt = coalesce(m.createdAt, datetime()),
          m.updatedAt = datetime()
      `,
      { uid: methodRunUid, model: MODEL }
    );

    let written = 0;
    let quarantined = 0;
    let skipped = 0;

    for (const c of controversies) {
      let result: { kind: AssessmentKind; summary: string; confidence: number };
      try {
        result = await assessControversy(
          OPENAI_API_KEY,
          MODEL,
          c.title,
          c.summary,
          Number(c.sidesCount) || 0
        );
      } catch (err) {
        skipped += 1;
        console.error("[run_controversy_assessments]", err);
        const failUid = `assessdec:controversy:${c.uid}`.slice(0, 200);
        try {
          await runCypher(
            `
            MATCH (c:Controversy {uid: $targetUid})
            MERGE (dec:Decision {uid: $decUid})
            ON CREATE SET
              dec.decisionType = 'assessment',
              dec.actor = 'model',
              dec.attempts = 0,
              dec.createdAt = datetime()
            SET dec.status = 'failed',
                dec.attempts = coalesce(dec.attempts, 0) + 1,
                dec.error = $error,
                dec.updatedAt = datetime()
            MERGE (dec)-[:ABOUT]->(c)
            `,
            {
              targetUid: c.uid,
              decUid: failUid,
              error: String(err instanceof Error ? err.message : err).slice(0, 400),
            }
          );
        } catch (persistErr) {
          console.error("[run_controversy_assessments] fail persist", persistErr);
        }
        continue;
      }

      const status =
        result.confidence >= ANALYSIS_AUTO_ACCEPT_MIN_CONFIDENCE && result.summary
          ? "accepted"
          : "quarantined";
      if (status === "accepted") written += 1;
      else quarantined += 1;

      const assessUid = `assess:controversy:${c.uid}`.slice(0, 200);
      const decUid = `assessdec:controversy:${c.uid}`.slice(0, 200);

      await runCypher(
        `
        MATCH (c:Controversy {uid: $targetUid})
        MATCH (m:MethodRun {uid: $methodRunUid})
        MERGE (dec:Decision {uid: $decUid})
        ON CREATE SET
          dec.decisionType = 'assessment',
          dec.actor = 'model',
          dec.attempts = 0,
          dec.createdAt = datetime()
        SET dec.status = $status,
            dec.kind = $kind,
            dec.confidence = $confidence,
            dec.summary = $summary,
            dec.attempts = coalesce(dec.attempts, 0) + 1,
            dec.methodRunUid = $methodRunUid,
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(c)
        WITH c, m, dec, $status AS status, $kind AS kind, $summary AS summary,
             $confidence AS confidence, $targetUid AS targetUid, $assessUid AS assessUid
        FOREACH (_ IN CASE WHEN status = 'accepted' THEN [1] ELSE [] END |
          MERGE (a:Assessment {uid: assessUid})
          SET a.kind = kind,
              a.summary = summary,
              a.confidence = confidence,
              a.targetKind = 'controversy',
              a.targetUid = targetUid,
              a.schemaVersion = '3.0.0',
              a.layer = 'analyzed',
              a.updatedAt = datetime(),
              a.createdAt = coalesce(a.createdAt, datetime())
          MERGE (a)-[:ABOUT]->(c)
          MERGE (a)-[:PRODUCED_BY]->(m)
          MERGE (a)-[:DECIDED_BY]->(dec)
        )
        `,
        {
          targetUid: c.uid,
          methodRunUid,
          decUid,
          assessUid,
          kind: result.kind,
          summary: result.summary,
          confidence: result.confidence,
          status,
        }
      );
    }

    return json({
      ok: true,
      methodRunUid,
      written,
      quarantined,
      skipped,
      scanned: controversies.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[run_controversy_assessments]", message);
    return json({ error: message }, 500);
  }
};
