'use client'

import { useState, useEffect } from 'react'
import { NodePerspective, Perspective } from '@/lib/types'
import { Panel } from '@/components/Panel'

interface PerspectiveSectionProps {
  nodeId: string
  nodeVersion: number
  nodePerspective: NodePerspective & { perspective: Perspective }
  validationStats?: {
    total_validations: number
    positive_validations: number
    validation_rate: number
  }
  voteStats?: {
    upvotes: number
    downvotes: number
    net_score: number
  }
}

export default function PerspectiveSection({
  nodeId,
  nodeVersion,
  nodePerspective,
  validationStats,
  voteStats,
}: PerspectiveSectionProps) {
  const { perspective, core_claim, key_arguments, emphasis, perspective_id } = nodePerspective
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingVote, setPendingVote] = useState<1 | -1 | null>(null)
  const [reason, setReason] = useState('')

  const openModal = (value: 1 | -1) => {
    setPendingVote(value)
    setReason('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setPendingVote(null)
    setReason('')
  }

  const handleConfirm = () => {
    // Future: send reason to DB (e.g. POST /api/perspectives/vote with reason).
    closeModal()
  }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    if (modalOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [modalOpen])

  return (
    <>
      <div className="panel-bevel-soft space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{perspective.name}</h3>
            {perspective.description && (
              <p className="text-xs text-muted-soft mt-1 italic">{perspective.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-muted">
            {validationStats && (
              <div>
                <span className="font-medium">
                  {Math.round(validationStats.validation_rate * 100)}%
                </span>{' '}
                representation ({validationStats.positive_validations}/
                {validationStats.total_validations})
              </div>
            )}
            {voteStats && (
              <div className="flex items-center gap-2">
                <span>▲ {voteStats.upvotes}</span>
                <span>▼ {voteStats.downvotes}</span>
                <span className="text-muted-soft">Net {voteStats.net_score}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Core claim
            </h4>
            <p className="text-sm text-foreground mt-1">{core_claim}</p>
          </div>

          {key_arguments && key_arguments.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Key arguments
              </h4>
              <ul className="mt-1 list-disc list-inside space-y-1 text-sm text-muted">
                {key_arguments.map((arg: string, index: number) => (
                  <li key={index}>{arg}</li>
                ))}
              </ul>
            </div>
          )}

          {emphasis && (
            <div className="rounded-[12px] bg-surface-soft p-3 text-xs text-muted">
              <h4 className="mb-1 font-semibold">Emphasis</h4>
              <p>{emphasis}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-subtle pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted">How do you rate this viewpoint?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openModal(1)}
                className="rounded-pill bg-surface px-3 py-1 text-foreground shadow-panel-soft hover:shadow-panel-hover"
              >
                ▲ Upvote
              </button>
              <button
                type="button"
                onClick={() => openModal(-1)}
                className="rounded-pill bg-surface px-3 py-1 text-foreground shadow-panel-soft hover:shadow-panel-hover"
              >
                ▼ Downvote
              </button>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vote-modal-title"
        >
          <button
            type="button"
            aria-label="Close modal"
            className="absolute inset-0 bg-foreground/20"
            onClick={closeModal}
          />
          <Panel
            variant="base"
            className="relative z-10 w-full max-w-md space-y-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="vote-modal-title" className="text-lg font-semibold tracking-tight text-foreground">
              Rate this perspective
            </h2>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full rounded-[12px] border border-subtle bg-surface px-3 py-2 text-sm text-foreground shadow-inset-soft placeholder:text-muted-soft outline-none"
              placeholder="Why did you rate this perspective this way?"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-pill border border-subtle bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-panel-soft hover:shadow-panel-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-pill bg-foreground px-4 py-2 text-sm font-medium text-background shadow-panel-soft hover:shadow-panel-hover"
              >
                Confirm
              </button>
            </div>
          </Panel>
        </div>
      )}
    </>
  )
}
