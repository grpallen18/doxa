import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

export type ExtractionStepGroup = {
  id: string
  label: string
  description: string
  stepIds: PipelineStepId[]
}

export const EXTRACTION_STEP_GROUPS: ExtractionStepGroup[] = [
  {
    id: 'core',
    label: 'Chunk & extract',
    description: 'Split the clean body and extract claims per chunk.',
    stepIds: ['chunk-story-bodies', 'extract-story-claims'],
  },
  {
    id: 'chunk-qa',
    label: 'Review (within extract)',
    description: 'Validate chunk claims until all chunks pass (refine agents coming later).',
    stepIds: ['validate-chunk-claims'],
  },
  {
    id: 'merge-op',
    label: 'Merge operation',
    description: 'Combine approved chunk claims into story-level claims.',
    stepIds: ['merge-story-claims'],
  },
  {
    id: 'merge-qa',
    label: 'Approve (within merge)',
    description: 'Review, refine when needed, and approve merged extraction before canonicalization.',
    stepIds: [
      'review-merged-extraction',
      'refine-merged-extraction',
      'validate-merged-extraction',
    ],
  },
]

export const EXTRACTION_TIMELINE_HIDDEN_STEPS = new Set<PipelineStepId>([
  'validate-chunk-claims',
  'merge-story-claims',
  'review-merged-extraction',
  'refine-merged-extraction',
  'validate-merged-extraction',
])
