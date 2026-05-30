export type StoryAgentMetadata = {
  story_id: string;
  story_title: string | null;
  source_name: string | null;
  published_at: string | null;
  chunk_index?: number;
};

export const METADATA_PROMPT_BLOCK = `METADATA RULES:
You receive published_at, story_title, and source_name as metadata only. They are NOT part of the article text.
Do not treat published_at as an event date. Do not infer years, dates, or facts from metadata or outside knowledge.
Ground all extractions exclusively in chunk_text or source_text.`;

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
};

export async function loadStoryMetadata(
  supabase: SupabaseLike,
  storyId: string,
  chunkIndex?: number
): Promise<StoryAgentMetadata> {
  const { data, error } = await supabase
    .from("stories")
    .select("story_id, title, published_at, sources(name)")
    .eq("story_id", storyId)
    .maybeSingle();

  if (error || !data) {
    return {
      story_id: storyId,
      story_title: null,
      source_name: null,
      published_at: null,
      ...(chunkIndex !== undefined ? { chunk_index: chunkIndex } : {}),
    };
  }

  const sources = data.sources as { name?: string } | null;
  return {
    story_id: storyId,
    story_title: typeof data.title === "string" ? data.title : null,
    source_name: typeof sources?.name === "string" ? sources.name : null,
    published_at: typeof data.published_at === "string" ? data.published_at : null,
    ...(chunkIndex !== undefined ? { chunk_index: chunkIndex } : {}),
  };
}

export async function loadStoryMetadataBatch(
  supabase: SupabaseLike,
  storyIds: string[]
): Promise<Map<string, StoryAgentMetadata>> {
  const unique = [...new Set(storyIds)];
  const map = new Map<string, StoryAgentMetadata>();
  await Promise.all(
    unique.map(async (id) => {
      map.set(id, await loadStoryMetadata(supabase, id));
    })
  );
  return map;
}

export function metadataPayload(meta: StoryAgentMetadata) {
  return {
    story_id: meta.story_id,
    story_title: meta.story_title,
    source_name: meta.source_name,
    published_at: meta.published_at,
    ...(meta.chunk_index !== undefined ? { chunk_index: meta.chunk_index } : {}),
  };
}
