import { notFound } from 'next/navigation'
import { TopicExplorePage } from '@/components/topic-explore-page'
import { findTopicById } from '@/lib/mock/topic-explore'

type TopicPageProps = {
  params: Promise<{ topicId: string }>
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { topicId } = await params
  const topic = findTopicById(topicId)

  if (!topic) {
    notFound()
  }

  return <TopicExplorePage topic={topic} />
}
