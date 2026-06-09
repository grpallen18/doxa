'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import {
  showPipelineError,
  showPipelineSuccess,
} from '@/lib/admin/pipeline-toast'

export function PromptSchemaSyncDialog({
  open,
  onOpenChange,
  stepId,
  message,
  onSynced,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stepId: string
  message: string
  onSynced: () => void | Promise<void>
}) {
  const [syncing, setSyncing] = useState(false)

  const syncSchema = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`/api/admin/agents/${stepId}/prompt/sync-schema`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        showPipelineError(json.error?.message ?? 'Failed to sync response schema')
        return
      }
      showPipelineSuccess('Response schema synced from prompt OUTPUT.')
      onOpenChange(false)
      await onSynced()
    } catch {
      showPipelineError('Failed to sync response schema')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sync response schema?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              This prompt&apos;s OUTPUT example does not match the JSON schema the runtime enforces.
              OpenAI will follow the schema, not the prompt example, until you sync.
            </span>
            <span className="block text-foreground/80">{message}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={syncing}>Not now</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants()}
            disabled={syncing}
            onClick={(e) => {
              e.preventDefault()
              void syncSchema()
            }}
          >
            {syncing ? 'Syncing…' : 'Sync schema from prompt'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
