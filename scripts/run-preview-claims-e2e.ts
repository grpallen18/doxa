/**
 * Walk CNN fixture through claims-only pipeline on preview branch.
 * Loads .env.local (run npm run env:branch first) or .env.local.branch as fallback.
 *
 * Run: npm run env:branch && npm run e2e:preview-claims
 */
import { config as loadDotenv } from "dotenv";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { edgeFunctionHeaders } from "../lib/supabase/edge-function-auth.ts";

loadDotenv({ path: join(process.cwd(), ".env.local") });
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  loadDotenv({ path: join(process.cwd(), ".env.local.branch"), override: true });
}

const FIXTURE_ID = "15208581-91ae-4454-92bf-d7a16d1a6313";

const STEPS = [
  "chunk_story_bodies",
  "extract_story_claims",
  "validate_chunk_claims",
  "merge_story_claims",
  "review_merged_extraction",
  "validate_merged_extraction",
  "link_canonical_claims",
] as const;

async function invoke(
  baseUrl: string,
  serviceKey: string,
  name: string,
  body: Record<string, unknown>
) {
  const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      ...edgeFunctionHeaders(serviceKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${name} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  console.log(`  ${name}:`, JSON.stringify(json).slice(0, 300));
  return json;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "Missing preview credentials.\n" +
        "  1. Put your secret key in .env.local.branch (SUPABASE_SERVICE_ROLE_KEY)\n" +
        "  2. Run: npm run env:branch\n" +
        "  3. Run: npm run e2e:preview-claims"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const body = { story_id: FIXTURE_ID };

  console.log("Purging engine data…");
  const { error: purgeErr } = await supabase.rpc("purge_engine_data");
  if (purgeErr) console.warn("purge_engine_data:", purgeErr.message);

  for (const step of STEPS) {
    console.log(`→ ${step}`);
    await invoke(url, key, step, body);
  }

  const { count: claimCount } = await supabase
    .from("story_claims")
    .select("*", { count: "exact", head: true })
    .eq("story_id", FIXTURE_ID);

  const { count: linkedCount } = await supabase
    .from("story_claims")
    .select("*", { count: "exact", head: true })
    .eq("story_id", FIXTURE_ID)
    .not("canonical_claim_id", "is", null);

  const { data: story } = await supabase
    .from("stories")
    .select("extraction_qa_status, merged_at")
    .eq("story_id", FIXTURE_ID)
    .single();

  console.log("\nResults:");
  console.log(`  story_claims: ${claimCount ?? 0}`);
  console.log(`  linked canonical claims: ${linkedCount ?? 0}`);
  console.log(`  story extraction_qa_status: ${story?.extraction_qa_status ?? "—"}`);
  console.log(`  merged_at: ${story?.merged_at ?? "—"}`);

  if ((claimCount ?? 0) < 1) {
    console.error("E2E incomplete: no story_claims");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
