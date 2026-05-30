import type {
  DeterministicChecksDetail,
  ExtractionJson,
  ReviewReport,
  StrictPreValidationResult,
  ValidationReport,
} from "./types.ts";
import {
  extractStrictTemporalTokens,
  fuzzyContains,
  locationSupportedByExcerpt,
  spanMatchesExcerpt,
  SUBSTANTIAL_CHUNK_MIN_CHARS,
  temporalTokensInSource,
  verbatimContains,
} from "./text-match.ts";
import { isEmptyExtraction } from "./types.ts";
import { hasSemanticLinks } from "./atom-schema.ts";

export type DeterministicCheckResult = {
  issues: string[];
  blocking_count: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function claimText(c: unknown): string {
  return String(asRecord(c)?.raw_text ?? "");
}

function eventSummary(e: unknown): string {
  return String(asRecord(e)?.event_summary ?? "");
}

function positionText(p: unknown): string {
  return String(asRecord(p)?.raw_text ?? "");
}

function sourceExcerpt(row: unknown): string {
  const o = asRecord(row);
  if (!o) return "";
  return String(o.source_excerpt ?? o.excerpt_text ?? o.excerpt ?? "").trim();
}

function eventDateFields(e: unknown): string[] {
  const ev = asRecord(e);
  if (!ev) return [];
  return ["event_date", "event_timeframe_start", "event_timeframe_end"]
    .map((k) => String(ev[k] ?? ""))
    .filter(Boolean);
}

function emptyChecksDetail(): DeterministicChecksDetail {
  return {
    all_evidence_excerpts_verbatim: true,
    all_provenance_excerpts_verbatim: true,
    all_link_indexes_valid: true,
    unsupported_dates_detected: [],
    unsupported_locations_detected: [],
    span_mismatches: [],
    orphan_evidence_indexes: [],
    orphan_claim_indexes: [],
    orphan_position_indexes: [],
    orphan_event_indexes: [],
  };
}

function validateLinkIndexes(extraction: ExtractionJson): { issues: string[]; detail: Partial<DeterministicChecksDetail> } {
  const issues: string[] = [];
  const claimsLen = Array.isArray(extraction.claims) ? extraction.claims.length : 0;
  const evidenceLen = Array.isArray(extraction.evidence) ? extraction.evidence.length : 0;
  const positionsLen = Array.isArray(extraction.positions) ? extraction.positions.length : 0;
  const eventsLen = Array.isArray(extraction.events) ? extraction.events.length : 0;

  const check = (linkArr: unknown[] | undefined, label: string, fields: Array<{ name: string; max: number }>) => {
    if (!Array.isArray(linkArr)) return;
    linkArr.forEach((l, li) => {
      if (l === null || typeof l !== "object") {
        issues.push(`invalid_link: ${label} ${li + 1} is not an object`);
        return;
      }
      const lo = l as Record<string, unknown>;
      for (const { name, max } of fields) {
        const idx = lo[name];
        if (typeof idx !== "number" || idx < 0 || idx >= max) {
          issues.push(`invalid_link_index: ${label} ${li + 1} ${name}=${idx} out of range (max ${max - 1})`);
        }
      }
    });
  };

  check(extraction.claim_evidence_links, "claim_evidence_links", [
    { name: "claim_index", max: claimsLen },
    { name: "evidence_index", max: evidenceLen },
  ]);
  check(extraction.position_claim_links, "position_claim_links", [
    { name: "position_index", max: positionsLen },
    { name: "claim_index", max: claimsLen },
  ]);
  check(extraction.position_evidence_links, "position_evidence_links", [
    { name: "position_index", max: positionsLen },
    { name: "evidence_index", max: evidenceLen },
  ]);
  check(extraction.event_claim_links, "event_claim_links", [
    { name: "event_index", max: eventsLen },
    { name: "claim_index", max: claimsLen },
  ]);
  check(extraction.event_evidence_links, "event_evidence_links", [
    { name: "event_index", max: eventsLen },
    { name: "evidence_index", max: evidenceLen },
  ]);

  return {
    issues,
    detail: { all_link_indexes_valid: issues.length === 0 },
  };
}

function validateProvenanceForAtoms(
  sourceText: string,
  extraction: ExtractionJson
): { issues: string[]; blocking: string[]; detail: Partial<DeterministicChecksDetail> } {
  const issues: string[] = [];
  const blocking: string[] = [];
  let all_provenance_excerpts_verbatim = true;
  const span_mismatches: string[] = [];
  const unsupported_locations_detected: string[] = [];

  const atomLists: Array<{ label: string; key: keyof ExtractionJson }> = [
    { label: "claim", key: "claims" },
    { label: "evidence", key: "evidence" },
    { label: "position", key: "positions" },
    { label: "event", key: "events" },
  ];

  for (const { label, key } of atomLists) {
    const list = Array.isArray(extraction[key]) ? (extraction[key] as unknown[]) : [];
    for (let i = 0; i < list.length; i++) {
      const excerpt = sourceExcerpt(list[i]);
      if (!excerpt) {
        const msg = `provenance_missing: ${label} ${i + 1} has no source_excerpt`;
        issues.push(msg);
        blocking.push(msg);
        all_provenance_excerpts_verbatim = false;
        continue;
      }
      if (!verbatimContains(sourceText, excerpt)) {
        all_provenance_excerpts_verbatim = false;
        const msg = `provenance_not_verbatim: ${label} ${i + 1} source_excerpt not in chunk`;
        issues.push(msg);
        blocking.push(msg);
      }
      const row = asRecord(list[i]);
      const spanStart = typeof row?.span_start === "number" ? row.span_start : null;
      const spanEnd = typeof row?.span_end === "number" ? row.span_end : null;
      const spanCheck = spanMatchesExcerpt(sourceText, spanStart, spanEnd, excerpt);
      if (!spanCheck.ok && spanCheck.reason) {
        const msg = `span_mismatch: ${label} ${i + 1} ${spanCheck.reason}`;
        issues.push(msg);
        span_mismatches.push(msg);
      }
    }
  }

  const events = Array.isArray(extraction.events) ? extraction.events : [];
  for (let i = 0; i < events.length; i++) {
    const ev = asRecord(events[i]);
    const location = String(ev?.location ?? "").trim();
    if (location && !locationSupportedByExcerpt(location, sourceExcerpt(events[i]))) {
      const msg = `unsupported_location: event ${i + 1} location "${location}" not in source_excerpt`;
      issues.push(msg);
      blocking.push(msg);
      unsupported_locations_detected.push(location);
    }
  }

  return {
    issues,
    blocking,
    detail: {
      all_provenance_excerpts_verbatim,
      span_mismatches,
      unsupported_locations_detected,
    },
  };
}

export function runDeterministicChecks(
  sourceText: string,
  extraction: ExtractionJson,
  options: StrictPreValidationOptions = {}
): DeterministicCheckResult {
  const strict = runStrictPreValidation(sourceText, extraction, {
    lenientEvidence: true,
    atomsOnly: options.atomsOnly ?? !hasSemanticLinks(extraction),
    ...options,
  });
  return { issues: strict.issues, blocking_count: strict.blocking_issues.length };
}

export type StrictPreValidationOptions = {
  lenientEvidence?: boolean;
  skipEmptyCheck?: boolean;
  enforceCompleteness?: boolean;
  atomsOnly?: boolean;
};

export function getCompletenessIssues(extraction: ExtractionJson): string[] {
  const issues: string[] = [];
  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];
  const events = Array.isArray(extraction.events) ? extraction.events : [];

  if (claims.length === 0) return issues;

  if (claims.length >= 3 && positions.length === 0) {
    issues.push("missing_position: substantial extraction has no article position");
  }

  if (claims.length >= 4 && events.length === 0) {
    issues.push("missing_event: chunk has many claims but zero events — check for public statements or aggregate actions");
  }

  return issues;
}

export function getMaterialityWarnings(sourceText: string, extraction: ExtractionJson): string[] {
  const warnings: string[] = [];
  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const evidence = Array.isArray(extraction.evidence) ? extraction.evidence : [];
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];
  const events = Array.isArray(extraction.events) ? extraction.events : [];
  const chunkLen = sourceText.trim().length;

  if (chunkLen >= SUBSTANTIAL_CHUNK_MIN_CHARS && claims.length > 14) {
    warnings.push(`materiality: ${claims.length} claims may be excessive for chunk length (target ~6–12)`);
  }
  if (chunkLen >= SUBSTANTIAL_CHUNK_MIN_CHARS && claims.length > 0 && evidence.length === 0) {
    warnings.push("materiality: no evidence atoms despite substantial chunk");
  }
  if (positions.length > 3) {
    warnings.push(`materiality: ${positions.length} positions — prefer 1–2 central stances`);
  }
  if (events.length === 0 && claims.length >= 6) {
    warnings.push("materiality: many claims but no events — check for public statements or aggregate actions");
  }

  return warnings;
}

export function runStrictPreValidation(
  sourceText: string,
  extraction: ExtractionJson,
  options: StrictPreValidationOptions = {}
): StrictPreValidationResult {
  const issues: string[] = [];
  const blocking_issues: string[] = [];
  const unsupported_dates_detected: string[] = [];
  let all_evidence_excerpts_verbatim = true;
  const atomsOnly = options.atomsOnly ?? !hasSemanticLinks(extraction);

  if (
    !options.skipEmptyCheck &&
    isEmptyExtraction(extraction) &&
    sourceText.trim().length > SUBSTANTIAL_CHUNK_MIN_CHARS
  ) {
    const msg = "under_extraction_empty: substantial chunk has empty extraction";
    issues.push(msg);
    blocking_issues.push(msg);
    return {
      passes: false,
      blocking_issues,
      issues,
      deterministic_checks: { ...emptyChecksDetail(), unsupported_dates_detected },
    };
  }

  if (isEmptyExtraction(extraction)) {
    return {
      passes: true,
      blocking_issues: [],
      issues: ["empty_extraction"],
      deterministic_checks: emptyChecksDetail(),
    };
  }

  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const evidence = Array.isArray(extraction.evidence) ? extraction.evidence : [];
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];
  const events = Array.isArray(extraction.events) ? extraction.events : [];

  for (let i = 0; i < claims.length; i++) {
    const text = claimText(claims[i]);
    for (const token of extractStrictTemporalTokens(text)) {
      if (!temporalTokensInSource(token, sourceText)) {
        const msg = `hallucinated_date: claim ${i + 1} temporal "${token}" not in source`;
        issues.push(msg);
        blocking_issues.push(msg);
        unsupported_dates_detected.push(token);
      }
    }
  }

  for (let i = 0; i < positions.length; i++) {
    const text = positionText(positions[i]);
    for (const token of extractStrictTemporalTokens(text)) {
      if (!temporalTokensInSource(token, sourceText)) {
        const msg = `hallucinated_date: position ${i + 1} temporal "${token}" not in source`;
        issues.push(msg);
        blocking_issues.push(msg);
        unsupported_dates_detected.push(token);
      }
    }
  }

  for (let i = 0; i < events.length; i++) {
    const summary = eventSummary(events[i]);
    for (const token of extractStrictTemporalTokens(summary)) {
      if (!temporalTokensInSource(token, sourceText)) {
        const msg = `hallucinated_date: event ${i + 1} temporal "${token}" not in source`;
        issues.push(msg);
        blocking_issues.push(msg);
        unsupported_dates_detected.push(token);
      }
    }
    for (const df of eventDateFields(events[i])) {
      for (const token of extractStrictTemporalTokens(df)) {
        if (!temporalTokensInSource(token, sourceText)) {
          const msg = `hallucinated_date: event ${i + 1} date field temporal "${token}" not in source`;
          issues.push(msg);
          blocking_issues.push(msg);
          unsupported_dates_detected.push(token);
        }
      }
    }
  }

  const evidenceCheck = options.lenientEvidence ? fuzzyContains : verbatimContains;
  for (let i = 0; i < evidence.length; i++) {
    const ex = asRecord(evidence[i]);
    const excerpt = String(ex?.excerpt ?? "");
    if (excerpt && !evidenceCheck(sourceText, excerpt)) {
      all_evidence_excerpts_verbatim = false;
      const msg = `unsupported_evidence: evidence ${i + 1} excerpt not found in source`;
      issues.push(msg);
      blocking_issues.push(msg);
    }
  }

  const provResult = validateProvenanceForAtoms(sourceText, extraction);
  issues.push(...provResult.issues);
  blocking_issues.push(...provResult.blocking);

  let linkResult = { issues: [] as string[], detail: { all_link_indexes_valid: true } };
  if (!atomsOnly) {
    linkResult = validateLinkIndexes(extraction);
    issues.push(...linkResult.issues);
    blocking_issues.push(...linkResult.issues);
  }

  const completenessIssues = getCompletenessIssues(extraction);
  for (const msg of completenessIssues) {
    issues.push(msg);
    if (options.enforceCompleteness) {
      blocking_issues.push(msg);
    }
  }

  const deterministic_checks: DeterministicChecksDetail = {
    all_evidence_excerpts_verbatim,
    all_provenance_excerpts_verbatim: provResult.detail.all_provenance_excerpts_verbatim ?? true,
    all_link_indexes_valid: linkResult.detail.all_link_indexes_valid ?? true,
    unsupported_dates_detected,
    unsupported_locations_detected: provResult.detail.unsupported_locations_detected ?? [],
    span_mismatches: provResult.detail.span_mismatches ?? [],
    orphan_evidence_indexes: [],
    orphan_claim_indexes: [],
    orphan_position_indexes: [],
    orphan_event_indexes: [],
  };

  return {
    passes: blocking_issues.length === 0,
    blocking_issues,
    issues,
    deterministic_checks,
  };
}

function entityArrayKey(entityType: string | null | undefined): keyof ExtractionJson | null {
  const map: Record<string, keyof ExtractionJson> = {
    claim: "claims",
    claims: "claims",
    evidence: "evidence",
    position: "positions",
    positions: "positions",
    event: "events",
    events: "events",
  };
  return entityType ? map[entityType] ?? null : null;
}

function entityText(extraction: ExtractionJson, entityType: string, index: number): string {
  const key = entityArrayKey(entityType);
  if (!key) return "";
  const list = Array.isArray(extraction[key]) ? (extraction[key] as unknown[]) : [];
  const item = list[index];
  if (item === null || typeof item !== "object") return "";
  const o = item as Record<string, unknown>;
  return String(o.raw_text ?? o.excerpt ?? o.event_summary ?? "");
}

export function checkBlockingFindingsUnresolved(
  reviewReport: ReviewReport | Record<string, unknown> | null | undefined,
  before: ExtractionJson,
  after: ExtractionJson,
  _sourceText: string
): string[] {
  const unresolved: string[] = [];
  const findings = Array.isArray((reviewReport as ReviewReport)?.findings)
    ? (reviewReport as ReviewReport).findings
    : [];

  for (const finding of findings) {
    if (finding.severity !== "blocking") continue;
    if (finding.type !== "hallucinated_date" && finding.type !== "unsupported_claim") continue;

    const entityType = finding.entity_type ?? "";
    const entityIndex = finding.entity_index;
    const unsupportedText = finding.unsupported_text?.trim();
    const patchOp = finding.recommended_patch?.op;

    if (entityIndex === null || entityIndex === undefined || entityIndex < 0) {
      if (unsupportedText) {
        const stillInAfter = JSON.stringify(after).toLowerCase().includes(unsupportedText.toLowerCase());
        if (stillInAfter) {
          unresolved.push(`refiner_failed_blocking: ${finding.description}`);
        }
      }
      continue;
    }

    const beforeText = entityText(before, entityType, entityIndex);
    const afterText = entityText(after, entityType, entityIndex);

    if (patchOp === "remove") {
      const key = entityArrayKey(entityType);
      const beforeLen = key && Array.isArray(before[key]) ? (before[key] as unknown[]).length : 0;
      const afterLen = key && Array.isArray(after[key]) ? (after[key] as unknown[]).length : 0;
      if (afterLen >= beforeLen && afterText === beforeText) {
        unresolved.push(`refiner_failed_blocking: entity not removed — ${finding.description}`);
      }
      continue;
    }

    if (unsupportedText) {
      if (afterText.toLowerCase().includes(unsupportedText.toLowerCase())) {
        unresolved.push(`refiner_failed_blocking: unsupported text "${unsupportedText}" still present — ${finding.description}`);
      }
      continue;
    }

    if (finding.type === "hallucinated_date" && afterText === beforeText && beforeText) {
      unresolved.push(`refiner_failed_blocking: hallucinated date not corrected — ${finding.description}`);
    }
  }

  return unresolved;
}

export function buildDeterministicValidationReport(
  strict: StrictPreValidationResult,
  refinerUnresolved: string[] = [],
  includeMergeFidelity = false,
  recommendedStatus: ValidationReport["recommended_status"] = "needs_human_review"
): ValidationReport {
  const allBlocking = [...strict.blocking_issues, ...refinerUnresolved];
  return {
    passes: false,
    scores: {
      grounding: allBlocking.some((x) => x.includes("unsupported") || x.includes("provenance")) ? 0.2 : 0.5,
      completeness: allBlocking.some((x) => x.includes("under_extraction")) ? 0.1 : 0.5,
      granularity: 0.5,
      provenance_quality: allBlocking.some((x) => x.includes("provenance") || x.includes("span")) ? 0.2 : 0.5,
      temporal_accuracy: allBlocking.some((x) => x.includes("hallucinated_date")) ? 0.1 : 0.5,
      position_capture: 0.5,
      schema_validity: strict.deterministic_checks.all_provenance_excerpts_verbatim ? 1 : 0.3,
      ...(includeMergeFidelity ? { merge_fidelity: 0.5 } : {}),
    },
    blocking_issues: allBlocking,
    major_issues: [],
    minor_warnings: strict.issues.filter((i) => !allBlocking.includes(i)),
    recommended_status: recommendedStatus,
    deterministic_issues: strict.issues,
    deterministic_checks: strict.deterministic_checks,
    summary: "Deterministic pre-validation failed; LLM validator skipped.",
    promotion_gate: {
      eligible_for_promotion: false,
      reason: allBlocking[0] ?? "deterministic_pre_validation_failed",
    },
  };
}

export function deterministicToValidationReport(
  check: DeterministicCheckResult,
  includeMergeFidelity = false
): ValidationReport | null {
  if (check.issues.length === 0 || (check.issues.length === 1 && check.issues[0] === "empty_extraction")) {
    return null;
  }
  const blocking = check.issues.filter(
    (x) =>
      x.startsWith("hallucinated_date") ||
      x.startsWith("unsupported_evidence") ||
      x.startsWith("provenance_") ||
      x.startsWith("unsupported_location") ||
      x.startsWith("invalid_link") ||
      x.startsWith("under_extraction")
  );
  if (blocking.length === 0) return null;

  return buildDeterministicValidationReport(
    {
      passes: false,
      blocking_issues: blocking,
      issues: check.issues,
      deterministic_checks: emptyChecksDetail(),
    },
    [],
    includeMergeFidelity
  );
}

export function autoPassEmptyExtraction(sourceTextLength = 0): ValidationReport {
  if (sourceTextLength > SUBSTANTIAL_CHUNK_MIN_CHARS) {
    return buildDeterministicValidationReport({
      passes: false,
      blocking_issues: ["under_extraction_empty: substantial chunk has empty extraction"],
      issues: ["under_extraction_empty"],
      deterministic_checks: emptyChecksDetail(),
    });
  }
  return {
    passes: true,
    scores: {
      grounding: 1,
      completeness: 1,
      granularity: 1,
      provenance_quality: 1,
      temporal_accuracy: 1,
      position_capture: 1,
      schema_validity: 1,
    },
    blocking_issues: [],
    major_issues: [],
    minor_warnings: [],
    recommended_status: "atoms_passed",
    deterministic_issues: ["empty_extraction_trivial_chunk"],
    promotion_gate: { eligible_for_promotion: true, reason: "trivial_empty_chunk" },
  };
}
