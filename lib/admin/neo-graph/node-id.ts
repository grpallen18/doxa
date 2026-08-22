import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'

const KIND_SET = new Set<NeoNodeKind>([
  'document',
  'publication',
  'agent',
  'utterance',
  'segment',
  'entity',
  'proposition',
  'argument',
  'viewpoint',
  'controversy',
  'question',
  'dispute',
  'assessment',
  'evidence_check',
  'citation',
  'method_run',
  'cluster',
])

/** Projection ids are `kind:uid` (uid itself may contain colons). */
export function parseNeoNodeId(
  raw: string | null | undefined
): { kind: NeoNodeKind; uid: string } | null {
  if (!raw) return null
  const sep = raw.indexOf(':')
  if (sep <= 0 || sep === raw.length - 1) return null
  const kind = raw.slice(0, sep)
  const uid = raw.slice(sep + 1)
  if (!KIND_SET.has(kind as NeoNodeKind) || !uid) return null
  return { kind: kind as NeoNodeKind, uid }
}

export const NEO_KIND_TO_LABEL: Partial<Record<NeoNodeKind, string>> = {
  document: 'Document',
  publication: 'Publication',
  agent: 'Agent',
  utterance: 'Utterance',
  segment: 'Segment',
  entity: 'Entity',
  proposition: 'Proposition',
  argument: 'Argument',
  viewpoint: 'Viewpoint',
  controversy: 'Controversy',
  question: 'Question',
  dispute: 'Dispute',
  assessment: 'Assessment',
  evidence_check: 'EvidenceCheck',
  citation: 'Citation',
  method_run: 'MethodRun',
}
