/**
 * Seed CNN fixture story on preview branch for pipeline E2E.
 * Run: npm run seed:preview-cnn
 */
import { config as loadDotenv } from "dotenv";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

loadDotenv({ path: join(process.cwd(), ".env.local") });
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  loadDotenv({ path: join(process.cwd(), ".env.local.branch"), override: true });
}

const FIXTURE_ID = "15208581-91ae-4454-92bf-d7a16d1a6313";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local.branch, then npm run env:branch");
    process.exit(1);
  }

  const fixture = JSON.parse(
    readFileSync(join(process.cwd(), "docs", "sample_extraction.json"), "utf8")
  ) as {
    story: {
      story_id: string;
      title: string;
      url: string;
      published_at: string;
      source_name: string;
      article_text: string;
    };
  };

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const story = fixture.story;

  const { data: existingSource } = await supabase
    .from("sources")
    .select("source_id")
    .eq("name", story.source_name)
    .maybeSingle();

  let sourceId = existingSource?.source_id as string | undefined;
  if (!sourceId) {
    const { data: ins, error } = await supabase
      .from("sources")
      .insert({ name: story.source_name, domain: "cnn.com" })
      .select("source_id")
      .single();
    if (error) throw error;
    sourceId = ins.source_id;
  }

  await supabase.from("stories").upsert({
    story_id: FIXTURE_ID,
    title: story.title,
    url: story.url,
    source_id: sourceId,
    published_at: story.published_at,
    relevance_score: 82,
  });

  const { error: bodyErr } = await supabase.from("story_bodies").upsert({
    story_id: FIXTURE_ID,
    content_clean: story.article_text,
    content_raw: story.article_text,
    cleaned_at: new Date().toISOString(),
  });
  if (bodyErr) throw bodyErr;

  // Wipe chunks + extraction so chunk_story_bodies rebuilds from full body
  await supabase.from("story_chunks").delete().eq("story_id", FIXTURE_ID);

  await supabase
    .from("stories")
    .update({
      merged_at: null,
      extraction_completed_at: null,
      extraction_qa_status: null,
      extraction_qa_review_report: null,
      extraction_qa_validation_report: null,
      extraction_qa_refinement_count: 0,
      extraction_qa_validated_at: null,
    })
    .eq("story_id", FIXTURE_ID);

  console.log(
    `Seeded story ${FIXTURE_ID} (${story.article_text.length} chars). Run chunk_story_bodies next.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
