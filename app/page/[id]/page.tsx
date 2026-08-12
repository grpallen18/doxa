import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { topicHubPath } from '@/lib/explore-routes'

type PageProps = {
  params: Promise<{ id: string }>
}

/** Legacy topic route → new hub by slug when possible. */
export default async function LegacyTopicRedirect({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('topics')
    .select('slug')
    .eq('topic_id', id)
    .maybeSingle()
  if (data?.slug) {
    redirect(topicHubPath(data.slug as string))
  }
  redirect('/')
}
