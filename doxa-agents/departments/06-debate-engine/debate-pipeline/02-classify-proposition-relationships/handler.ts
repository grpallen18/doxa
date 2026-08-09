// Supabase Edge Function: classify_proposition_relationships.
// LLM classify pending pair candidates; write Decision-backed RELATES_TO.
// Marks Issue.dirty when a relationship is accepted.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, NEO4J_*.
// Body: { dry_run?: boolean, limit?: number }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { resolveIssueUid } from "../../../../lib/debate/issue-assignment.ts";
import {
  AUTO_ACCEPT_MIN_CONFIDENCE,
  parsePropositionKind,
  type PropositionRelationshipKind,
} from "../../../../lib/debate/proposition-taxonomy.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_LIMIT = 40;

async function classifyPair(
  apiKey: string,
  model: string,
  textA: string,
  textB: string
): Promise<{ kind: PropositionRelationshipKind; confidence: number; rationale: string }> {
  const system = `Classify the relationship between two political propositions.
Return ONLY JSON: {"kind":"agree|oppose|qualify|broader|narrower|compatible|orthogonal|unrelated|definitional_conflict|talking_past|assumption_conflict","confidence":0.0-1.0,"rationale":"..."}
Prefer under-merge: use unrelated when unsure. High confidence only when clear.`;
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
          content: JSON.stringify({ proposition_a: textA, proposition_b: textB }),
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
  const kind = parsePropositionKind(parsed.kind) ?? "unrelated";
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  return {
    kind,
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
  const limit = clampInt(body.limit, 1, 200, DEFAULT_LIMIT);

  const pending = await runCypher<{
    decisionUid: string;
    a: string;
    b: string;
    textA: string;
    textB: string;
    topicKey: string;
    blockReason: string | null;
    entityUid: string | null;
    issueUid: string | null;
  }>(
    `
    MATCH (dec:Decision {decisionType: 'proposition_pair_candidate', status: 'pending'})-[:ABOUT]->(pa:Proposition)
    MATCH (dec)-[:ABOUT]->(pb:Proposition)
    WHERE pa.uid < pb.uid
    RETURN dec.uid AS decisionUid,
           pa.uid AS a,
           pb.uid AS b,
           coalesce(pa.text, pa.normalizedText, '') AS textA,
           coalesce(pb.text, pb.normalizedText, '') AS textB,
           coalesce(dec.topicKey, 'general') AS topicKey,
           dec.blockReason AS blockReason,
           dec.entityUid AS entityUid,
           dec.issueUid AS issueUid
    LIMIT $limit
    `,
    { limit }
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, pending: pending.length });
  }

  let accepted = 0;
  let quarantined = 0;
  let skipped = 0;
  let issuesDirtied = 0;

  for (const row of pending) {
    let classified: {
      kind: PropositionRelationshipKind;
      confidence: number;
      rationale: string;
    };
    try {
      classified = await classifyPair(OPENAI_API_KEY, MODEL, row.textA, row.textB);
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
      classified.confidence >= AUTO_ACCEPT_MIN_CONFIDENCE &&
      classified.kind !== "unrelated"
        ? "accepted"
        : "quarantined";
    if (status === "accepted") accepted += 1;
    else quarantined += 1;

    let entityUid = row.entityUid;
    if (!entityUid?.trim()) {
      const shared = await runCypher<{ uid: string }>(
        `
        MATCH (pa:Proposition {uid: $a})<-[:EXPRESSES]-(:Utterance)-[:MENTIONS]->(e:Entity)
          <-[:MENTIONS]-(:Utterance)-[:EXPRESSES]->(pb:Proposition {uid: $b})
        RETURN e.uid AS uid
        ORDER BY e.uid
        LIMIT 1
        `,
        { a: row.a, b: row.b }
      );
      entityUid = shared[0]?.uid ?? null;
    }

    const resolvedIssueUid = resolveIssueUid({
      blockReason: entityUid ? "shared_entity" : row.blockReason,
      entityUid,
      topicKey: row.topicKey,
    });
    // Prefer entity bucket when known — do not keep a prior sim issueUid.
    const issueUid = entityUid?.trim()
      ? resolvedIssueUid
      : row.issueUid?.trim() || resolvedIssueUid;

    const relDecisionUid = `prel:${row.a}:${row.b}`;
    await runCypher(
      `
      MATCH (pa:Proposition {uid: $a})
      MATCH (pb:Proposition {uid: $b})
      MATCH (cand:Decision {uid: $candUid})
      SET cand.status = 'consumed',
          cand.updatedAt = datetime(),
          cand.entityUid = coalesce($entityUid, cand.entityUid),
          cand.issueUid = $issueUid
      MERGE (dec:Decision {uid: $relUid})
      SET dec.decisionType = 'proposition_relationship',
          dec.kind = $kind,
          dec.confidence = $confidence,
          dec.rationale = $rationale,
          dec.status = $status,
          dec.actor = 'model',
          dec.topicKey = $topicKey,
          dec.issueUid = $issueUid,
          dec.entityUid = coalesce($entityUid, dec.entityUid),
          dec.createdAt = coalesce(dec.createdAt, datetime()),
          dec.updatedAt = datetime()
      MERGE (dec)-[:ABOUT]->(pa)
      MERGE (dec)-[:ABOUT]->(pb)
      MERGE (iss:Issue {uid: $issueUid})
      ON CREATE SET
        iss.topicKey = $topicKey,
        iss.schemaVersion = '2.3.0',
        iss.createdAt = datetime(),
        iss.dirty = false
      SET iss.topicKey = coalesce(iss.topicKey, $topicKey),
          iss.updatedAt = datetime()
      MERGE (pa)-[:IN_ISSUE]->(iss)
      MERGE (pb)-[:IN_ISSUE]->(iss)
      WITH pa, pb, dec, iss, $kind AS kind, $status AS status
      FOREACH (_ IN CASE WHEN status = 'accepted' THEN [1] ELSE [] END |
        MERGE (pa)-[r:RELATES_TO]->(pb)
        SET r.kind = kind,
            r.decisionUid = dec.uid,
            r.updatedAt = datetime()
      )
      FOREACH (_ IN CASE WHEN status = 'accepted' THEN [1] ELSE [] END |
        SET iss.dirty = true, iss.updatedAt = datetime()
      )
      `,
      {
        a: row.a,
        b: row.b,
        candUid: row.decisionUid,
        relUid: relDecisionUid,
        kind: classified.kind,
        confidence: classified.confidence,
        rationale: classified.rationale,
        status,
        topicKey: row.topicKey,
        issueUid,
        entityUid: entityUid ?? null,
      }
    );

    if (entityUid?.trim()) {
      await runCypher(
        `
        MATCH (pa:Proposition {uid: $a})
        MATCH (pb:Proposition {uid: $b})
        MATCH (iss:Issue {uid: $issueUid})
        OPTIONAL MATCH (pa)-[r1:IN_ISSUE]->(old1:Issue)
        WHERE old1.uid <> iss.uid AND old1.uid STARTS WITH 'issue:sim:'
        DELETE r1
        WITH pb, iss
        OPTIONAL MATCH (pb)-[r2:IN_ISSUE]->(old2:Issue)
        WHERE old2.uid <> iss.uid AND old2.uid STARTS WITH 'issue:sim:'
        DELETE r2
        `,
        { a: row.a, b: row.b, issueUid }
      );
    }
    if (status === "accepted") issuesDirtied += 1;
  }

  return json({
    ok: true,
    processed: pending.length,
    accepted,
    quarantined,
    skipped,
    issues_dirtied: issuesDirtied,
  });
};
