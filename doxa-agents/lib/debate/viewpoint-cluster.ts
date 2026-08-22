/**
 * Viewpoint clustering inside (Question, polarity) via LLM key-points + match.
 */

import {
  EMBEDDING_MODEL,
  embedTexts,
  cosineSimilarity,
  type AnswerPolarity,
} from "./question-identity.ts";
import { ESTABLISH_MIN_CONFIDENCE } from "./qualify-controversy.ts";

export const VIEWPOINT_SCHEMA_VERSION = "3.0.0-viewpoint";
export const KEYPOINT_SAME_MIN = 0.75;
export const KEYPOINT_ADJACENT_BLOCK = 0.55;

export type ThesisInput = {
  propUid: string;
  text: string;
};

export type ExtractedKeyPoint = {
  propUid: string;
  keyPoint: string;
  confidence: number;
};

export type ViewpointCluster = {
  keyPoint: string;
  summary: string;
  memberPropUids: string[];
  confidence: number;
};

export type ClusterInput = {
  question: string;
  polarity: AnswerPolarity | string;
  theses: ThesisInput[];
};

async function extractOneKeyPoint(
  apiKey: string,
  model: string,
  question: string,
  polarity: string,
  thesis: string
): Promise<{ keyPoint: string; confidence: number }> {
  const system = `Extract the recurring reason (key point) this proposition expresses toward a frozen contested question.
Return ONLY JSON: {"keyPoint":"...","confidence":0.0-1.0}
Rules:
- keyPoint is ≤12 words, a recurring reason not a headline repeat.
- Capture the side's reason toward the question at polarity ${polarity}.
- Prefer under-claim.`;
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
        { role: "user", content: JSON.stringify({ question, polarity, proposition: thesis }) },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI keypoint ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return {
    keyPoint: String(parsed.keyPoint ?? "").trim().slice(0, 120),
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  };
}

async function adjudicateKeyPoints(
  apiKey: string,
  model: string,
  a: string,
  b: string
): Promise<{ label: "same" | "adjacent" | "unrelated"; confidence: number }> {
  const system = `Compare two key points (recurring reasons) about the same contested question side.
Return ONLY JSON: {"label":"same|adjacent|unrelated","confidence":0.0-1.0}
- same = paraphrase of the same reason (merge into one Viewpoint)
- adjacent = related but distinct reasons (keep separate — e.g. deterrence vs burden-sharing)
- unrelated = different reasons
Prefer adjacent over same when unsure.`;
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
        { role: "user", content: JSON.stringify({ key_point_a: a, key_point_b: b }) },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI kp-adj ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const labelRaw = String(parsed.label ?? "unrelated").toLowerCase();
  const label =
    labelRaw === "same" || labelRaw === "adjacent" || labelRaw === "unrelated"
      ? labelRaw
      : "unrelated";
  return {
    label,
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  };
}

/** Greedy cluster on pre-extracted key points (testable without LLM). */
export async function clusterExtractedKeyPoints(
  apiKey: string,
  items: ExtractedKeyPoint[],
  adjudicate: typeof adjudicateKeyPoints = adjudicateKeyPoints,
  model = "gpt-4o-mini"
): Promise<ViewpointCluster[]> {
  if (!items.length) return [];
  if (items.length === 1) {
    const i = items[0];
    return [
      {
        keyPoint: i.keyPoint,
        summary: i.keyPoint,
        memberPropUids: [i.propUid],
        confidence: i.confidence,
      },
    ];
  }

  const embeddings = await embedTexts(
    apiKey,
    items.map((i) => i.keyPoint || " "),
    EMBEDDING_MODEL
  );

  type ClusterState = {
    keyPoint: string;
    summary: string;
    memberPropUids: string[];
    confidence: number;
    embedding: number[];
  };

  const clusters: ClusterState[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const emb = embeddings[i] ?? [];
    if (!item.keyPoint.trim()) continue;

    let merged = false;
    for (const cluster of clusters) {
      const cos = cosineSimilarity(emb, cluster.embedding);
      if (cos < 0.35) continue;
      const adj = await adjudicate(apiKey, model, item.keyPoint, cluster.keyPoint);
      if (adj.label === "adjacent" && adj.confidence >= KEYPOINT_ADJACENT_BLOCK) {
        continue;
      }
      if (adj.label === "same" && adj.confidence >= KEYPOINT_SAME_MIN) {
        cluster.memberPropUids.push(item.propUid);
        cluster.confidence = Math.min(cluster.confidence, item.confidence);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        keyPoint: item.keyPoint,
        summary: item.keyPoint,
        memberPropUids: [item.propUid],
        confidence: item.confidence,
        embedding: emb,
      });
    }
  }

  return clusters.map(({ keyPoint, summary, memberPropUids, confidence }) => ({
    keyPoint,
    summary,
    memberPropUids,
    confidence,
  }));
}

export async function clusterThesesIntoViewpoints(
  apiKey: string,
  input: ClusterInput,
  model = "gpt-4o-mini"
): Promise<ViewpointCluster[]> {
  const extracted: ExtractedKeyPoint[] = [];
  for (const thesis of input.theses) {
    if (!thesis.text.trim()) continue;
    try {
      const kp = await extractOneKeyPoint(
        apiKey,
        model,
        input.question,
        String(input.polarity),
        thesis.text
      );
      if (kp.keyPoint && kp.confidence >= ESTABLISH_MIN_CONFIDENCE - 0.1) {
        extracted.push({ propUid: thesis.propUid, keyPoint: kp.keyPoint, confidence: kp.confidence });
      }
    } catch {
      /* skip thesis on extract failure */
    }
  }
  return clusterExtractedKeyPoints(apiKey, extracted, adjudicateKeyPoints, model);
}
