'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/Button'
import { toast } from 'sonner'

function formatUpdated(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function ControversyQuestionHeader({
  question,
  sidesCount,
  sourceCount,
  updatedAt,
  controversyUid,
  initiallySaved,
  isAuthenticated,
}: {
  question: string
  sidesCount: number
  sourceCount: number
  updatedAt: string
  controversyUid: string
  initiallySaved: boolean
  isAuthenticated: boolean
}) {
  const [saved, setSaved] = useState(initiallySaved)
  const [busy, setBusy] = useState(false)

  const toggleSave = async () => {
    if (!isAuthenticated) return
    setBusy(true)
    try {
      const res = await fetch('/api/explore/saves', {
        method: saved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controversy_uid: controversyUid }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setSaved(!saved)
      toast.success(saved ? 'Removed from saved' : 'Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="space-y-3" id="question">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        {question}
      </h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>
          {sidesCount} side{sidesCount === 1 ? '' : 's'}
        </span>
        <span aria-hidden>·</span>
        <span>
          {sourceCount} source{sourceCount === 1 ? '' : 's'}
        </span>
        {updatedAt ? (
          <>
            <span aria-hidden>·</span>
            <span>Revised {formatUpdated(updatedAt)}</span>
          </>
        ) : null}
        <span className="ml-auto">
          {isAuthenticated ? (
            <Button variant="secondary" onClick={toggleSave} disabled={busy}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          ) : (
            <Link href="/login" className="doxa-link text-sm">
              Sign in to save
            </Link>
          )}
        </span>
      </div>
    </header>
  )
}
