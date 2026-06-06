import { notFound } from 'next/navigation'
import { PositionExplorePage } from '@/components/position-explore-page'
import { getTopicPosition } from '@/lib/mock/topic-explore'

type PositionPageProps = {
  params: Promise<{ topicId: string; positionId: string }>
}

export default async function PositionPage({ params }: PositionPageProps) {
  const { topicId, positionId } = await params
  const result = getTopicPosition(topicId, positionId)

  if (!result) {
    notFound()
  }

  return <PositionExplorePage topic={result.topic} position={result.position} />
}
