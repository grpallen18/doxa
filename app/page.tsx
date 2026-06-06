import { redirect } from 'next/navigation'
import { defaultTopicId } from '@/lib/mock/topic-explore'
import { topicPath } from '@/lib/topic-routes'

export default function Home() {
  redirect(topicPath(defaultTopicId))
}
