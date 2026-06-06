import { PositionLinkList } from '@/components/position-link-list'
import { narrativeSectionDomId } from '@/lib/position-toc'
import type { PositionNarrative, Topic } from '@/lib/mock/topic-explore'

export function PositionNarrativeArticle({
  narrative,
  positionId,
  topic,
}: {
  narrative: PositionNarrative
  positionId: string
  topic: Topic
}) {
  return (
    <article className="contents" data-testid="position-narrative">
      {narrative.sections.map((section) => (
        <section key={section.id} className="mt-8 space-y-4">
          <h2
            id={narrativeSectionDomId(positionId, section.id)}
            className="flow-root scroll-mt-[calc(var(--header-height)+1rem)] border-b border-subtle pb-1 text-base font-semibold text-foreground"
          >
            {section.title}
          </h2>
          {section.renderAs === 'sibling-positions' ? (
            <PositionLinkList
              topic={topic}
              positions={topic.positions}
              excludePositionId={positionId}
              linkTestId="position-counterargument-link"
            />
          ) : (
            section.paragraphs?.map((paragraph, index) => (
              <p key={index} className="text-sm leading-relaxed text-foreground/90">
                {paragraph}
              </p>
            ))
          )}
        </section>
      ))}
    </article>
  )
}
