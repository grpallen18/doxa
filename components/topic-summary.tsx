import type { Topic } from '@/lib/mock/topic-explore'

export function TopicSummary({ topic }: { topic: Topic }) {
  if (topic.briefParagraphs.length === 0) return null

  return (
    <div className="space-y-3" data-testid="topic-summary">
      {topic.briefParagraphs.map((paragraph, index) => (
        <p key={index} className="text-sm leading-relaxed text-foreground/90">
          {paragraph}
        </p>
      ))}
    </div>
  )
}
