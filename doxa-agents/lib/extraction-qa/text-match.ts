export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyContains(haystack: string, needle: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n || n.length < 4) return true;
  if (h.includes(n)) return true;
  const words = n.split(" ").filter((w) => w.length > 3);
  if (words.length === 0) return true;
  const matched = words.filter((w) => h.includes(w)).length;
  return matched / words.length >= 0.7;
}

export function verbatimContains(haystack: string, excerpt: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(excerpt);
  if (!n) return true;
  return h.includes(n);
}

const TEMPORAL_PATTERNS = [
  /\bas of [A-Za-z]+ \d{4}\b/gi,
  /\bduring [^.,;]{3,80}\b/gi,
  /\b(?:in|on) (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b(?:19|20)\d{2}\b/g,
];

const STRICT_TEMPORAL_PATTERNS = [
  /\bas of [A-Za-z]+ \d{4}\b/gi,
  /\b(?:in|on) (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b(?:19|20)\d{2}\b/g,
];

function collectTokens(text: string, patterns: RegExp[]): string[] {
  const tokens = new Set<string>();
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      tokens.add(m[0].trim());
    }
  }
  return [...tokens];
}

export function extractTemporalTokens(text: string): string[] {
  return collectTokens(text, TEMPORAL_PATTERNS);
}

export function extractStrictTemporalTokens(text: string): string[] {
  return collectTokens(text, STRICT_TEMPORAL_PATTERNS);
}

export function temporalTokensInSource(token: string, sourceText: string): boolean {
  const t = normalizeText(token);
  const s = normalizeText(sourceText);
  if (s.includes(t)) return true;
  const yearMatch = t.match(/\b(19|20)\d{2}\b/);
  if (yearMatch && s.includes(yearMatch[0])) return true;
  return fuzzyContains(sourceText, token);
}

export const SUBSTANTIAL_CHUNK_MIN_CHARS = 500;

export function locationSupportedByExcerpt(location: string, sourceExcerpt: string): boolean {
  const loc = location.trim();
  if (!loc) return true;
  const excerpt = sourceExcerpt.trim();
  if (!excerpt) return false;
  if (verbatimContains(excerpt, loc)) return true;
  const locWords = loc.split(/\s+/).filter((w) => w.length > 2);
  if (locWords.length === 0) return true;
  const matched = locWords.filter((w) => fuzzyContains(excerpt, w)).length;
  return matched / locWords.length >= 0.6;
}

export function spanMatchesExcerpt(
  sourceText: string,
  spanStart: number | null,
  spanEnd: number | null,
  sourceExcerpt: string
): { ok: boolean; reason?: string } {
  if (spanStart === null || spanEnd === null) return { ok: true };
  if (spanStart < 0 || spanEnd <= spanStart || spanEnd > sourceText.length) {
    return { ok: false, reason: "invalid_span_range" };
  }
  const slice = sourceText.slice(spanStart, spanEnd);
  if (verbatimContains(slice, sourceExcerpt) || verbatimContains(sourceExcerpt, slice)) {
    return { ok: true };
  }
  return { ok: false, reason: "span_excerpt_mismatch" };
}
