/**
 * Post-auth destinations arrive as untrusted `?redirect=` query params. Only
 * same-origin paths may be used — anything else is an open redirect that can be
 * used to bounce users from a real Doxa login link to an attacker's page.
 */

export const DEFAULT_REDIRECT_PATH = '/'

const MAX_REDIRECT_LENGTH = 512
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT_PATH
): string {
  if (typeof value !== 'string' || value.length === 0) return fallback
  if (value.length > MAX_REDIRECT_LENGTH) return fallback
  if (CONTROL_CHARS.test(value)) return fallback
  // Browsers normalize backslashes to slashes, so "/\evil.com" resolves as the
  // protocol-relative "//evil.com".
  if (value.includes('\\')) return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}
