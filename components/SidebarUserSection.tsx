'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LANDING_PATH } from '@/lib/constants'
import type { User } from '@supabase/supabase-js'
import { useLogoutTransition } from '@/components/LogoutTransitionWrapper'
import { NavUser } from '@/components/nav-user'

export function SidebarUserSection() {
  const [user, setUser] = useState<User | null>(null)
  const startLogout = useLogoutTransition()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  if (!user) return null

  const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Account'
  const email = user.email ?? ''
  const avatar = user.user_metadata?.avatar_url ?? ''

  function handleSignOut() {
    if (startLogout) {
      startLogout.startLogout()
    } else {
      createClient().auth.signOut().then(() => {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('fromLogoutTransition', '1')
        }
        window.location.href = LANDING_PATH
      })
    }
  }

  return (
    <NavUser
      user={{ name: displayName, email, avatar }}
      onSignOut={handleSignOut}
    />
  )
}
