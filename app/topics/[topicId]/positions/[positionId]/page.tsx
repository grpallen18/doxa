import { redirect } from 'next/navigation'
import { topicHubPath } from '@/lib/explore-routes'

type PageProps = {
  params: Promise<{ topicId: string; positionId: string }>
}

/** Mock position deep-dives retired — send users to the topic hub. */
export default async function LegacyPositionRedirect({ params }: PageProps) {
  const { topicId } = await params
  redirect(topicHubPath(topicId))
}
