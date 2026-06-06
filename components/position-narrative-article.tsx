import { PositionLinkList } from '@/components/position-link-list'
import { ClaimLinkList, PrimaryArgumentsList } from '@/components/position-explore-lists'
import type { ExploreLinkListLayout } from '@/lib/explore-link-styles'
import { narrativeSectionDomId } from '@/lib/position-toc'
import type { Position, PositionNarrative, PositionNarrativeSection, Topic } from '@/lib/mock/topic-explore'

const TOP_CLAIMS_LIMIT = 10

function topClaims(position: Position) {
  return [...position.supportingClaims]
    .sort((a, b) => b.agreement - a.agreement)
    .slice(0, TOP_CLAIMS_LIMIT)
}

function PrimaryClaimsList({
  position,
  layout = 'stack',
}: {
  position: Position
  layout?: ExploreLinkListLayout
}) {
  return (
    <div data-testid="position-primary-claims">
      <ClaimLinkList
        claims={topClaims(position)}
        linkTestId="position-primary-claim-link"
        layout={layout}
      />
    </div>
  )
}

function NarrativeSectionBlock({
  section,
  positionId,
  topic,
  position,
  pageTitle,
  depth = 0,
  linkLayout = 'stack',
}: {
  section: PositionNarrativeSection
  positionId: string
  topic: Topic
  position: Position
  pageTitle: string
  depth?: number
  linkLayout?: ExploreLinkListLayout
}) {
  const isPageTitle = depth === 0 && section.id === 'overview'
  const Heading = isPageTitle ? 'h1' : 'h2'
  const headingLabel = isPageTitle ? pageTitle : section.title
  const headingClassName = isPageTitle
    ? 'mb-4 scroll-mt-[calc(var(--header-height)+1rem)] text-2xl font-semibold tracking-tight text-foreground'
    : depth === 0
      ? 'flow-root scroll-mt-[calc(var(--header-height)+1rem)] border-b border-heading pb-1 text-base font-semibold text-foreground'
      : 'flow-root scroll-mt-[calc(var(--header-height)+1rem)] border-b border-subtle pb-1 text-sm font-semibold text-foreground'

  return (
    <section className={depth === 0 && !isPageTitle ? 'mt-8 space-y-4' : 'space-y-4'}>
      <Heading id={narrativeSectionDomId(positionId, section.id)} className={headingClassName}>
        {headingLabel}
      </Heading>

      {section.paragraphs?.map((paragraph, index) => (
        <p key={index} className="text-sm leading-relaxed text-foreground/90">
          {paragraph}
        </p>
      ))}

      {section.sections?.map((child) => (
        <NarrativeSectionBlock
          key={child.id}
          section={child}
          positionId={positionId}
          topic={topic}
          position={position}
          pageTitle={pageTitle}
          depth={depth + 1}
          linkLayout={section.id === 'see-also' ? 'auto-grid' : linkLayout}
        />
      ))}

      {(section.renderAs === 'primary-claims' || section.renderAs === 'common-claims') && (
        <PrimaryClaimsList position={position} layout={linkLayout} />
      )}

      {section.renderAs === 'primary-arguments' && (
        <PrimaryArgumentsList
          topic={topic}
          position={position}
          positionId={positionId}
          layout={linkLayout}
        />
      )}

      {section.renderAs === 'sibling-positions' && (
        <PositionLinkList
          topic={topic}
          positions={topic.positions}
          excludePositionId={positionId}
          linkTestId="position-counterargument-link"
          layout={linkLayout}
        />
      )}
    </section>
  )
}

export function PositionNarrativeArticle({
  narrative,
  positionId,
  topic,
  position,
}: {
  narrative: PositionNarrative
  positionId: string
  topic: Topic
  position: Position
}) {
  return (
    <article className="contents" data-testid="position-narrative">
      {narrative.sections.map((section) => (
        <NarrativeSectionBlock
          key={section.id}
          section={section}
          positionId={positionId}
          topic={topic}
          position={position}
          pageTitle={narrative.title}
        />
      ))}
    </article>
  )
}
