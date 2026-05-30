/**
 * Oman CNN fixture — deterministic gates only.
 * Run: npx tsx scripts/test-standardize-oman-fixture.ts
 *
 * LLM quality checks (manual after pipeline re-run):
 * - Claim count drops from ~15+ toward ~6–12 material claims
 * - Direct quote becomes evidence or one derived claim
 * - Aggregate military patterns become events
 * - Position is synthesized stance, not verbatim article sentence
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runStrictPreValidation } from "../doxa-agents/lib/extraction-qa/deterministic-checks.ts";
import {
  applyProvenanceSpans,
  enforceVerbatimExcerpts,
} from "../doxa-agents/lib/extraction-qa/span-compute.ts";
import type { ExtractionJson } from "../doxa-agents/lib/extraction-qa/types.ts";

const fixturePath = join(process.cwd(), "docs", "sample_extraction.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  chunks: Array<{ content: string; extraction_json: ExtractionJson }>;
};

const chunk = fixture.chunks[0];
const candidateCount =
  (chunk.extraction_json.claims?.length ?? 0) +
  (chunk.extraction_json.evidence?.length ?? 0) +
  (chunk.extraction_json.positions?.length ?? 0) +
  (chunk.extraction_json.events?.length ?? 0);

const gated = applyProvenanceSpans(
  enforceVerbatimExcerpts(chunk.extraction_json, chunk.content),
  chunk.content
);
const result = runStrictPreValidation(chunk.content, gated, { atomsOnly: true });

console.log(`Oman chunk candidates: ${candidateCount} atoms`);
console.log(`After verbatim + span gate: passes=${result.passes}`);
if (!result.passes) {
  console.error("Blocking:", result.blocking_issues);
  process.exit(1);
}

console.log("Deterministic gates OK. Re-run full pipeline for LLM standardization quality checks.");
