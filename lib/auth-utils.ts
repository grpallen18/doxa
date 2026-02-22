import { decodeJwt } from 'jose'

export type AppRole = 'user' | 'admin'

interface JwtPayload {
  user_role?: string | null
  sub?: string
  [key: string]: unknown
}

/**
 * Decode JWT and return the user_role claim.
 * Returns null if token is invalid or user_role is missing.
 * Safe to use on client and server.
 */
export function getUserRole(accessToken: string): AppRole | null {
  try {
    const payload = decodeJwt(accessToken) as JwtPayload
    const role = payload?.user_role
    if (role === 'admin' || role === 'user') {
      return role
    }
    return null
  } catch {
    return null
  }
}
