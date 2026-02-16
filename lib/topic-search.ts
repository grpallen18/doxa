import { createClient } from '@/lib/supabase/server'

export type TopicSearchResult = {
  topic_id: string
  title: string
  slug: string
  summary: string | null
}

function relevanceScore(topic: TopicSearchResult, q: string): number {
  const qLower = q.toLowerCase()
  const titleLower = topic.title.toLowerCase()
  const slugLower = topic.slug.toLowerCase()
  if (titleLower === qLower) return 100
  if (titleLower.startsWith(qLower)) return 90
  if (slugLower.startsWith(qLower)) return 80
  if (titleLower.includes(qLower)) return 70
  if (slugLower.includes(qLower)) return 60
  if (topic.summary?.toLowerCase().includes(qLower)) return 50
  return 0
}

export async function searchTopics(q: string, limit = 20): Promise<TopicSearchResult[]> {
  const trimmed = q.trim()
  if (trimmed.length < 1) return []

  const supabase = await createClient()
  const pattern = `%${trimmed}%`
  const { data: rows, error } = await supabase
    .from('topics')
    .select('topic_id, title, slug, summary')
    .or(`title.ilike.${pattern},slug.ilike.${pattern},summary.ilike.${pattern}`)
    .limit(limit * 2)

  if (error) return []

  const topics = (rows ?? []) as TopicSearchResult[]
  return topics
    .map((t) => ({ topic: t, score: relevanceScore(t, trimmed) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.topic)
}
