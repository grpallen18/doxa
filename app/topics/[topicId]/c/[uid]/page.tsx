import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getControversyDetail, getTopicHub } from '@/lib/explore/queries'
import { ControversyExplorePage } from '@/components/explore/controversy-explore-page'

type PageProps = {
  params: Promise<{ topicId: string; uid: string }>
}

export default async function TopicControversyPage({ params }: PageProps) {
  const { topicId: slug, uid } = await params
  const decoded = decodeURIComponent(uid)
  const supabase = await createClient()
  const hub = await getTopicHub(supabase, slug)
  if (!hub) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const detail = await getControversyDetail(supabase, decoded, user?.id)
  if (!detail) notFound()

  // Prefer hub breadcrumb context even if link table missed this uid.
  const enriched = {
    ...detail,
    topic_slug: detail.topic_slug ?? hub.slug,
    topic_title: detail.topic_title ?? hub.title,
  }

  return <ControversyExplorePage detail={enriched} isAuthenticated={Boolean(user)} />
}
