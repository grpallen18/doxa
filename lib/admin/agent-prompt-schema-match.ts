/**
 * Code-default OUTPUT specs (used when no DB schema override is set).
 * Keep in sync with doxa-agents/lib/agent-prompt-output-match.ts defaults.
 */

export type EnforcedOutputSpec = {
  topLevel: string[]
  nested: Record<string, string[]>
  recommendedActions?: string[]
}

export const ENFORCED_OUTPUT_SPECS: Record<string, EnforcedOutputSpec> = {
  'validate-chunk-claims': {
    topLevel: ['passes_review', 'recommended_action', 'summary', 'issues', 'patches'],
    nested: {
      issues: ['severity', 'claim_id', 'claim_index', 'issue_type', 'finding'],
      patches: [
        'action',
        'entity_type',
        'severity',
        'claim_ids',
        'claim_indexes',
        'recommended_raw_text',
        'reason',
        'source_grounding',
      ],
    },
    recommendedActions: ['validate', 'needs_refinement', 'reject'],
  },
}

export type { PromptSchemaMismatch } from '@/lib/admin/agent-prompt-response-schema'
export {
  checkAgentPromptSchemaMatch as checkPromptOutputSchemaMatch,
} from '@/lib/admin/agent-prompt-response-schema'
