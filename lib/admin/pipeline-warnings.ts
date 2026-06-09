export type PromptSchemaMismatchWarning = {
  kind: 'prompt_schema_mismatch'
  message: string
  stepId: string
  canSyncSchema: boolean
}

export type PipelineWarning = string | PromptSchemaMismatchWarning

export function isPromptSchemaMismatchWarning(
  warning: PipelineWarning
): warning is PromptSchemaMismatchWarning {
  return typeof warning === 'object' && warning.kind === 'prompt_schema_mismatch'
}

export function pipelineWarningMessage(warning: PipelineWarning): string {
  return typeof warning === 'string' ? warning : warning.message
}
