import type { Topic } from '@/lib/mock/topic-explore'

export function TopicHeader({ topic }: { topic: Topic }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{topic.title}</h1>
    </header>
  )
}
