import type { SupabaseClient } from '@supabase/supabase-js'
import { TOPIC_HUB_DENSITY_BAR } from '@/lib/explore-routes'
import type {
  ExploreAssessment,
  ExploreControversyDetail,
  ExploreControversyListItem,
  ExploreEvidenceExcerpt,
  ExploreTopicHub,
  ExploreViewpoint,
  SampleProposition,
} from '@/lib/explore/types'
import { searchPeople } from '@/lib/explore/person'

type Sb = SupabaseClient

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

function asSampleProps(value: unknown): SampleProposition[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const r = row as { uid?: unknown; text?: unknown }
      if (typeof r.uid !== 'string' || typeof r.text !== 'string') return null
      return { uid: r.uid, text: r.text }
    })
    .filter((r): r is SampleProposition => r !== null)
}

function controversyQuestion(row: {
  question?: string | null
  title?: string | null
}): string {
  return (row.question || row.title || 'Untitled debate').trim()
}

async function topicLinksForControversies(
  supabase: Sb,
  uids: string[]
): Promise<Map<string, { slug: string; title: string }>> {
  const map = new Map<string, { slug: string; title: string }>()
  if (!uids.length) return map
  const { data } = await supabase
    .from('graph_topic_links')
    .select('controversy_uid, topics(slug, title)')
    .in('controversy_uid', uids)
  for (const row of data ?? []) {
    const topic = row.topics as { slug?: string; title?: string } | { slug?: string; title?: string }[] | null
    const t = Array.isArray(topic) ? topic[0] : topic
    if (row.controversy_uid && t?.slug) {
      map.set(row.controversy_uid as string, {
        slug: t.slug,
        title: t.title ?? t.slug,
      })
    }
  }
  return map
}

export async function listTrendingControversies(
  supabase: Sb,
  limit = 12
): Promise<ExploreControversyListItem[]> {
  const { data, error } = await supabase
    .from('graph_controversies')
    .select('uid, title, question, summary, sides_count, source_count, topic_key, updated_at, ranking_score')
    .eq('status', 'open')
    .order('ranking_score', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = data ?? []
  const links = await topicLinksForControversies(
    supabase,
    rows.map((r) => r.uid as string)
  )
  return rows.map((r) => {
    const link = links.get(r.uid as string)
    return {
      uid: r.uid as string,
      question: controversyQuestion(r),
      summary: (r.summary as string | null) ?? null,
      sides_count: Number(r.sides_count) || 0,
      source_count: Number(r.source_count) || 0,
      topic_key: (r.topic_key as string | null) ?? null,
      updated_at: r.updated_at as string,
      topic_slug: link?.slug ?? null,
      topic_title: link?.title ?? null,
    }
  })
}

export async function listFeaturedTopics(supabase: Sb): Promise<
  Array<{
    slug: string
    title: string
    summary: string | null
    controversy_count: number
  }>
> {
  const { data: links } = await supabase.from('graph_topic_links').select('topic_id, controversy_uid')
  const counts = new Map<string, number>()
  for (const row of links ?? []) {
    const id = row.topic_id as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const eligibleIds = [...counts.entries()]
    .filter(([, n]) => n >= TOPIC_HUB_DENSITY_BAR)
    .map(([id]) => id)
  if (!eligibleIds.length) return []

  const { data: topics } = await supabase
    .from('topics')
    .select('topic_id, slug, title, summary, status')
    .in('topic_id', eligibleIds)
    .in('status', ['published', 'stable', 'under_review'])

  return (topics ?? [])
    .map((t) => ({
      slug: t.slug as string,
      title: (t.title as string) || (t.slug as string),
      summary: (t.summary as string | null) ?? null,
      controversy_count: counts.get(t.topic_id as string) ?? 0,
    }))
    .sort((a, b) => b.controversy_count - a.controversy_count)
}

export async function searchExplore(
  supabase: Sb,
  q: string,
  limit = 20
): Promise<{
  controversies: ExploreControversyListItem[]
  topics: Array<{ slug: string; title: string; summary: string | null }>
  people: Array<{ uid: string; name: string; fire_rating: number; debate_count: number }>
}> {
  const term = q.trim().replace(/[%_,.()']/g, ' ').replace(/\s+/g, ' ').trim()
  if (!term) return { controversies: [], topics: [], people: [] }

  const pattern = `%${term}%`
  const [ctrRes, topicRes, people] = await Promise.all([
    supabase
      .from('graph_controversies')
      .select('uid, title, question, summary, sides_count, source_count, topic_key, updated_at')
      .eq('status', 'open')
      .or(
        `question.ilike.${pattern},title.ilike.${pattern},summary.ilike.${pattern},topic_key.ilike.${pattern}`
      )
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabase
      .from('topics')
      .select('slug, title, summary, status')
      .or(`title.ilike.${pattern},slug.ilike.${pattern},summary.ilike.${pattern}`)
      .in('status', ['published', 'stable', 'under_review'])
      .limit(limit),
    searchPeople(supabase, term, Math.min(12, limit)),
  ])

  const rows = ctrRes.data ?? []
  const links = await topicLinksForControversies(
    supabase,
    rows.map((r) => r.uid as string)
  )

  return {
    controversies: rows.map((r) => {
      const link = links.get(r.uid as string)
      return {
        uid: r.uid as string,
        question: controversyQuestion(r),
        summary: (r.summary as string | null) ?? null,
        sides_count: Number(r.sides_count) || 0,
        source_count: Number(r.source_count) || 0,
        topic_key: (r.topic_key as string | null) ?? null,
        updated_at: r.updated_at as string,
        topic_slug: link?.slug ?? null,
        topic_title: link?.title ?? null,
      }
    }),
    topics: (topicRes.data ?? []).map((t) => ({
      slug: t.slug as string,
      title: (t.title as string) || (t.slug as string),
      summary: (t.summary as string | null) ?? null,
    })),
    people,
  }
}

export async function getTopicHub(supabase: Sb, slug: string): Promise<ExploreTopicHub | null> {
  const { data: topic, error } = await supabase
    .from('topics')
    .select('topic_id, slug, title, summary, topic_description, status, updated_at')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!topic) return null

  const { data: links } = await supabase
    .from('graph_topic_links')
    .select('controversy_uid')
    .eq('topic_id', topic.topic_id)

  const uids = (links ?? []).map((l) => l.controversy_uid as string)
  let controversies: ExploreControversyListItem[] = []
  if (uids.length) {
    const { data: rows } = await supabase
      .from('graph_controversies')
      .select('uid, title, question, summary, sides_count, source_count, topic_key, updated_at')
      .in('uid', uids)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
    controversies = (rows ?? []).map((r) => ({
      uid: r.uid as string,
      question: controversyQuestion(r),
      summary: (r.summary as string | null) ?? null,
      sides_count: Number(r.sides_count) || 0,
      source_count: Number(r.source_count) || 0,
      topic_key: (r.topic_key as string | null) ?? null,
      updated_at: r.updated_at as string,
      topic_slug: topic.slug as string,
      topic_title: (topic.title as string) || (topic.slug as string),
    }))
  }

  const assessments = await loadAssessments(supabase, 'controversy', uids)

  const { data: rels } = await supabase
    .from('topic_relationships')
    .select('source_topic_id, target_topic_id')
    .or(`source_topic_id.eq.${topic.topic_id},target_topic_id.eq.${topic.topic_id}`)
    .limit(12)

  const relatedIds = [
    ...new Set(
      (rels ?? [])
        .map((r) =>
          r.source_topic_id === topic.topic_id ? r.target_topic_id : r.source_topic_id
        )
        .filter((id) => id !== topic.topic_id)
    ),
  ] as string[]

  let related_topics: Array<{ slug: string; title: string }> = []
  if (relatedIds.length) {
    const { data: relatedRows } = await supabase
      .from('topics')
      .select('slug, title')
      .in('topic_id', relatedIds)
    related_topics = (relatedRows ?? []).map((t) => ({
      slug: t.slug as string,
      title: (t.title as string) || (t.slug as string),
    }))
  }

  return {
    topic_id: topic.topic_id as string,
    slug: topic.slug as string,
    title: (topic.title as string) || (topic.slug as string),
    summary: (topic.summary as string | null) ?? null,
    topic_description: (topic.topic_description as string | null) ?? null,
    status: topic.status as string,
    updated_at: topic.updated_at as string,
    controversy_count: controversies.length,
    controversies,
    assessments,
    related_topics,
  }
}

async function loadAssessments(
  supabase: Sb,
  targetKind: string,
  targetUids: string[]
): Promise<ExploreAssessment[]> {
  if (!targetUids.length) return []
  const { data } = await supabase
    .from('graph_assessments')
    .select('uid, kind, summary, confidence, layer, target_uid')
    .eq('target_kind', targetKind)
    .in('target_uid', targetUids)
    .limit(20)
  return (data ?? []).map((a) => ({
    uid: a.uid as string,
    kind: (a.kind as string | null) ?? null,
    summary: (a.summary as string | null) ?? null,
    confidence: a.confidence == null ? null : Number(a.confidence),
    layer: (a.layer as string) || 'analyzed',
  }))
}

export async function getControversyDetail(
  supabase: Sb,
  uid: string,
  userId?: string | null
): Promise<ExploreControversyDetail | null> {
  const { data: row, error } = await supabase
    .from('graph_controversies')
    .select(
      'uid, title, question, summary, sides_count, source_count, topic_key, updated_at, shared_bullets, clash_bullets, dispute_bullets'
    )
    .eq('uid', uid)
    .maybeSingle()
  if (error) throw error
  if (!row) return null

  const { data: vpRows } = await supabase
    .from('graph_viewpoints')
    .select(
      'uid, label, summary, thesis, member_count, sample_propositions, grounding_summary'
    )
    .eq('controversy_uid', uid)
    .order('member_count', { ascending: false })

  const viewpoints: ExploreViewpoint[] = (vpRows ?? []).map((v) => ({
    uid: v.uid as string,
    label: (v.label as string) || 'Viewpoint',
    summary: (v.summary as string | null) ?? null,
    thesis: (v.thesis as string | null) ?? null,
    member_count: Number(v.member_count) || 0,
    sample_propositions: asSampleProps(v.sample_propositions),
    grounding_summary: (v.grounding_summary as string | null) ?? null,
  }))

  const assessments = await loadAssessments(supabase, 'controversy', [uid])
  const links = await topicLinksForControversies(supabase, [uid])
  const link = links.get(uid)

  let related: ExploreControversyListItem[] = []
  if (row.topic_key) {
    const { data: relatedRows } = await supabase
      .from('graph_controversies')
      .select('uid, title, question, summary, sides_count, source_count, topic_key, updated_at')
      .eq('topic_key', row.topic_key)
      .eq('status', 'open')
      .neq('uid', uid)
      .order('updated_at', { ascending: false })
      .limit(8)
    const relatedLinks = await topicLinksForControversies(
      supabase,
      (relatedRows ?? []).map((r) => r.uid as string)
    )
    related = (relatedRows ?? []).map((r) => {
      const rl = relatedLinks.get(r.uid as string)
      return {
        uid: r.uid as string,
        question: controversyQuestion(r),
        summary: (r.summary as string | null) ?? null,
        sides_count: Number(r.sides_count) || 0,
        source_count: Number(r.source_count) || 0,
        topic_key: (r.topic_key as string | null) ?? null,
        updated_at: r.updated_at as string,
        topic_slug: rl?.slug ?? null,
        topic_title: rl?.title ?? null,
      }
    })
  }

  let saved = false
  if (userId) {
    const { data: saveRow } = await supabase
      .from('user_saved_controversies')
      .select('controversy_uid')
      .eq('user_id', userId)
      .eq('controversy_uid', uid)
      .maybeSingle()
    saved = Boolean(saveRow)
  }

  return {
    uid: row.uid as string,
    question: controversyQuestion(row),
    summary: (row.summary as string | null) ?? null,
    sides_count: Number(row.sides_count) || 0,
    source_count: Number(row.source_count) || 0,
    topic_key: (row.topic_key as string | null) ?? null,
    updated_at: row.updated_at as string,
    shared_bullets: asStringArray(row.shared_bullets),
    clash_bullets: asStringArray(row.clash_bullets),
    dispute_bullets: asStringArray(row.dispute_bullets),
    viewpoints,
    assessments,
    related,
    topic_slug: link?.slug ?? null,
    topic_title: link?.title ?? null,
    saved,
  }
}

export async function getEvidenceForProposition(
  supabase: Sb,
  controversyUid: string,
  propositionUid: string
): Promise<ExploreEvidenceExcerpt[]> {
  const { data, error } = await supabase
    .from('graph_evidence_excerpts')
    .select(
      'id, proposition_uid, proposition_text, utterance_uid, speaker_name, document_uid, excerpt, publication_name, story_title, story_url'
    )
    .eq('controversy_uid', controversyUid)
    .eq('proposition_uid', propositionUid)
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: Number(e.id),
    proposition_uid: e.proposition_uid as string,
    proposition_text: (e.proposition_text as string | null) ?? null,
    utterance_uid: (e.utterance_uid as string | null) ?? null,
    speaker_name: (e.speaker_name as string | null) ?? null,
    document_uid: (e.document_uid as string | null) ?? null,
    excerpt: (e.excerpt as string | null) ?? null,
    publication_name: (e.publication_name as string | null) ?? null,
    story_title: (e.story_title as string | null) ?? null,
    story_url: (e.story_url as string | null) ?? null,
  }))
}

export async function getEvidenceBundle(
  supabase: Sb,
  controversyUid: string
): Promise<ExploreEvidenceExcerpt[]> {
  const { data, error } = await supabase
    .from('graph_evidence_excerpts')
    .select(
      'id, proposition_uid, proposition_text, utterance_uid, speaker_name, document_uid, excerpt, publication_name, story_title, story_url'
    )
    .eq('controversy_uid', controversyUid)
    .order('id', { ascending: true })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: Number(e.id),
    proposition_uid: e.proposition_uid as string,
    proposition_text: (e.proposition_text as string | null) ?? null,
    utterance_uid: (e.utterance_uid as string | null) ?? null,
    speaker_name: (e.speaker_name as string | null) ?? null,
    document_uid: (e.document_uid as string | null) ?? null,
    excerpt: (e.excerpt as string | null) ?? null,
    publication_name: (e.publication_name as string | null) ?? null,
    story_title: (e.story_title as string | null) ?? null,
    story_url: (e.story_url as string | null) ?? null,
  }))
}
