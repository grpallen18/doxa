import type { Topic } from '@/lib/mock/topic-explore'

export function TopicHeader({ topic }: { topic: Topic }) {
  return (
    <header>
      <h1
        id={`topic-${topic.id}`}
        className="scroll-mt-[calc(var(--header-height)+1rem)] text-2xl font-semibold tracking-tight text-foreground"
      >
        {topic.title}
      </h1>
    </header>
  )
}
