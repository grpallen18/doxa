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
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json(
      { data: null, error: { message: 'Authentication required' } },
      { status: 401 }
    )
  }

  const role = getUserRole(session.access_token ?? '')
  if (role !== 'admin') {
    return NextResponse.json(
      { data: null, error: { message: 'Admin access required' } },
      { status: 403 }
    )
  }

  return { user: session.user, role }
}
