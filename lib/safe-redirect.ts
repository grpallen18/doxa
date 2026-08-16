/**
 * Post-auth destinations arrive as untrusted `?redirect=` query params. Only
 * same-origin paths may be used — anything else is an open redirect that can be
 * used to bounce users from a real Doxa login link to an attacker's page.
 */

export const DEFAULT_REDIRECT_PATH = '/'

const MAX_REDIRECT_LENGTH = 512
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
/**
 * Enough passes to unwrap the double-encoding an attacker can hide separators
 * behind (`%252f%252f` -> `%2f%2f` -> `//`) without looping on arbitrary input.
 */
const MAX_DECODE_PASSES = 3
/** Any absolute URL resolving against this must keep this origin to be local. */
const VALIDATION_ORIGIN = 'https://redirect.invalid'

/**
 * Rejects anything that could escape the current origin once a browser resolves
 * it: a leading `//` (or `/\`) is protocol-relative and navigates off-site.
 */
function isLocalPathShape(value: string): boolean {
  if (CONTROL_CHARS.test(value)) return false
  // Browsers normalize backslashes to slashes, so "/\evil.com" resolves as the
  // protocol-relative "//evil.com".
  if (value.includes('\\')) return false
  if (!value.startsWith('/')) return false
  if (value.startsWith('//')) return false
  return true
}

export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT_PATH
): string {
  if (typeof value !== 'string' || value.length === 0) return fallback
  if (value.length > MAX_REDIRECT_LENGTH) return fallback

  // Percent-encoded separators survive the literal checks but are decoded before
  // the browser resolves the URL, so every decoded layer has to be checked too.
  let current = value
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    if (!isLocalPathShape(current)) return fallback
    if (!current.includes('%')) break
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      // Malformed escapes are left as-is by browsers too, so they cannot turn
      // into a separator. The shape above already passed; stop unwrapping.
      break
    }
    if (decoded === current) break
    current = decoded
  }

  // Final authority: resolve it the way a browser would and require the origin
  // to be untouched. Also collapses any `..` traversal out of the result.
  try {
    const resolved = new URL(value, VALIDATION_ORIGIN)
    if (resolved.origin !== VALIDATION_ORIGIN) return fallback
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallback
  }
}
