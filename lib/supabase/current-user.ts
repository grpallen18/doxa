import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Session for the current request, validated against the Auth server.
 *
 * Wrapped in `cache` so the root layout and the page it renders share a single
 * round trip: both need to know whether a visitor is signed in (the layout to
 * pick the chrome, the root page to pick landing vs. explore home).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
