import type { TocSection } from '@/components/topic-explore-context'
import type { Position } from '@/lib/mock/topic-explore'

export function positionSectionId(positionId: string) {
  return `position-${positionId}`
}

export function narrativeSectionDomId(positionId: string, narrativeSectionId: string) {
  return `${positionSectionId(positionId)}-narrative-${narrativeSectionId}`
}

export function buildPositionTocSections(position: Position): TocSection[] {
  const baseId = positionSectionId(position.id)
  const pageTitle = position.narrative?.title ?? position.headline

  const sections: TocSection[] = [{ id: `${baseId}-title`, title: pageTitle }]

  if (position.narrative) {
    for (const section of position.narrative.sections) {
      sections.push({
        id: narrativeSectionDomId(position.id, section.id),
        title: section.title,
      })
    }
  }

  sections.push(
    { id: `${baseId}-supporting`, title: 'Key supporting claims' },
    { id: `${baseId}-opposing`, title: 'Top opposing claims' },
    { id: `${baseId}-controversies`, title: 'Related controversies' }
  )

  return sections
}
