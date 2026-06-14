import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { AgentDetail } from '@/lib/admin/agent-detail'
import { getFlowNodeLabel } from '@/lib/admin/pipeline-flow-labels'

export type AgentProfileAbout = {
  summary: string
  inputs: string
  outputs: string
  downstream: string
  qualityStandard: string
}

export type AgentProfileCopy = {
  displayName: string
  jobTitle: string
  departmentLabel: string
  bio: string
  about: AgentProfileAbout
  responsibilities: string[]
}

type StepProfileOverride = Partial<
  Pick<AgentProfileCopy, 'jobTitle' | 'bio' | 'about' | 'responsibilities'>
>

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function formatDepartmentLabel(
  department: string | null,
  stageLabel: string
): string {
  if (!department) return stageLabel.replace(/\s+Engine$/i, '').trim()
  return department
    .replace(/^\d+-/, '')
    .split('-')
    .filter((part) => part.toLowerCase() !== 'engine')
    .map((part) => capitalize(part))
    .join(' ')
}

function defaultAbout(agent: AgentDetail): AgentProfileAbout {
  const inputs =
    agent.userPayloadDoc ??
    (agent.isolationParams.length > 0
      ? `Story-scoped inputs keyed by ${agent.isolationParams.join(', ')}.`
      : 'Story-level pipeline inputs from the Doxa catalog.')

  return {
    summary: `${agent.label} is a ${agent.stageLabel.toLowerCase()} pipeline agent responsible for one step in the Doxa story processing workflow.`,
    inputs,
    outputs: `Structured results written for the next pipeline step (deploy: ${agent.deployName}).`,
    downstream: 'Downstream agents consume this output when prior steps complete and the story remains in the active pipeline.',
    qualityStandard:
      'Runs must complete without error, respect isolation boundaries, and produce outputs that pass review where a QA loop exists.',
  }
}

function defaultResponsibilities(agent: AgentDetail): string[] {
  const base = [`Execute the ${agent.label.toLowerCase()} step for eligible stories.`]
  if (agent.promptKind === 'llm') {
    base.push('Follow the operating instructions and return schema-conformant JSON.')
  }
  if (agent.optional) {
    base.push('Run only when the pipeline marks this step as optional or required for recovery.')
  }
  if (agent.invokeOptions.usesMaxChunks) {
    base.push(
      `Process work in bounded batches (up to ${agent.invokeOptions.maxChunks ?? 'configured'} units per invoke).`
    )
  }
  base.push('Record run outcomes so operators can audit performance and failures.')
  return base
}

const STEP_PROFILES: Partial<Record<PipelineStepId, StepProfileOverride>> = {
  'relevance-gate': {
    jobTitle: 'Story Qualification Analyst',
    bio: 'Decides whether incoming stories belong in the Doxa corpus and routes borderline items for human review.',
    responsibilities: [
      'Score story relevance against editorial criteria',
      'Mark stories as keep, drop, or pending review',
      'Leave a clear qualification trail for downstream ingestion',
    ],
  },
  'review-pending-stories': {
    jobTitle: 'Qualification Review Coordinator',
    bio: 'Resolves stories stuck in pending qualification so ingestion can continue or stop with a documented decision.',
    responsibilities: [
      'Surface stories awaiting human qualification',
      'Apply approved keep/drop decisions to the pipeline',
      'Clear pending gates blocking scrape and extraction',
    ],
  },
  'scrape-story-content': {
    jobTitle: 'Content Acquisition Specialist',
    bio: 'Fetches raw article HTML from source URLs via the Cloudflare worker and hands content to cleaning.',
    responsibilities: [
      'Request scrapes for qualified story URLs',
      'Handle worker callbacks and persist raw content',
      'Flag fetch failures for operator follow-up',
    ],
  },
  'clean-scraped-content': {
    jobTitle: 'Content Normalization Specialist',
    bio: 'Strips boilerplate and normalizes scraped HTML into clean story bodies ready for chunking.',
    responsibilities: [
      'Transform raw scrape payloads into readable article text',
      'Remove navigation, ads, and non-article markup',
      'Mark stories ready for chunking when cleaning succeeds',
    ],
  },
  'chunk-story-bodies': {
    jobTitle: 'Document Segmentation Analyst',
    bio: 'Splits cleaned story bodies into review-sized chunks for parallel extraction lanes.',
    responsibilities: [
      'Segment story text into coherent chunks',
      'Preserve ordering and source context per chunk',
      'Prepare chunk records for claims, positions, and other extractors',
    ],
  },
  'extract-story-claims': {
    jobTitle: 'Primary Claims Analyst',
    bio: 'Identifies core factual claims inside each story chunk and prepares them for review, refinement, and canonicalization.',
    about: {
      summary:
        'Extracts grounded factual claims from chunk text using LLM instructions tuned for attribution and temporal fidelity.',
      inputs: 'Chunk text, story metadata, publication context, and source attribution fields.',
      outputs: 'Structured claims JSON per chunk, ready for the review loop.',
      downstream: 'Claim Reviewer, Claim Refiner, Merge claims, and canonical linking depend on this output.',
      qualityStandard:
        'Claims must be supported by the chunk, avoid unsupported inference, and include attribution where available.',
    },
    responsibilities: [
      'Extract grounded factual claims from source chunks',
      'Preserve attribution and temporal context',
      'Avoid unsupported inference',
      'Prepare structured JSON for the review loop',
    ],
  },
  'validate-chunk-claims': {
    jobTitle: 'Claims Quality Reviewer',
    bio: 'Reviews extracted claims against the source chunk and deterministic QA checks before merge.',
    responsibilities: [
      'Validate claim grounding and materiality',
      'Pass or fail chunks with actionable findings',
      'Route failed chunks to refinement when appropriate',
    ],
  },
  'refine-chunk-claims': {
    jobTitle: 'Claims Refinement Specialist',
    bio: 'Repairs claim extractions flagged by review while staying faithful to the source chunk.',
    responsibilities: [
      'Apply review findings to extraction JSON',
      'Re-submit improved claims for validation',
      'Limit retries to the configured review loop',
    ],
  },
  'extract-story-positions': {
    jobTitle: 'Position Extraction Analyst',
    bio: 'Identifies stances and position statements within chunks, linked to claims where applicable.',
    responsibilities: [
      'Extract position statements from chunk text',
      'Relate positions to existing claims when present',
      'Emit schema-conformant JSON for the positions review loop',
    ],
  },
  'validate-chunk-positions': {
    jobTitle: 'Positions Quality Reviewer',
    bio: 'Validates extracted positions against chunk text and QA rules before merge.',
    responsibilities: [
      'Review position grounding and clarity',
      'Pass or fail with findings for refinement',
      'Protect merge quality upstream of story-level positions',
    ],
  },
  'refine-chunk-positions': {
    jobTitle: 'Positions Refinement Specialist',
    bio: 'Fixes position extractions flagged during chunk review.',
    responsibilities: [
      'Incorporate review feedback into positions JSON',
      'Return refined output for re-validation',
      'Stay within retry limits for the lane',
    ],
  },
  'merge-story-claims': {
    jobTitle: 'Claims Integration Lead',
    bio: 'Consolidates per-chunk claim extractions into story-level merged claim rows.',
    responsibilities: [
      'Merge validated chunk claims into story tables',
      'Deduplicate and normalize merged representations',
      'Prepare claims for merged extraction QA',
    ],
  },
  'merge-story-positions': {
    jobTitle: 'Positions Integration Lead',
    bio: 'Consolidates chunk-level positions into story-level merged position records.',
    responsibilities: [
      'Merge validated chunk positions',
      'Align merged output with story claims where linked',
      'Hand off to merge QA and canonicalization',
    ],
  },
  'review-merged-extraction': {
    jobTitle: 'Merged Extraction Reviewer',
    bio: 'Human-in-the-loop checkpoint for merged story extraction before canonical work proceeds.',
    responsibilities: [
      'Review merged claims and positions holistically',
      'Approve or send back for refinement',
      'Document QA decisions for the story',
    ],
  },
  'refine-merged-extraction': {
    jobTitle: 'Merged Extraction Refiner',
    bio: 'Applies merged-level review feedback before re-approval.',
    responsibilities: [
      'Correct merged extraction issues flagged in review',
      'Preserve story-level consistency across entities',
      'Re-submit for merged validation',
    ],
  },
  'validate-merged-extraction': {
    jobTitle: 'Merged Extraction Approver',
    bio: 'Final QA gate that clears merged extraction for canonical linking and topology work.',
    responsibilities: [
      'Confirm merged extraction meets quality bar',
      'Block canonicalization when critical issues remain',
      'Record approval outcomes in the pipeline log',
    ],
  },
  'link-canonical-claims': {
    jobTitle: 'Canonical Claims Librarian',
    bio: 'Links story claims to global canonical claim records using embedding similarity.',
    responsibilities: [
      'Match story claims to canonical candidates',
      'Create or update canonical links',
      'Support deduplication across the corpus',
    ],
  },
  'link-canonical-events': {
    jobTitle: 'Canonical Events Librarian',
    bio: 'Links story events to canonical event records for cross-story reasoning.',
    responsibilities: [
      'Resolve story events to canonical rows',
      'Maintain consistent event identity across stories',
    ],
  },
  'link-canonical-positions': {
    jobTitle: 'Canonical Positions Librarian',
    bio: 'Links story positions to canonical position clusters in the global graph.',
    responsibilities: [
      'Match positions to canonical candidates',
      'Write durable canonical position links',
    ],
  },
  'update-stances': {
    jobTitle: 'Stance Synthesis Analyst',
    bio: 'Updates stance relationships between canonical entities after linking completes.',
    responsibilities: [
      'Compute stance updates from linked canonical rows',
      'Keep controversy topology inputs current',
    ],
  },
}

export function getAgentProfileCopy(
  agent: AgentDetail,
  displayNameOverride?: string | null
): AgentProfileCopy {
  const override = STEP_PROFILES[agent.stepId]
  const defaultDisplayName = getFlowNodeLabel(agent.stepId, agent.label)
  const displayName = displayNameOverride?.trim() || defaultDisplayName
  const departmentLabel = formatDepartmentLabel(agent.department, agent.stageLabel)
  const defaultAboutCopy = defaultAbout(agent)

  return {
    displayName,
    jobTitle: override?.jobTitle ?? `${agent.stageLabel} Pipeline Agent`,
    departmentLabel,
    bio:
      override?.bio ??
      `${displayName} owns the "${agent.label}" step in the ${agent.stageLabel} stage of the Doxa pipeline.`,
    about: { ...defaultAboutCopy, ...override?.about },
    responsibilities: override?.responsibilities ?? defaultResponsibilities(agent),
  }
}
