import type { TocSection } from '@/components/topic-explore-context'
import type { Position, PositionNarrative, PositionNarrativeSection } from '@/lib/mock/topic-explore'

export function positionSectionId(positionId: string) {
  return `position-${positionId}`
}

export function narrativeSectionDomId(positionId: string, narrativeSectionId: string) {
  return `${positionSectionId(positionId)}-narrative-${narrativeSectionId}`
}

export function narrativeSectionHasRenderAs(
  sections: PositionNarrativeSection[],
  renderAs: NonNullable<PositionNarrativeSection['renderAs']>
): boolean {
  for (const section of sections) {
    if (section.renderAs === renderAs) return true
    if (section.sections && narrativeSectionHasRenderAs(section.sections, renderAs)) return true
  }
  return false
}

export function narrativeHasSeeAlso(narrative: PositionNarrative): boolean {
  return narrative.sections.some((section) => section.id === 'see-also')
}

function narrativeSectionTocTitle(
  section: PositionNarrativeSection,
  narrative: PositionNarrative
): string {
  if (section.id === 'overview') return narrative.title
  return section.title
}

function appendNarrativeTocSections(
  sections: TocSection[],
  positionId: string,
  narrative: PositionNarrative,
  narrativeSections: PositionNarrativeSection[],
  depth = 0
) {
  for (const section of narrativeSections) {
    sections.push({
      id: narrativeSectionDomId(positionId, section.id),
      title: narrativeSectionTocTitle(section, narrative),
      depth,
    })

    if (section.sections) {
      appendNarrativeTocSections(sections, positionId, narrative, section.sections, depth + 1)
    }
  }
}

export function buildPositionTocSections(position: Position): TocSection[] {
  const baseId = positionSectionId(position.id)
  const sections: TocSection[] = []

  if (!position.narrative) {
    sections.push({
      id: `${baseId}-title`,
      title: position.headline,
      depth: 0,
    })
  } else {
    appendNarrativeTocSections(sections, position.id, position.narrative, position.narrative.sections)
  }

  if (
    !position.narrative ||
    !narrativeSectionHasRenderAs(position.narrative.sections, 'primary-claims') &&
    !narrativeSectionHasRenderAs(position.narrative.sections, 'common-claims')
  ) {
    sections.push({ id: `${baseId}-supporting`, title: 'Key supporting claims', depth: 0 })
  }

  if (!position.narrative || !narrativeHasSeeAlso(position.narrative)) {
    sections.push(
      { id: `${baseId}-opposing`, title: 'Top opposing claims', depth: 0 },
      { id: `${baseId}-controversies`, title: 'Related controversies', depth: 0 }
    )
  }

  return sections
}
