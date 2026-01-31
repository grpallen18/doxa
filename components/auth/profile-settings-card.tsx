'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/Panel'
import type { User } from '@supabase/supabase-js'

export function ProfileSettingsCard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameEdit, setNameEdit] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null)
      if (u?.user_metadata?.full_name) {
        setDisplayName(u.user_metadata.full_name)
        setNameEdit(u.user_metadata.full_name)
      }
    })
  }, [])

  async function handleSaveName() {
    if (!user || !nameEdit.trim()) return
    setError(null)
    setSavingName(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({
      data: { full_name: nameEdit.trim() },
    })
    setSavingName(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    const { data: { user: u } } = await supabase.auth.getUser()
    if (u) {
      setUser(u)
      setDisplayName(u.user_metadata?.full_name ?? '')
      setNameEdit(u.user_metadata?.full_name ?? '')
    }
    router.refresh()
  }

  if (!user) return null

  return (
    <Panel variant="soft" interactive={false} className="space-y-4 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Account settings
      </h2>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="profile-display-name" className="text-sm font-medium text-foreground">
            Display name
          </label>
          <div className="flex gap-2">
            <Input
              id="profile-display-name"
              type="text"
              value={nameEdit}
              onChange={(e) => setNameEdit(e.target.value)}
              placeholder="Your name"
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleSaveName}
              disabled={savingName || nameEdit.trim() === displayName}
            >
              {savingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {displayName && (
            <p className="text-xs text-muted-soft">
              Shown in the navigation when you are signed in.
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
