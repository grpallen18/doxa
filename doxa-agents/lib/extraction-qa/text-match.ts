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

const TEMPORAL_PATTERNS = [
  /\bas of [A-Za-z]+ \d{4}\b/gi,
  /\bduring [^.,;]{3,80}\b/gi,
  /\b(?:in|on) (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b(?:19|20)\d{2}\b/g,
];

export function extractTemporalTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const pattern of TEMPORAL_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      tokens.add(m[0].trim());
    }
  }
  return [...tokens];
}

export function temporalTokensInSource(token: string, sourceText: string): boolean {
  const t = normalizeText(token);
  const s = normalizeText(sourceText);
  if (s.includes(t)) return true;
  const yearMatch = t.match(/\b(19|20)\d{2}\b/);
  if (yearMatch && s.includes(yearMatch[0])) return true;
  return false;
}
