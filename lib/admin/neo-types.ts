export type NeoGraphStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'quarantined'
  | 'cancelled'

export type NeoStoryListItem = {
  story_id: string
  title: string | null
  url: string | null
  published_at: string | null
  source_name: string | null
  graph_status: string | null
  neo4j_element_id: string | null
  job_status: string | null
  job_error: string | null
  job_finished_at: string | null
  job_schema_version: string | null
  job_extractor_version: string | null
}

export function graphStatusBadgeVariant(
  status: string | null | undefined
): 'default' | 'success' | 'warning' | 'danger' | 'muted' {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    case 'quarantined':
      return 'warning'
    case 'running':
    case 'pending':
      return 'default'
    default:
      return 'muted'
  }
}

export function formatNeoDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
