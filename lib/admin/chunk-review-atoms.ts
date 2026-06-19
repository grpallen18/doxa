import type { RecordLedgerTab } from '@/components/admin/record/record-ledger-table'

export const CHUNK_REVIEW_ATOM_TABS: RecordLedgerTab[] = [
  { id: 'claims', label: 'Claims' },
  { id: 'positions', label: 'Positions' },
  { id: 'events', label: 'Events' },
  { id: 'evidence', label: 'Evidence' },
]

export type ChunkReviewAtomId = (typeof CHUNK_REVIEW_ATOM_TABS)[number]['id']

export const DEFAULT_CHUNK_REVIEW_ATOM: ChunkReviewAtomId = 'claims'
