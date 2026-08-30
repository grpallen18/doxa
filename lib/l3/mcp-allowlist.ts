/** Tool allowlists by l3_bots.kind. Unknown kinds get no tools. */

const READS = [
  'get_question_dossier',
  'get_controversy_dossier',
  'get_proposition',
  'get_merge_candidates',
  'get_counter_side_candidates',
  'search_questions',
  'get_gold_examples',
] as const

export const MCP_ALLOWLIST: Record<string, readonly string[]> = {
  curator: [
    ...READS,
    'claim_review_batch',
    'submit_membership_proposal',
    'report_blocked',
    'release_review_batch',
  ],
  editor: [
    'get_question_dossier',
    'get_controversy_dossier',
    'submit_viewpoint_proposal',
  ],
  auditor: [
    'get_controversy_dossier',
    'get_question_dossier',
    'list_audit_ready_controversies',
    'submit_audit_verdict',
    'report_auditor_idle',
  ],
  'lead-reviewer': [
    ...READS,
    'submit_approval_verdict',
    'get_gold_examples',
  ],
  acquisition: [
    'claim_lead_request',
    'submit_lead_candidate',
    'search_questions',
  ],
  provenance: [],
  /** Shared xAI MCP connector — one Bearer token for all Grok personas (prompts differ). */
  grok: [
    ...READS,
    'claim_review_batch',
    'submit_membership_proposal',
    'submit_viewpoint_proposal',
    'submit_audit_verdict',
    'list_audit_ready_controversies',
    'report_auditor_idle',
    'submit_approval_verdict',
    'claim_lead_request',
    'submit_lead_candidate',
    'report_blocked',
    'release_review_batch',
  ],
  admin: [
    ...READS,
    'claim_review_batch',
    'submit_membership_proposal',
    'submit_viewpoint_proposal',
    'submit_audit_verdict',
    'submit_source_lead',
    'claim_lead_request',
    'submit_lead_candidate',
    'submit_approval_verdict',
    'report_blocked',
    'release_review_batch',
    'list_onesided_questions',
  ],
}

export function botMayCallTool(kind: string, tool: string): boolean {
  const allowed = MCP_ALLOWLIST[kind]
  if (!allowed) return false
  return allowed.includes(tool)
}
