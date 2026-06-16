/**
 * Deterministic extraction QA checks — run: npx tsx scripts/test-extraction-qa-deterministic.ts
 */
import { detectAttributionDrift } from "../doxa-agents/lib/extraction-qa/attribution-drift.ts";
import {
  checkBlockingFindingsUnresolved,
  getCompletenessIssues,
  getMaterialityWarnings,
  mergeAttributionDriftIntoClaimsReview,
  runStrictPreValidation,
} from "../doxa-agents/lib/extraction-qa/deterministic-checks.ts";
import {
  applyProvenanceSpans,
  enforceVerbatimExcerpts,
  findVerbatimSpan,
} from "../doxa-agents/lib/extraction-qa/span-compute.ts";
import type { ExtractionJson, ReviewReport } from "../doxa-agents/lib/extraction-qa/types.ts";
import {
  applyClaimsReviewResolvedStatus,
  MAX_VALIDATION_ATTEMPTS,
  resolveClaimsReviewFailureStatus,
  resolveValidationFailureStatus,
} from "../doxa-agents/lib/extraction-qa/types.ts";
import {
  collectSpanGroundingMismatchIssues,
  detectSpanGroundingMismatch,
  mergeSpanGroundingIntoClaimsReview,
} from "../doxa-agents/lib/extraction-qa/span-grounding.ts";
import { ensureClaimAudit } from "../doxa-agents/lib/extraction-qa/claim-merge-state.ts";
import { normalizeChunkClaims } from "../doxa-agents/lib/extraction-qa/normalize-claims.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

console.log("applyProvenanceSpans");

{
  const chunkText =
    "Trump added a new entry to that list on Wednesday, threatening to strike Oman if it tries to control the Strait of Hormuz along with Iran.\n\n" +
    "He's launched strikes in seven countries so far this term — Iran, Iraq, Nigeria, Somalia, Syria, Venezuela and Yemen —";

  const extraction: ExtractionJson = {
    claims: [
      {
        raw_text: "On Wednesday, Trump threatened to strike Oman if it tries to control the Strait of Hormuz along with Iran.",
        polarity: "asserts",
        stance: "neutral",
        ...provenance,
        source_excerpt:
          "Trump added a new entry to that list on Wednesday, threatening to strike Oman if it tries to control the Strait of Hormuz along with Iran.",
        span_start: 325,
        span_end: 427,
      },
    ],
    evidence: [],
    positions: [],
    events: [],
  };

  const before = runStrictPreValidation(chunkText, extraction, { atomsOnly: true });
  assert("paraphrased LLM spans fail pre-validation", before.issues.some((i) => i.includes("span_mismatch")));

  const fixed = applyProvenanceSpans(extraction, chunkText);
  const claim = (fixed.claims ?? [])[0] as Record<string, unknown>;
  const span = findVerbatimSpan(
    chunkText,
    String(claim.source_excerpt),
    claim.span_start as number
  );
  assert("server span matches source_excerpt", span !== null);
  assert("claim span_start aligned to excerpt", claim.span_start === span?.start);
  assert("claim span_end aligned to excerpt", claim.span_end === span?.end);

  const after = runStrictPreValidation(chunkText, fixed, { atomsOnly: true });
  assert("server spans pass pre-validation", !after.issues.some((i) => i.includes("span_mismatch")));
}

console.log("enforceVerbatimExcerpts");

{
  const source = "Alpha beta gamma delta.";
  const extraction: ExtractionJson = {
    claims: [
      {
        raw_text: "Beta gamma.",
        source_excerpt: "beta gamma",
        span_start: 0,
        span_end: 0,
        extraction_confidence: 0.9,
      },
      {
        raw_text: "Not in source.",
        source_excerpt: "missing text",
        span_start: 0,
        span_end: 0,
        extraction_confidence: 0.9,
      },
    ],
    evidence: [],
    positions: [],
    events: [],
  };
  const filtered = enforceVerbatimExcerpts(extraction, source);
  assert("drops non-verbatim atoms", (filtered.claims?.length ?? 0) === 1);
  assert("keeps verbatim atoms", String((filtered.claims?.[0] as { raw_text?: string })?.raw_text) === "Beta gamma.");
}

console.log("resolveValidationFailureStatus");

{
  assert(
    "attempt 1 needs_refinement routes to refine",
    resolveValidationFailureStatus(1, "needs_refinement") === "needs_refinement"
  );
  assert(
    "attempt 3 routes to human review",
    resolveValidationFailureStatus(MAX_VALIDATION_ATTEMPTS, "needs_refinement") === "needs_human_review"
  );
}

console.log("getMaterialityWarnings");

{
  const longChunk = "x".repeat(600);
  const noisy: ExtractionJson = {
    claims: Array.from({ length: 16 }, (_, i) => ({
      raw_text: `claim ${i}`,
      source_excerpt: "x".repeat(20),
      span_start: 0,
      span_end: 20,
      extraction_confidence: 0.8,
    })),
    evidence: [],
    positions: [],
    events: [],
  };
  const warnings = getMaterialityWarnings(longChunk, noisy);
  assert("flags excessive claim count", warnings.some((w) => w.includes("materiality")));
}

console.log("claimsOnly validation");

{
  const claimsOnly: ExtractionJson = {
    claims: [
      {
        raw_text: "Trump threatened to strike Oman if it tries to control the Strait of Hormuz.",
        source_excerpt: "threatening to strike Oman if it tries to control the Strait of Hormuz",
        span_start: 100,
        span_end: 180,
        extraction_confidence: 0.9,
      },
    ],
    evidence: [],
    positions: [],
    events: [],
  };
  const chunk =
    "Trump added a new entry on Wednesday, threatening to strike Oman if it tries to control the Strait of Hormuz along with Iran.";
  const pre = runStrictPreValidation(chunk, claimsOnly, { claimsOnly: true, atomsOnly: true });
  assert("claims-only passes without positions/events", pre.passes);
  const completeness = getCompletenessIssues(claimsOnly, { claimsOnly: true });
  assert("claims-only skips position/event completeness", completeness.length === 0);
}

console.log("attribution drift");

{
  const badIssue = detectAttributionDrift(
    {
      claim_id: "claim-210-days",
      raw_text: "Trump said that Pulte can serve in the role for 210 days.",
      source_excerpt: "He can serve in the role for 210 days.",
    },
    0
  );
  assert("flags Trump said with narration-only excerpt", badIssue != null);
  assert("210-day issue type is attribution", badIssue?.issue_type === "attribution");
  assert("210-day issue severity is major", badIssue?.severity === "major");
  assert("210-day issue references claim_id", badIssue?.claim_id === "claim-210-days");

  const goodClaimed = detectAttributionDrift(
    {
      claim_id: "claim-cheating",
      raw_text:
        "Trump claimed without evidence that Democrats were cheating in California's primaries.",
      source_excerpt:
        "hours after he claimed on social media without evidence that Democrats were cheating in California’s primaries this week.",
    },
    0
  );
  assert("no issue when excerpt contains he claimed", goodClaimed == null);

  const goodTold = detectAttributionDrift(
    {
      claim_id: "claim-elections",
      raw_text: "Trump said Pulte might investigate 'the rigged elections'.",
      source_excerpt:
        'He also told reporters on Thursday that Pulte might investigate “the rigged elections”',
    },
    0
  );
  assert("no issue when excerpt contains He told reporters", goodTold == null);

  const extraction = {
    claims: [
      {
        claim_id: "claim-210-days",
        raw_text: "Trump said that Pulte can serve in the role for 210 days.",
        source_excerpt: "He can serve in the role for 210 days.",
      },
    ],
    evidence: [],
    positions: [],
    events: [],
  };
  const chunk =
    "Pulte was named acting director. He can serve in the role for 210 days. Trump spoke at the White House.";
  const pre = runStrictPreValidation(chunk, extraction, { claimsOnly: true, atomsOnly: true });
  assert("strict pre adds attribution drift string", pre.issues.some((i) => i.startsWith("attribution_drift:")));
  assert("strict pre keeps passes when only attribution drift", pre.passes);

  const merged = mergeAttributionDriftIntoClaimsReview(
    {
      issues: [],
      patches: [],
      recommended_action: "validate",
      passes_review: true,
      summary: "ok",
      deterministic_issues: pre.issues,
    },
    pre.attribution_issues ?? []
  );
  assert("merge sets needs_refinement", merged.recommended_action === "needs_refinement");
  assert("merge adds structured attribution issue", merged.issues?.some((i) => i.issue_type === "attribution"));

  if (badIssue) {
    console.log("\nExample deterministic issue (210-day claim):");
    console.log(JSON.stringify(badIssue, null, 2));
  }
}

console.log("claims review workflow status");

{
  const refinableReport = {
    issues: [{ severity: "blocking" as const, claim_id: "c1", claim_index: 0, issue_type: "grounding", finding: "x" }],
    patches: [],
  };
  assert(
    "reject with refinable issues resolves to needs_refinement",
    resolveClaimsReviewFailureStatus(1, "reject", refinableReport) === "needs_refinement"
  );
  assert(
    "reject without refinable issues stays needs_human_review",
    resolveClaimsReviewFailureStatus(1, "reject", { issues: [], patches: [] }) === "needs_human_review"
  );

  const synced = applyClaimsReviewResolvedStatus(
    {
      passes_review: false,
      recommended_action: "reject",
      summary: "bad",
      issues: [],
      patches: [],
    },
    "needs_refinement"
  );
  assert("resolved status written", synced.resolved_status === "needs_refinement");
  assert("recommended_action synced", synced.recommended_action === "needs_refinement");
}

console.log("span grounding mismatch");

{
  const chunk =
    "President Trump called on Pulte to shrink ODNI. He can serve in the role for 210 days. Trump spoke at the White House.";
  const finding = detectSpanGroundingMismatch(
    chunk,
    "Trump said that Pulte can serve in the role for 210 days.",
    "President Trump called on Pulte to shrink ODNI."
  );
  assert("210-day wrong excerpt detected", finding != null);

  const issues = collectSpanGroundingMismatchIssues(chunk, {
    claims: [
      {
        claim_id: "claim-210-days",
        raw_text: "Trump said that Pulte can serve in the role for 210 days.",
        source_excerpt: "President Trump called on Pulte to shrink ODNI.",
      },
    ],
    evidence: [],
    positions: [],
    events: [],
  });
  assert("structured span_grounding_mismatch issue", issues[0]?.issue_type === "span_grounding_mismatch");

  const duplicateString = `span_grounding_mismatch: claim 1 (claim-210-days): ${issues[0]?.finding ?? ""}`;
  const merged = mergeSpanGroundingIntoClaimsReview(
    {
      issues: [],
      deterministic_issues: [duplicateString, "other_issue: foo"],
      recommended_action: "validate",
      passes_review: true,
    },
    issues
  );
  assert(
    "deterministic_issues deduped for span_grounding_mismatch",
    (merged.deterministic_issues ?? []).filter((entry) => entry.startsWith("span_grounding_mismatch:"))
      .length === 1
  );
  assert(
    "other deterministic issues preserved",
    (merged.deterministic_issues ?? []).includes("other_issue: foo")
  );
}

console.log("claim audit reconciliation");

{
  const claims = [{ claim_id: "c1", raw_text: "A claim." }];
  const audit = ensureClaimAudit(claims, {
    passes_review: false,
    recommended_action: "needs_refinement",
    summary: "",
    issues: [
      {
        severity: "blocking",
        claim_id: "c1",
        claim_index: 0,
        issue_type: "span_grounding_mismatch",
        finding: "wrong excerpt",
      },
    ],
    patches: [],
    claim_audit: [{ claim_id: "c1", verdict: "pass" }],
  });
  assert("audit upgraded from pass to needs_repair", audit[0]?.verdict === "needs_repair");
}

console.log("normalize preserves refiner excerpt");

void normalizeChunkClaims(
  [
    {
      claim_id: "c1",
      raw_text: "Trump said that Pulte can serve in the role for 210 days.",
      source_excerpt: "He can serve in the role for 210 days.",
    },
  ],
  "story-1",
  0,
  "President Trump called on Pulte to shrink ODNI. He can serve in the role for 210 days.",
  { preserveClaimIds: true }
).then((result) => {
  assert(
    "refiner verbatim excerpt kept",
    String(result.claims[0]?.source_excerpt).includes("210 days")
  );
  assert(
    "wrong excerpt not used",
    !String(result.claims[0]?.source_excerpt).includes("ODNI")
  );

  console.log("oman fixture excerpt gates");

  if (existsSync(join(process.cwd(), "docs", "sample_extraction.json"))) {
    const fixturePath = join(process.cwd(), "docs", "sample_extraction.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      chunks: Array<{ content: string; extraction_json: ExtractionJson }>;
    };
    const chunk = fixture.chunks[0];
    const enforced = applyProvenanceSpans(
      enforceVerbatimExcerpts(chunk.extraction_json, chunk.content),
      chunk.content
    );
    const pre = runStrictPreValidation(chunk.content, enforced, { atomsOnly: true });
    assert("oman candidate excerpts pass verbatim + span checks", pre.passes);
  } else {
    console.log("  skip oman fixture (sample_extraction.json not present)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
