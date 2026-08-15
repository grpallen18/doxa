'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LANDING_PATH } from '@/lib/constants'
import { Button } from '@/components/ui/button'

export function LogoutButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push(LANDING_PATH)
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={handleLogout} className={className}>
      {children ?? 'Log out'}
    </Button>
  )
}
