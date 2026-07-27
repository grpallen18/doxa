/** Shared filter/sort field catalog for admin story list. */

export type StoryListFieldKey =
  | 'title'
  | 'source'
  | 'keyword'
  | 'author'
  | 'language'
  | 'url'
  | 'friendly_id'
  | 'qa_status'
  | 'relevance_status'
  | 'relevance_score'
  | 'created_at'
  | 'published_at'
  | 'fetched_at'
  | 'scraped_at'
  | 'merged_at'
  | 'extraction_completed_at'
  | 'extraction_status'
  | 'scrape_skipped'

export type StorySortDirection = 'asc' | 'desc'

export type StorySortRule = {
  key: StoryListFieldKey
  direction: StorySortDirection
}

export type StoryFieldFilterKind = 'text' | 'select'

export type StoryFieldOption = {
  value: string
  label: string
}

export type StoryListFieldDef = {
  key: StoryListFieldKey
  label: string
  filterable: boolean
  sortable: boolean
  filterKind?: StoryFieldFilterKind
  placeholder?: string
  options?: readonly StoryFieldOption[]
  /** DB column for .order(); use 'source' for sources.name */
  sortColumn?: string
}

export const STORY_LIST_FIELDS: readonly StoryListFieldDef[] = [
  {
    key: 'title',
    label: 'Title',
    filterable: true,
    sortable: true,
    filterKind: 'text',
    placeholder: 'Search by title',
    sortColumn: 'title',
  },
  {
    key: 'source',
    label: 'Source',
    filterable: true,
    sortable: true,
    filterKind: 'text',
    placeholder: 'Publisher name',
    sortColumn: 'source',
  },
  {
    key: 'keyword',
    label: 'Keyword',
    filterable: true,
    sortable: false,
    filterKind: 'text',
    placeholder: 'Title, snippet, body, or ID',
  },
  {
    key: 'author',
    label: 'Author',
    filterable: true,
    sortable: true,
    filterKind: 'text',
    placeholder: 'Author name',
    sortColumn: 'author',
  },
  {
    key: 'language',
    label: 'Language',
    filterable: true,
    sortable: true,
    filterKind: 'text',
    placeholder: 'e.g. en',
    sortColumn: 'language',
  },
  {
    key: 'url',
    label: 'URL',
    filterable: true,
    sortable: true,
    filterKind: 'text',
    placeholder: 'Story URL contains…',
    sortColumn: 'url',
  },
  {
    key: 'friendly_id',
    label: 'Friendly ID',
    filterable: true,
    sortable: true,
    filterKind: 'text',
    placeholder: 'e.g. ST-…',
    sortColumn: 'friendly_id',
  },
  {
    key: 'qa_status',
    label: 'QA status',
    filterable: true,
    sortable: true,
    filterKind: 'select',
    sortColumn: 'extraction_qa_status',
    options: [
      { value: 'needs_human_review', label: 'Needs human review' },
      { value: 'complete', label: 'QA complete' },
      { value: 'passed', label: 'QA complete (legacy)' },
      { value: 'pending_qa', label: 'Pending QA' },
      { value: 'awaiting_approval', label: 'Awaiting approval' },
      { value: 'atoms_passed', label: 'Atoms validated' },
      { value: 'needs_refinement', label: 'Needs refinement' },
      { value: 'refined', label: 'Refined' },
      { value: 'standardized', label: 'Standardized' },
      { value: 'reviewed', label: 'Reviewed' },
      { value: 'pending', label: 'Pending' },
    ],
  },
  {
    key: 'relevance_status',
    label: 'Relevance status',
    filterable: true,
    sortable: true,
    filterKind: 'select',
    sortColumn: 'relevance_status',
    options: [
      { value: 'KEEP', label: 'KEEP' },
      { value: 'DROP', label: 'DROP' },
      { value: 'PENDING', label: 'PENDING' },
    ],
  },
  {
    key: 'relevance_score',
    label: 'Relevance score',
    filterable: false,
    sortable: true,
    sortColumn: 'relevance_score',
  },
  {
    key: 'created_at',
    label: 'Created date',
    filterable: false,
    sortable: true,
    sortColumn: 'created_at',
  },
  {
    key: 'published_at',
    label: 'Published date',
    filterable: false,
    sortable: true,
    sortColumn: 'published_at',
  },
  {
    key: 'fetched_at',
    label: 'Ingested date',
    filterable: false,
    sortable: true,
    sortColumn: 'fetched_at',
  },
  {
    key: 'scraped_at',
    label: 'Scraped date',
    filterable: false,
    sortable: true,
    sortColumn: 'scraped_at',
  },
  {
    key: 'merged_at',
    label: 'Merged date',
    filterable: false,
    sortable: true,
    sortColumn: 'merged_at',
  },
  {
    key: 'extraction_completed_at',
    label: 'Extraction completed',
    filterable: false,
    sortable: true,
    sortColumn: 'extraction_completed_at',
  },
  {
    key: 'extraction_status',
    label: 'Extraction status',
    filterable: true,
    sortable: false,
    filterKind: 'select',
    options: [
      { value: 'merged', label: 'Merged' },
      { value: 'extracted', label: 'Extracted' },
      { value: 'skipped_empty', label: 'Skipped (empty)' },
      { value: 'pending_extraction', label: 'Pending extraction' },
    ],
  },
  {
    key: 'scrape_skipped',
    label: 'Scrape skipped',
    filterable: true,
    sortable: true,
    filterKind: 'select',
    sortColumn: 'scrape_skipped',
    options: [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ],
  },
] as const

const FIELD_BY_KEY = Object.fromEntries(
  STORY_LIST_FIELDS.map((field) => [field.key, field])
) as Record<StoryListFieldKey, StoryListFieldDef>

export function storyListField(key: StoryListFieldKey): StoryListFieldDef {
  return FIELD_BY_KEY[key]
}

export function storyListFieldLabel(key: StoryListFieldKey): string {
  return FIELD_BY_KEY[key]?.label ?? key
}

export const STORY_FILTER_FIELDS = STORY_LIST_FIELDS.filter((field) => field.filterable)
export const STORY_SORT_FIELDS = STORY_LIST_FIELDS.filter((field) => field.sortable)

export type StoryFilterKey = (typeof STORY_FILTER_FIELDS)[number]['key']

export type StoryFilters = Record<StoryFilterKey, string>

export function emptyStoryFilters(): StoryFilters {
  return Object.fromEntries(STORY_FILTER_FIELDS.map((field) => [field.key, ''])) as StoryFilters
}

export const DEFAULT_VISIBLE_STORY_FILTERS: StoryFilterKey[] = ['title']

export const DEFAULT_STORY_SORTS: StorySortRule[] = [
  { key: 'created_at', direction: 'desc' },
]

const LEGACY_SORT_ALIASES: Record<string, StoryListFieldKey> = {
  recent: 'created_at',
  relevant: 'relevance_score',
  qaStatus: 'qa_status',
}

export function isStoryListFieldKey(value: string): value is StoryListFieldKey {
  return value in FIELD_BY_KEY
}

export function resolveStorySortKey(raw: string): StoryListFieldKey | null {
  const aliased = LEGACY_SORT_ALIASES[raw] ?? raw
  if (!isStoryListFieldKey(aliased)) return null
  return FIELD_BY_KEY[aliased].sortable ? aliased : null
}

export function serializeStorySorts(sorts: StorySortRule[]): string {
  return sorts.map((rule) => `${rule.key}:${rule.direction}`).join(',')
}

/** Accepts `created_at:desc`, legacy `recent`, or multi `title:asc,created_at:desc`. */
export function parseStorySorts(raw: string | null): StorySortRule[] {
  if (!raw?.trim()) return DEFAULT_STORY_SORTS
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  const parsed: StorySortRule[] = []
  const seen = new Set<StoryListFieldKey>()

  for (const part of parts) {
    const [keyRaw = '', dirRaw] = part.split(':')
    const key = resolveStorySortKey(keyRaw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const direction: StorySortDirection = dirRaw === 'asc' ? 'asc' : 'desc'
    parsed.push({ key, direction })
  }

  return parsed.length > 0 ? parsed : DEFAULT_STORY_SORTS
}

export function sortsAreDefault(sorts: StorySortRule[]): boolean {
  if (sorts.length !== DEFAULT_STORY_SORTS.length) return false
  return sorts.every(
    (rule, index) =>
      rule.key === DEFAULT_STORY_SORTS[index]?.key &&
      rule.direction === DEFAULT_STORY_SORTS[index]?.direction
  )
}

export function countActiveStoryFilters(filters: StoryFilters): number {
  return STORY_FILTER_FIELDS.filter(
    (field) => field.key !== 'keyword' && filters[field.key].trim().length > 0
  ).length
}

export function visibleFilterKeysFromValues(filters: StoryFilters): StoryFilterKey[] {
  const keys: StoryFilterKey[] = ['title']
  for (const field of STORY_FILTER_FIELDS) {
    if (field.key === 'title') continue
    if (filters[field.key].trim()) keys.push(field.key)
  }
  return keys
}
