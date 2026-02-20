// Supabase Edge Function: process_topic.
// Creates or processes a topic: LLM description, embed, link controversies, synthesize summary, re-embed, topic-to-topic links.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { title?: string, topic_id?: string }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_DIMS = 1536;
const CONTROVERSY_LINK_SIMILARITY = 0.50;
const CONTROVERSY_MATCH_COUNT = 50;
const TOPIC_LINK_SIMILARITY = 0.70;
const TOPIC_MATCH_COUNT = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "topic";
}

async function getEmbedding(apiKey: string, text: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: text, model }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embeddings ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== DEFAULT_EMBEDDING_DIMS) {
    throw new Error("Invalid embedding response");
  }
  return emb;
}

function embeddingToString(emb: number[]): string {
  return `[${emb.join(",")}]`;
}

async function expandDescription(apiKey: string, model: string, title: string): Promise<string> {
  const system = `Given this topic title, produce a concise factual description (2-4 sentences) suitable for semantic search.
Include key entities, context, and related concepts. Neutral tone. Output only the description. No preamble.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: title },
      ],
      max_tokens: 200,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Missing OpenAI content");
  return content.trim();
}

async function synthesizeSummary(
  apiKey: string,
  model: string,
  topicTitle: string,
  inputTexts: string[]
): Promise<string> {
  const system = `Synthesize these debate questions and viewpoint summaries into a 1,000-1,500 word neutral summary for the topic.
Be factual and descriptive. Use markdown for structure: ### for section headers (e.g. ### Overview, ### Key debates, ### Recent developments).
Output only the summary. No preamble.`;

  const userContent = `Topic: ${topicTitle}\n\nDebate points and viewpoints:\n${inputTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_tokens: 2500,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Missing OpenAI content");
  return content.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
  const CHAT_MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch {
    // use defaults
  }

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const topicId = typeof body.topic_id === "string" ? body.topic_id : undefined;
  const preview = Boolean(body.preview);
  const confirm = Boolean(body.confirm);
  const checkSimilar = Boolean(body.check_similar);

  if (!title && !topicId && !checkSimilar) {
    return json({ error: "Provide title or topic_id" }, 400);
  }
  if (checkSimilar && !title) {
    return json({ error: "check_similar requires title" }, 400);
  }
  if (confirm && !topicId) {
    return json({ error: "confirm requires topic_id" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // check_similar mode: embed title, return similar topics + controversies count (no create)
  if (checkSimilar && title) {
    try {
      const description = await expandDescription(OPENAI_API_KEY, CHAT_MODEL, title);
      const textToEmbed = description || title;
      const embedding = await getEmbedding(OPENAI_API_KEY, textToEmbed, EMBEDDING_MODEL);

      const [controversyRes, topicRes] = await Promise.all([
        supabase.rpc("match_controversies_nearest", {
          query_embedding: embeddingToString(embedding),
          match_count: CONTROVERSY_MATCH_COUNT,
          min_similarity: CONTROVERSY_LINK_SIMILARITY,
        }),
        supabase.rpc("match_topics_nearest", {
          query_embedding: embeddingToString(embedding),
          exclude_topic_id: null,
          match_count: 5,
          min_similarity: 0.85,
        }),
      ]);

      const controversyMatches = (Array.isArray(controversyRes.data) ? controversyRes.data : []) as Array<{ controversy_cluster_id: string }>;
      const topicMatches = (Array.isArray(topicRes.data) ? topicRes.data : []) as Array<{
        topic_id: string;
        similarity: number;
      }>;

      let similarTopics: Array<{ topic_id: string; title: string; slug: string; similarity: number }> = [];
      if (topicMatches.length > 0) {
        const ids = topicMatches.map((m) => m.topic_id);
        const { data: topicRows } = await supabase
          .from("topics")
          .select("topic_id, title, slug")
          .in("topic_id", ids);
        const map = new Map(
          (topicRows ?? []).map((t) => [(t as { topic_id: string }).topic_id, t as { topic_id: string; title: string; slug: string }])
        );
        similarTopics = topicMatches
          .map((m) => {
            const row = map.get(m.topic_id);
            return row ? { ...row, similarity: m.similarity } : null;
          })
          .filter((r): r is { topic_id: string; title: string; slug: string; similarity: number } => r != null);
      }

      return json({
        check_similar: true,
        controversies_count: controversyMatches.length,
        similar_topics: similarTopics,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[process_topic] check_similar error:", msg);
      return json({ error: msg }, 500);
    }
  }

  let currentTopicId = topicId;
  let currentTitle = title;

  try {
    // Step 1: Create topic (if title provided) - skip in confirm mode
    if (title && !confirm) {
      const slug = slugify(title);
      const { data: inserted, error: insertErr } = await supabase
        .from("topics")
        .insert({
          slug,
          title,
          status: "draft",
          metadata: {},
        })
        .select("topic_id, title")
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
          const { data: retry, error: retryErr } = await supabase
            .from("topics")
            .insert({
              slug: uniqueSlug,
              title,
              status: "draft",
              metadata: {},
            })
            .select("topic_id, title")
            .single();
          if (retryErr) {
            console.error("[process_topic] Insert retry error:", retryErr.message);
            return json({ error: retryErr.message }, 500);
          }
          currentTopicId = (retry as { topic_id: string }).topic_id;
          currentTitle = (retry as { title: string }).title;
        } else {
          console.error("[process_topic] Insert error:", insertErr.message);
          return json({ error: insertErr.message }, 500);
        }
      } else {
        currentTopicId = (inserted as { topic_id: string }).topic_id;
        currentTitle = (inserted as { title: string }).title;
      }
      console.log("[process_topic] Created topic:", currentTopicId);
    } else {
      const { data: topic, error: fetchErr } = await supabase
        .from("topics")
        .select("topic_id, title, topic_description, topic_embedding, summary")
        .eq("topic_id", currentTopicId!)
        .single();

      if (fetchErr || !topic) {
        return json({ error: "Topic not found" }, 404);
      }
      currentTitle = (topic as { title: string }).title;
    }

    // Confirm mode: skip steps 2-3, use existing topic_embedding
    let embedding: number[] | null = null;
    if (confirm) {
      const { data: topicRow } = await supabase
        .from("topics")
        .select("topic_embedding")
        .eq("topic_id", currentTopicId!)
        .single();
      const raw = (topicRow as { topic_embedding: unknown } | null)?.topic_embedding;
      if (!raw) {
        return json({ error: "Topic has no embedding; run preview first" }, 400);
      }
      embedding = Array.isArray(raw) ? raw : (JSON.parse(String(raw)) as number[]);
    }

    if (!confirm) {
      // Step 2: Expand description (if topic_description is null)
      const { data: topicRow } = await supabase
        .from("topics")
        .select("topic_description")
        .eq("topic_id", currentTopicId!)
        .single();

      let description = (topicRow as { topic_description: string | null } | null)?.topic_description ?? null;
      if (!description) {
        console.log("[process_topic] Expanding description");
        description = await expandDescription(OPENAI_API_KEY, CHAT_MODEL, currentTitle!);
        const { error: upErr } = await supabase
          .from("topics")
          .update({ topic_description: description })
          .eq("topic_id", currentTopicId!);
        if (upErr) {
          console.error("[process_topic] Update description error:", upErr.message);
          return json({ error: upErr.message, step: "expand_description" }, 500);
        }
      }

      // Step 3: Embed and store
      const textToEmbed = description || currentTitle!;
      console.log("[process_topic] Embedding");
      embedding = await getEmbedding(OPENAI_API_KEY, textToEmbed, EMBEDDING_MODEL);
      const { error: embedErr } = await supabase
        .from("topics")
        .update({ topic_embedding: embeddingToString(embedding) })
        .eq("topic_id", currentTopicId!);
      if (embedErr) {
        console.error("[process_topic] Update embedding error:", embedErr.message);
        return json({ error: embedErr.message, step: "embed" }, 500);
      }
    }

    // Step 4: Find/link controversies
    const { data: controversyMatches, error: rpcErr } = await supabase.rpc("match_controversies_nearest", {
      query_embedding: embeddingToString(embedding),
      match_count: CONTROVERSY_MATCH_COUNT,
      min_similarity: CONTROVERSY_LINK_SIMILARITY,
    });

    if (rpcErr) {
      console.error("[process_topic] match_controversies_nearest error:", rpcErr.message);
      return json({ error: rpcErr.message, step: "link_controversies" }, 500);
    }

    const matches = (Array.isArray(controversyMatches) ? controversyMatches : []) as Array<{
      controversy_cluster_id: string;
      distance: number;
      similarity: number;
    }>;

    // Preview mode: return controversies count and list without inserting
    if (preview) {
      const controversyIds = matches.map((m) => m.controversy_cluster_id);
      let controversiesWithQuestion: Array<{ controversy_cluster_id: string; question: string | null; similarity: number }> = matches.map(
        (m) => ({ controversy_cluster_id: m.controversy_cluster_id, question: null as string | null, similarity: m.similarity })
      );
      if (controversyIds.length > 0) {
        const { data: ccData } = await supabase
          .from("controversy_clusters")
          .select("controversy_cluster_id, question")
          .in("controversy_cluster_id", controversyIds);
        const questionMap = new Map(
          (ccData ?? []).map((c) => [(c as { controversy_cluster_id: string }).controversy_cluster_id, (c as { question: string | null }).question])
        );
        controversiesWithQuestion = matches.map((m) => ({
          controversy_cluster_id: m.controversy_cluster_id,
          question: questionMap.get(m.controversy_cluster_id) ?? null,
          similarity: m.similarity,
        }));
      }
      return json({
        preview: true,
        topic_id: currentTopicId,
        controversies_count: matches.length,
        controversies: controversiesWithQuestion,
      });
    }

    await supabase.from("topic_controversies").delete().eq("topic_id", currentTopicId!);

    if (matches.length > 0) {
      const inserts = matches.map((m, i) => ({
        topic_id: currentTopicId,
        controversy_cluster_id: m.controversy_cluster_id,
        similarity_score: m.similarity,
        rank: i + 1,
      }));
      const { error: insErr } = await supabase.from("topic_controversies").insert(inserts);
      if (insErr) {
        console.error("[process_topic] Insert topic_controversies error:", insErr.message);
        return json({ error: insErr.message, step: "link_controversies" }, 500);
      }
      console.log("[process_topic] Linked", matches.length, "controversies");
    }

    // Step 5: Synthesize summary (if linked controversies exist)
    let summary: string | null = null;
    if (matches.length > 0) {
      const { data: tcRows } = await supabase
        .from("topic_controversies")
        .select("controversy_cluster_id, rank")
        .eq("topic_id", currentTopicId!)
        .order("rank", { ascending: true });

      const orderedControversyIds = (tcRows ?? []).map((r) => (r as { controversy_cluster_id: string }).controversy_cluster_id);

      const inputTexts: string[] = [];
      for (const cid of orderedControversyIds) {
        const { data: ccRow } = await supabase
          .from("controversy_clusters")
          .select("question, summary")
          .eq("controversy_cluster_id", cid)
          .single();
        if (ccRow) {
          const q = ((ccRow as { question?: string }).question ?? "").trim();
          const s = ((ccRow as { summary?: string }).summary ?? "").trim();
          if (q) inputTexts.push(q);
          if (s) inputTexts.push(s);
        }
        const { data: vpRows } = await supabase
          .from("controversy_viewpoints")
          .select("summary")
          .eq("controversy_cluster_id", cid);
        for (const vp of vpRows ?? []) {
          const vpSummary = ((vp as { summary?: string }).summary ?? "").trim();
          if (vpSummary) inputTexts.push(vpSummary);
        }
      }

      if (inputTexts.length > 0) {
        console.log("[process_topic] Synthesizing summary");
        summary = await synthesizeSummary(OPENAI_API_KEY, CHAT_MODEL, currentTitle!, inputTexts);
        const { error: sumErr } = await supabase
          .from("topics")
          .update({ summary })
          .eq("topic_id", currentTopicId!);
        if (sumErr) {
          console.error("[process_topic] Update summary error:", sumErr.message);
          return json({ error: sumErr.message, step: "synthesize_summary" }, 500);
        }
      }
    }

    // Step 6: Re-embed full topic
    const fullText = summary ? `${currentTitle}\n\n${summary}` : currentTitle!;
    console.log("[process_topic] Re-embedding");
    const fullEmbedding = await getEmbedding(OPENAI_API_KEY, fullText, EMBEDDING_MODEL);
    const { error: reEmbedErr } = await supabase
      .from("topics")
      .update({ topic_embedding: embeddingToString(fullEmbedding) })
      .eq("topic_id", currentTopicId!);
    if (reEmbedErr) {
      console.error("[process_topic] Re-embed error:", reEmbedErr.message);
      return json({ error: reEmbedErr.message, step: "re_embed" }, 500);
    }

    // Step 7: Topic-to-topic links
    await supabase
      .from("topic_relationships")
      .delete()
      .or(`source_topic_id.eq.${currentTopicId},target_topic_id.eq.${currentTopicId}`);

    const { data: topicMatches, error: topicRpcErr } = await supabase.rpc("match_topics_nearest", {
      query_embedding: embeddingToString(fullEmbedding),
      exclude_topic_id: currentTopicId,
      match_count: TOPIC_MATCH_COUNT,
      min_similarity: TOPIC_LINK_SIMILARITY,
    });

    if (!topicRpcErr && Array.isArray(topicMatches) && topicMatches.length > 0) {
      const rels = (topicMatches as Array<{ topic_id: string; similarity: number }>).flatMap((m) => [
        { source_topic_id: currentTopicId, target_topic_id: m.topic_id, similarity_score: m.similarity },
        { source_topic_id: m.topic_id, target_topic_id: currentTopicId, similarity_score: m.similarity },
      ]);
      const { error: relErr } = await supabase.from("topic_relationships").upsert(rels, {
        onConflict: "source_topic_id,target_topic_id",
        ignoreDuplicates: true,
      });
      if (!relErr) {
        console.log("[process_topic] Linked", topicMatches.length, "related topics");
      }
    }

    // Step 8: Set status so topic becomes visible (RLS allows under_review, stable, published)
    const { error: statusErr } = await supabase
      .from("topics")
      .update({ status: "under_review" })
      .eq("topic_id", currentTopicId!);
    if (statusErr) {
      console.error("[process_topic] Update status error:", statusErr.message);
    }

    return json({
      ok: true,
      topic_id: currentTopicId,
      controversies_linked: matches.length,
      summary_generated: !!summary,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[process_topic] Error:", msg);
    return json({ error: msg }, 500);
  }
});
