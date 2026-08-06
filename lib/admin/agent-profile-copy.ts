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
    bio: 'Strips boilerplate and normalizes scraped HTML into clean story bodies ready for graph ingestion.',
    responsibilities: [
      'Transform raw scrape payloads into readable article text',
      'Remove navigation, ads, and non-article markup',
      'Mark stories ready for the Neo graph path when cleaning succeeds',
    ],
  },
  'enqueue-graph-job': {
    jobTitle: 'Graph Job Dispatcher',
    bio: 'Queues cleaned stories for the Neo4j graph worker.',
    responsibilities: [
      'Enqueue graph processing jobs for cleaned stories',
      'Hand off to the graph worker wake path',
    ],
  },
  'trigger-graph-worker': {
    jobTitle: 'Knowledge Graph Builder',
    bio: 'Wakes the Python neo4j-graphrag worker to build utterances, propositions, and arguments.',
    responsibilities: [
      'Trigger graph worker processing',
      'Surface job status for operators',
    ],
  },
  'debate-pipeline': {
    jobTitle: 'Debate Assembly Orchestrator',
    bio: 'Runs cross-document Viewpoint / Controversy / Dispute assembly and Supabase projections.',
    responsibilities: [
      'Orchestrate debate topology steps',
      'Project Neo debate summaries into Supabase',
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
