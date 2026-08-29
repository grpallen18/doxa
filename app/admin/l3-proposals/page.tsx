'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Proposal = {
  proposal_uid: string
  kind: string
  status: string
  question_uid: string | null
  bot_id: string | null
  payload: Record<string, unknown>
  created_at: string
  l3_proposal_ops?: Array<{
    op_index: number
    op_type: string
    status: string
    payload: Record<string, unknown>
  }>
}

type Metrics = {
  queue: { pending: number; leased: number }
  proposals: { submitted: number; applied: number; rejected: number }
  gold_negatives: number
  foreign_member_rate: number
  opposing_side_share: number
  density: {
    questions: number
    q1: number
    q2plus: number
    attached: number
    fragmentation_index: number
    mean_speaker_density: number
  }
}

export default function AdminL3ProposalsPage() {
  const [items, setItems] = useState<Proposal[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [status, setStatus] = useState('pending_approval')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, m] = await Promise.all([
        fetch(`/api/admin/l3-proposals?status=${encodeURIComponent(status)}`),
        fetch('/api/admin/l3-metrics'),
      ])
      const pj = await p.json()
      const mj = await m.json()
      setItems(pj?.data?.items ?? [])
      setMetrics(mj?.data ?? null)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  async function act(proposalUid: string, action: string, extra?: Record<string, unknown>) {
    await fetch('/api/admin/l3-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, proposal_uid: proposalUid, ...extra }),
    })
    void load()
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">L3 proposals</h1>
        <p className="mt-1 text-sm text-muted">
          Curator/editor/auditor proposals. Density and foreign-member signals stay paired.
        </p>
      </div>

      {metrics && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Panel>
            <p className="text-xs uppercase text-muted">Queue</p>
            <p className="text-lg tabular-nums">
              {metrics.queue.pending} pending · {metrics.queue.leased} leased
            </p>
          </Panel>
          <Panel>
            <p className="text-xs uppercase text-muted">Proposals</p>
            <p className="text-lg tabular-nums">
              {metrics.proposals.submitted} in · {metrics.proposals.applied} applied ·{' '}
              {metrics.proposals.rejected} rejected
            </p>
          </Panel>
          <Panel>
            <p className="text-xs uppercase text-muted">Density (paired)</p>
            <p className="text-lg tabular-nums">
              q1 {metrics.density.q1} · q2+ {metrics.density.q2plus} · frag{' '}
              {metrics.density.fragmentation_index.toFixed(2)}
            </p>
            <p className="text-xs text-muted">
              gold negatives {metrics.gold_negatives} · speakers/q{' '}
              {metrics.density.mean_speaker_density.toFixed(2)} · reject rate{' '}
              {metrics.foreign_member_rate.toFixed(2)} · q2+ share{' '}
              {metrics.opposing_side_share.toFixed(2)}
            </p>
          </Panel>
        </div>
      )}

      <div className="flex gap-2">
        {['pending_approval', 'submitted', 'validated', 'applied', 'rejected', 'all'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'secondary' : 'ghost'}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <Panel>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">No proposals for this filter.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((p) => {
              const payload = (p.payload ?? {}) as {
                overall_rationale?: string
                reason?: string
                ops?: Array<Record<string, unknown>>
              }
              const mintFromPayload = (payload.ops ?? []).find(
                (o) => String(o.type ?? '').toUpperCase() === 'MINT_QUESTION'
              )
              const mintOp = (p.l3_proposal_ops ?? []).find((o) => o.op_type === 'MINT_QUESTION')
              const mintFields = (mintFromPayload ?? mintOp?.payload ?? {}) as {
                new_question_text?: string
                pro_answer_statement?: string
                con_answer_statement?: string
              }
              return (
              <li key={p.proposal_uid} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{p.kind}</Badge>
                  <Badge>{p.status}</Badge>
                  <span className="text-xs text-muted">{p.bot_id}</span>
                  {p.question_uid && (
                    <Link
                      href={`/admin/neo/union?focus=question:${encodeURIComponent(p.question_uid)}`}
                      className="text-xs text-accent-primary hover:underline"
                    >
                      {p.question_uid}
                    </Link>
                  )}
                </div>
                {mintFields.new_question_text && (
                  <p className="text-sm font-medium">{mintFields.new_question_text}</p>
                )}
                {mintFields.pro_answer_statement && (
                  <p className="text-xs text-muted">
                    <span className="font-medium text-foreground">Pro:</span>{' '}
                    {mintFields.pro_answer_statement}
                  </p>
                )}
                {mintFields.con_answer_statement && (
                  <p className="text-xs text-muted">
                    <span className="font-medium text-foreground">Con:</span>{' '}
                    {mintFields.con_answer_statement}
                  </p>
                )}
                <p className="text-sm">
                  {String(payload.overall_rationale ?? payload.reason ?? '').slice(0, 480)}
                </p>
                {(p.l3_proposal_ops ?? []).map((op) => (
                  <div key={op.op_index} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">
                      {op.op_type} {String((op.payload as { prop_uid?: string }).prop_uid ?? '')}
                    </span>
                    <Badge variant="secondary">{op.status}</Badge>
                    {['submitted', 'validated', 'pending_approval'].includes(p.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          act(p.proposal_uid, 'accept_op', { op_index: op.op_index })
                        }
                      >
                        Accept op
                      </Button>
                    )}
                    {['submitted', 'validated', 'pending_approval'].includes(p.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          act(p.proposal_uid, 'reject', {
                            op_index: op.op_index,
                            question_uid: p.question_uid,
                          })
                        }
                      >
                        Reject op
                      </Button>
                    )}
                  </div>
                ))}
                {['submitted', 'validated', 'pending_approval'].includes(p.status) && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => act(p.proposal_uid, 'apply')}>
                      Apply
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => act(p.proposal_uid, 'validate')}>
                      Mark validated
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act(p.proposal_uid, 'reject', { question_uid: p.question_uid })}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {p.status === 'applied' && (
                  <Button size="sm" variant="ghost" onClick={() => act(p.proposal_uid, 'revert')}>
                    Revert
                  </Button>
                )}
              </li>
            )})}
          </ul>
        )}
      </Panel>
    </div>
  )
}
