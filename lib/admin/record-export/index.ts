export {
  buildStoryRecordExport as buildStoryRecordExportPayload,
  buildStoryRecordExport as buildStoryRecordExportJson,
  buildStoryRecordMarkdown as buildStoryRecordExportMarkdown,
} from '@/lib/admin/record-export/story-record'
export {
  buildStoryStageExport as buildStoryStageExportPayload,
  buildStoryStageExport as buildStoryStageExportJson,
  buildStoryStageMarkdown as buildStoryStageExportMarkdown,
} from '@/lib/admin/record-export/story-stage'
export {
  buildStoryStepExportJson,
  buildStoryStepExportMarkdown,
  buildStoryStepExportPayload,
} from '@/lib/admin/record-export/story-step'

export function buildChunkRecordExportPayload(): null {
  return null
}
export function buildChunkRecordExportJson(): null {
  return null
}
export function buildChunkRecordExportMarkdown(): string {
  return ''
}
export function buildChunkStepExportPayload(): null {
  return null
}
export function buildChunkStepExportJson(): null {
  return null
}
export function buildChunkStepExportMarkdown(): string {
  return ''
}
export function chunkStepExportBasename(): string {
  return 'chunk-step'
}
export function isChunkStepExportable(): boolean {
  return false
}
