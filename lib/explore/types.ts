/** Shared types for consumer explore (Neo projections). */

export type SampleProposition = {
  uid: string
  text: string
}

export type ExploreControversyListItem = {
  uid: string
  question: string
  summary: string | null
  sides_count: number
  source_count: number
  topic_key: string | null
  updated_at: string
  topic_slug: string | null
  topic_title: string | null
}

export type ExploreTopicHub = {
  topic_id: string
  slug: string
  title: string
  summary: string | null
  topic_description: string | null
  status: string
  updated_at: string
  controversy_count: number
  controversies: ExploreControversyListItem[]
  assessments: ExploreAssessment[]
  related_topics: Array<{ slug: string; title: string }>
}

export type ExploreAssessment = {
  uid: string
  kind: string | null
  summary: string | null
  confidence: number | null
  layer: string
}

export type ExploreViewpoint = {
  uid: string
  label: string
  summary: string | null
  thesis: string | null
  member_count: number
  sample_propositions: SampleProposition[]
  grounding_summary: string | null
}

export type ExploreEvidenceExcerpt = {
  id: number
  proposition_uid: string
  proposition_text: string | null
  utterance_uid: string | null
  speaker_name: string | null
  document_uid: string | null
  excerpt: string | null
  publication_name: string | null
  story_title: string | null
  story_url: string | null
}

export type ExploreControversyDetail = {
  uid: string
  question: string
  summary: string | null
  sides_count: number
  source_count: number
  topic_key: string | null
  updated_at: string
  shared_bullets: string[]
  clash_bullets: string[]
  dispute_bullets: string[]
  viewpoints: ExploreViewpoint[]
  assessments: ExploreAssessment[]
  related: ExploreControversyListItem[]
  topic_slug: string | null
  topic_title: string | null
  saved: boolean
}

export type ExploreEntityDossier = {
  uid: string
  name: string
  kind: string | null
  propositions: Array<{ uid: string; text: string; controversy_uid: string | null }>
  controversies: ExploreControversyListItem[]
}

export type PersonOffice = {
  uid: string
  name: string
  title: string | null
}

export type PersonStats = {
  coverage_30d: number
  coverage_prior_30d: number
  delta_pct: number
  fire_rating: number
  claim_count: number
  debate_count: number
  mention_count: number
  publisher_count: number
  document_count: number
}

export type PersonPublisher = {
  publication_uid: string
  name: string
  doc_count: number
}

export type PersonDocument = {
  document_uid: string
  story_title: string | null
  publication_name: string | null
  story_url: string | null
  published_at: string | null
  mention_count: number
}

export type PersonRelated = {
  uid: string
  name: string
  kind_hint: string | null
  co_mention_count: number
}

export type PersonPulseBucket = {
  bucket: string
  doc_count: number
}

export type PersonRemark = {
  proposition_uid: string
  text: string
  agent_name: string
}

export type PersonTopic = {
  key: string
  label: string
  debate_count: number
}

export type PersonEidosNode = {
  id: string
  label: string
  kind: string
  size: number
}

export type PersonEidosEdge = {
  source: string
  target: string
}

export type PersonEidosGraph = {
  nodes: PersonEidosNode[]
  edges: PersonEidosEdge[]
}

export type ExplorePersonProfile = {
  uid: string
  name: string
  normalized_name: string | null
  offices: PersonOffice[]
  stats: PersonStats
  publishers: PersonPublisher[]
  recent_documents: PersonDocument[]
  controversies: ExploreControversyListItem[]
  sample_propositions: Array<{ uid: string; text: string; controversy_uid: string | null }>
  related_people: PersonRelated[]
  pulse: PersonPulseBucket[]
  attributed_remarks: PersonRemark[]
  topics: PersonTopic[]
  eidos: PersonEidosGraph
  updated_at: string | null
  projected: boolean
}
