/**
 * Helpers for building PostgREST filter strings from user-controlled input.
 *
 * In `.or()` / `.and()` filter strings, commas separate conditions and
 * parentheses group them, while `%` / `_` are LIKE wildcards. Interpolating
 * raw user input lets a caller inject extra conditions, reference other
 * columns, or broaden a wildcard match (a filter-string injection). These
 * helpers strip the PostgREST/LIKE metacharacters so the value can only ever
 * be matched as a literal substring.
 */

/**
 * Sanitize a search term for use inside a PostgREST `ilike`/`or` pattern.
 * Removes the characters that carry meaning in filter strings (`% _ , . ( ) '`)
 * and collapses whitespace. Returns an empty string when nothing usable remains.
 */
export function sanitizePostgrestPattern(input: string): string {
  return input
    .replace(/[%_,.()'"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build a `%term%` ilike pattern from user input, or null if the term is empty
 * after sanitization (caller should skip the filter entirely in that case).
 */
export function ilikeContainsPattern(input: string): string | null {
  const term = sanitizePostgrestPattern(input)
  return term ? `%${term}%` : null
}
