import { toast } from 'sonner'
import {
  isPromptSchemaMismatchWarning,
  pipelineWarningMessage,
  type PipelineWarning,
} from '@/lib/admin/pipeline-warnings'

const PIPELINE_TOAST_POSITION = 'top-center' as const

export function formatPipelineErrorMessage(
  message: string,
  deployName?: string | null
): string {
  const trimmed = message.trim()
  if (!trimmed) return 'Pipeline step failed'

  if (/invalid jwt/i.test(trimmed)) {
    const fn = deployName ?? '<deploy_name>'
    return `Invalid JWT calling ${fn}. Redeploy with: supabase functions deploy ${fn} --no-verify-jwt`
  }

  if (/invalid api key/i.test(trimmed)) {
    return 'Invalid API key. Check SUPABASE_SERVICE_ROLE_KEY matches your Supabase project URL.'
  }

  return trimmed
}

export function showPipelineError(message: string, deployName?: string | null) {
  toast.error(formatPipelineErrorMessage(message, deployName), {
    position: PIPELINE_TOAST_POSITION,
    duration: 8000,
  })
}

export function showPipelineSuccess(message: string) {
  toast.success(message, { position: PIPELINE_TOAST_POSITION })
}

export function showPipelineWarning(
  warning: PipelineWarning,
  options?: { onFixSchema?: (stepId: string) => void | Promise<void> }
) {
  const message = pipelineWarningMessage(warning)
  const canFix =
    isPromptSchemaMismatchWarning(warning) &&
    warning.canSyncSchema &&
    options?.onFixSchema

  toast.warning(message, {
    position: PIPELINE_TOAST_POSITION,
    duration: 12_000,
    action: canFix
      ? {
          label: 'Fix schema',
          onClick: () => void options.onFixSchema!(warning.stepId),
        }
      : undefined,
  })
}

export function showPipelineInfo(message: string) {
  toast.info(message, { position: PIPELINE_TOAST_POSITION })
}
