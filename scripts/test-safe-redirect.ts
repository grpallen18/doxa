/**
 * Unit checks for redirect sanitization (no Vitest in repo).
 * Run: npx tsx scripts/test-safe-redirect.ts
 */
import assert from 'node:assert/strict'
import { DEFAULT_REDIRECT_PATH, sanitizeRedirectPath } from '../lib/safe-redirect'

const F = DEFAULT_REDIRECT_PATH

/** Destinations that must never survive sanitization. */
const hostile: [string, string][] = [
  ['//evil.com', 'protocol-relative'],
  ['///evil.com', 'triple slash'],
  ['/\\evil.com', 'backslash normalizes to slash'],
  ['\\\\evil.com', 'UNC style'],
  ['/%2f%2fevil.com', 'encoded slashes'],
  ['/%2F%2Fevil.com', 'encoded slashes, upper case'],
  ['/%5c%5cevil.com', 'encoded backslashes'],
  ['/%252f%252fevil.com', 'double-encoded slashes'],
  ['https://evil.com', 'absolute url'],
  ['http://evil.com/path', 'absolute url with path'],
  ['//evil.com/login?next=/', 'protocol-relative with query'],
  ['javascript:alert(1)', 'script scheme'],
  ['data:text/html,<script>', 'data scheme'],
  ['/\u0000/evil', 'null byte'],
  ['/foo\nSet-Cookie: x=1', 'header injection'],
  ['relative/path', 'no leading slash'],
  ['', 'empty'],
  [`/${'a'.repeat(600)}`, 'over length cap'],
]

for (const [input, why] of hostile) {
  const actual = sanitizeRedirectPath(input)
  assert.equal(actual, F, `${why}: expected fallback for ${JSON.stringify(input)}, got ${JSON.stringify(actual)}`)
}

assert.equal(sanitizeRedirectPath(null), F, 'null falls back')
assert.equal(sanitizeRedirectPath(undefined), F, 'undefined falls back')
assert.equal(sanitizeRedirectPath('//evil.com', '/welcome'), '/welcome', 'custom fallback honored')

/** Legitimate destinations that must be preserved. */
const allowed: [string, string][] = [
  ['/', '/'],
  ['/dashboard', '/dashboard'],
  ['/topics/abc-123', '/topics/abc-123'],
  ['/search?q=climate', '/search?q=climate'],
  ['/search?q=a%20b', '/search?q=a%20b'],
  ['/search?q=100%25', '/search?q=100%25'],
  ['/people/uid?tab=eidos#top', '/people/uid?tab=eidos#top'],
  ['/c/ctr_1?a=1&b=2', '/c/ctr_1?a=1&b=2'],
]

for (const [input, expected] of allowed) {
  const actual = sanitizeRedirectPath(input)
  assert.equal(actual, expected, `expected ${JSON.stringify(expected)} for ${JSON.stringify(input)}, got ${JSON.stringify(actual)}`)
}

// Traversal is normalized away rather than passed through to the router.
assert.equal(sanitizeRedirectPath('/a/../b'), '/b', 'traversal collapses')
assert.equal(sanitizeRedirectPath('/../../etc/passwd'), '/etc/passwd', 'traversal cannot climb past root')

// Sanitizing twice must be stable, since values round-trip through query params.
for (const [input] of allowed) {
  const once = sanitizeRedirectPath(input)
  assert.equal(sanitizeRedirectPath(once), once, `not idempotent for ${JSON.stringify(input)}`)
}

console.log(
  `safe-redirect: ${hostile.length} hostile inputs rejected, ${allowed.length} legitimate paths preserved`
)
