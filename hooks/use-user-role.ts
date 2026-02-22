'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUserRole, type AppRole } from '@/lib/auth-utils'

export function useUserRole(): AppRole | null {
  const [role, setRole] = useState<AppRole | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const r = session?.access_token ? getUserRole(session.access_token) : null
      setRole(r)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const r = session?.access_token ? getUserRole(session.access_token) : null
      setRole(r)
    })
    return () => subscription.unsubscribe()
  }, [])

  return role
}
