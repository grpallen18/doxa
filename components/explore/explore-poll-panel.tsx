'use client'

import { useEffect, useState } from 'react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { toast } from 'sonner'

type Poll = {
  poll_id: string
  question: string
  target_kind: string
  target_uid: string
}

export function ExplorePollPanel({
  targetUid,
  isAuthenticated,
}: {
  targetUid: string
  isAuthenticated: boolean
}) {
  const [polls, setPolls] = useState<Poll[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/explore/polls?target_uid=${encodeURIComponent(targetUid)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setPolls(json.polls ?? [])
      })
      .catch(() => {
        if (!cancelled) setPolls([])
      })
    return () => {
      cancelled = true
    }
  }, [targetUid])

  if (!polls.length) return null

  const vote = async (pollId: string, choice: string) => {
    if (!isAuthenticated) {
      toast.error('Sign in to vote')
      return
    }
    try {
      const res = await fetch('/api/explore/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: pollId, choice }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Vote failed')
      toast.success('Vote recorded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Vote failed')
    }
  }

  return (
    <section className="space-y-3" id="polls">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Polls</h2>
      {polls.map((poll) => (
        <Panel key={poll.poll_id} variant="soft" interactive={false} className="space-y-3 p-4">
          <p className="text-sm font-medium text-foreground">{poll.question}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => vote(poll.poll_id, 'agree')}>
              Agree
            </Button>
            <Button variant="secondary" onClick={() => vote(poll.poll_id, 'disagree')}>
              Disagree
            </Button>
            <Button variant="secondary" onClick={() => vote(poll.poll_id, 'unsure')}>
              Unsure
            </Button>
          </div>
        </Panel>
      ))}
    </section>
  )
}
