import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getControversyDetail } from '@/lib/explore/queries'
import { ControversyExplorePage } from '@/components/explore/controversy-explore-page'

type PageProps = {
  params: Promise<{ uid: string }>
}

export default async function ControversyPage({ params }: PageProps) {
  const { uid } = await params
  const decoded = decodeURIComponent(uid)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const detail = await getControversyDetail(supabase, decoded, user?.id)
  if (!detail) notFound()
  return <ControversyExplorePage detail={detail} isAuthenticated={Boolean(user)} />
}
