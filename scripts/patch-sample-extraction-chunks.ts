/**
 * Populate docs/sample_extraction.json chunks[] from chunk_validate qa artifact (claims-only fixture).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "docs", "sample_extraction.json");
const fixture = JSON.parse(readFileSync(path, "utf8")) as {
  story: { article_text: string; story_id: string };
  qa_artifacts: Array<{ stage: string; chunk_index: number; input_snapshot: unknown }>;
  chunks: unknown[];
};

const artifact = fixture.qa_artifacts.find((a) => a.stage === "chunk_validate" && a.chunk_index === 0);
if (!artifact) throw new Error("chunk_validate artifact missing");

const snapshot = artifact.input_snapshot as { claims: unknown[] };
fixture.chunks = [
  {
    chunk_index: 0,
    content: fixture.story.article_text,
    extraction_json: {
      claims: snapshot.claims,
      evidence: [],
      positions: [],
      events: [],
    },
    extraction_qa_status: "passed",
  },
];

writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Patched ${path} with ${snapshot.claims.length} claims in chunk 0`);
