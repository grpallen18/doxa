/**
 * Deterministic extraction QA checks — run: npx tsx scripts/test-extraction-qa-deterministic.ts
 */
import {
  checkBlockingFindingsUnresolved,
  getCompletenessIssues,
  runStrictPreValidation,
} from "../doxa-agents/lib/extraction-qa/deterministic-checks.ts";
import type { ExtractionJson, ReviewReport } from "../doxa-agents/lib/extraction-qa/types.ts";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ok ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`);
  }
}

const sourceOman =
  "Published May 27, 2026. Trump said at a White House Cabinet meeting on Wednesday that Oman was added. " +
  "During his two terms as president, the U.S. launched strikes in seven countries this term.";

const verbatimExcerpt = "Trump said at a White House Cabinet meeting on Wednesday that Oman was added";

const provenance = {
  source_story_id: "00000000-0000-0000-0000-000000000001",
  source_chunk_index: 0,
  source_excerpt: "Trump said at a White House Cabinet meeting on Wednesday that Oman was added",
  span_start: null,
  span_end: null,
  extraction_confidence: 0.9,
};

console.log("runStrictPreValidation (atoms)");

{
  const extraction: ExtractionJson = {
    claims: [
      {
        raw_text: "The U.S. launched military strikes in seven countries in 2023.",
        ...provenance,
        source_excerpt: "During his two terms as president, the U.S. launched strikes in seven countries this term.",
      },
    ],
    evidence: [],
    positions: [],
    events: [],
  };
  const r = runStrictPreValidation(sourceOman, extraction, { atomsOnly: true });
  assert("blocks hallucinated year 2023 in claim", !r.passes);
}

{
  const extraction: ExtractionJson = {
    claims: [
      {
        raw_text: "Trump spoke at a White House Cabinet meeting on Wednesday.",
        ...provenance,
      },
    ],
    evidence: [
      {
        excerpt: "Trump said at a White House Cabinet meeting that Oman was added",
        evidence_type: "quote",
        ...provenance,
        source_excerpt: "Trump said at a White House Cabinet meeting that Oman was added",
      },
    ],
    positions: [],
    events: [],
  };
  const r = runStrictPreValidation(sourceOman, extraction, { atomsOnly: true });
  assert("blocks paraphrased evidence excerpt", !r.passes);
}

{
  const extraction: ExtractionJson = {
    claims: [
      {
        raw_text: "Trump spoke at a White House Cabinet meeting on Wednesday.",
        ...provenance,
        source_excerpt: verbatimExcerpt,
      },
    ],
    evidence: [
      {
        excerpt: verbatimExcerpt,
        evidence_type: "quote",
        ...provenance,
        source_excerpt: verbatimExcerpt,
      },
    ],
    positions: [],
    events: [],
  };
  const r = runStrictPreValidation(sourceOman, extraction, { atomsOnly: true });
  assert("passes valid provenance without links", r.passes);
}

{
  const extraction: ExtractionJson = {
    claims: [
      { raw_text: "Claim A", ...provenance },
      { raw_text: "Claim B", ...provenance, source_excerpt: "seven countries this term" },
    ],
    evidence: [
      {
        excerpt: verbatimExcerpt,
        evidence_type: "quote",
        ...provenance,
        source_excerpt: verbatimExcerpt,
      },
    ],
    positions: [],
    events: [],
  };
  const issues = getCompletenessIssues(extraction);
  assert("does not flag insufficient_evidence for claim count", !issues.some((i) => i.startsWith("insufficient_evidence")));
}

{
  const extraction: ExtractionJson = {
    claims: [{ raw_text: "Test", ...provenance, source_excerpt: "" }],
    evidence: [],
    positions: [],
    events: [],
  };
  const r = runStrictPreValidation(sourceOman, extraction, { atomsOnly: true });
  assert("blocks missing source_excerpt", !r.passes);
}

{
  const extraction: ExtractionJson = {
    claims: [],
    evidence: [],
    positions: [],
    events: [
      {
        event_summary: "Strikes on Iran, Venezuela, and Cuba",
        event_type: "aggregate_event",
        primary_actor: null,
        action: null,
        object: null,
        location: "White House Cabinet meeting",
        event_date: null,
        event_timeframe_start: null,
        event_timeframe_end: null,
        ...provenance,
        source_excerpt: "During his two terms as president, the U.S. launched strikes in seven countries this term.",
      },
    ],
  };
  const r = runStrictPreValidation(sourceOman, extraction, { atomsOnly: true });
  assert("blocks unsupported event location", !r.passes);
  assert("detects unsupported location", (r.deterministic_checks.unsupported_locations_detected?.length ?? 0) > 0);
}

console.log("checkBlockingFindingsUnresolved");

{
  const before: ExtractionJson = {
    claims: [{ raw_text: "Strikes occurred in seven countries in 2023.", ...provenance }],
    evidence: [],
    positions: [],
    events: [],
  };
  const after = { ...before };
  const reviewReport: ReviewReport = {
    findings: [
      {
        type: "hallucinated_date",
        severity: "blocking",
        description: "2023 not in source",
        entity_type: "claim",
        entity_index: 0,
        unsupported_text: "2023",
        recommended_patch: { op: "remove", entity_type: "claim", entity_index: 0 },
      },
    ],
    recommended_action: "refine",
  };
  const unresolved = checkBlockingFindingsUnresolved(reviewReport, before, after, sourceOman);
  assert("detects refiner failed to remove blocking hallucination", unresolved.length > 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
