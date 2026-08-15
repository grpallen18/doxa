import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserRole, type AppRole } from '@/lib/auth-utils'

export type { AppRole } from '@/lib/auth-utils'
export { getUserRole } from '@/lib/auth-utils'

/**
 * Require admin role for API routes.
 * Returns { user, role } if admin, or a 403 Response if not.
 */
export async function requireAdmin(): Promise<
  | { user: User; role: AppRole }
  | NextResponse
> {
  const supabase = await createClient()
  // getUser() validates the access token against the Auth server. getSession()
  // alone only decodes cookies, so a forged token would pass its user check.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json(
      { data: null, error: { message: 'Authentication required' } },
      { status: 401 }
    )
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Safe to read claims now that getUser() proved the token is authentic.
  const role = getUserRole(session?.access_token ?? '')
  if (role !== 'admin') {
    return NextResponse.json(
      { data: null, error: { message: 'Admin access required' } },
      { status: 403 }
    )
  }

  return { user, role }
}
