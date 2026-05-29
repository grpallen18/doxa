import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function loadQaPassedStoryIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("stories")
    .select("story_id")
    .eq("extraction_qa_status", "passed");
  return new Set((data ?? []).map((r) => String(r.story_id)));
}

export async function isStoryQaPassed(
  supabase: SupabaseClient,
  storyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("stories")
    .select("extraction_qa_status")
    .eq("story_id", storyId)
    .maybeSingle();
  return data?.extraction_qa_status === "passed";
}
