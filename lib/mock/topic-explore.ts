/**
 * Mock fixture for the topic-explorer home (until wired to the DB).
 *
 * This is intentionally static, branch-only data shaped to match docs/UI Layout.png.
 * No Supabase / API reads. When the experiment is promoted, these shapes can be
 * swapped for real query results without touching the presentational components.
 */

import { immigrationPositionOverview } from './immigration-position-overview'

export type Level = 'Low' | 'Moderate' | 'High' | 'Very High'

export type TopicNavItem = {
  id: string
  title: string
}

export type TopicStat = {
  id: string
  label: string
  value: string
}

export type SupportingClaim = {
  id: string
  text: string
  agreement: number
  sources: number
}

export type OpposingClaim = {
  id: string
  text: string
  agreement: number
  sources: number
}

export type RelatedControversy = {
  id: string
  title: string
  impact: Level
  /** Normalized 0-1 points for the inline sparkline. */
  trend: number[]
}

export type PositionAdvocate = {
  id: string
  name: string
}

/** Total agree % for each party. */
export type PartyAgreement = {
  republican: number
  democrat: number
}

export type PositionNarrativeSection = {
  id: string
  title: string
  paragraphs?: string[]
  /** Linked list of sibling topic positions (excludes the current position). */
  renderAs?: 'sibling-positions'
}

export type PositionNarrative = {
  title: string
  /** Lead paragraphs rendered under the page title without a section heading. */
  intro?: string[]
  sections: PositionNarrativeSection[]
}

export type Position = {
  id: string
  /** 1-based ordinal shown on the card. */
  ordinal: number
  headline: string
  description: string
  narrative?: PositionNarrative
  storyCount: number
  advocates: PositionAdvocate[]
  /** Share of people who agree with this position (0–100). */
  agreementPct: number
  partyAgreement: PartyAgreement
  sources: number
  /** Headline disagreement label shown in the detail panel header. */
  disagreement: string
  supportingClaims: SupportingClaim[]
  opposingClaims: OpposingClaim[]
  relatedControversies: RelatedControversy[]
}

export type Topic = {
  id: string
  title: string
  stats: TopicStat[]
  briefParagraphs: string[]
  positions: Position[]
}

export const topicNav: TopicNavItem[] = [
  { id: 'immigration', title: 'Immigration' },
  { id: 'climate-change', title: 'Climate Change' },
  { id: 'ukraine-war', title: 'Ukraine War' },
  { id: 'us-economy', title: 'U.S. Economy' },
  { id: 'ai-regulation', title: 'AI Regulation' },
]

const immigrationPositions: Position[] = [
  {
    id: 'pos-1',
    ordinal: 1,
    headline: 'Border enforcement must come first',
    narrative: immigrationPositionOverview,
    description:
      'Secure the border and expand enforcement before any other reform is considered legitimate.',
    storyCount: 412,
    advocates: [
      { id: 'a1-1', name: 'Greg Abbott' },
      { id: 'a1-2', name: 'Tom Homan' },
      { id: 'a1-3', name: 'Kristi Noem' },
    ],
    agreementPct: 58,
    partyAgreement: { republican: 80, democrat: 50 },
    sources: 982,
    disagreement: 'High disagreement',
    supportingClaims: [
      { id: 'p1-s1', text: 'Illegal crossings strain local services and budgets.', agreement: 81, sources: 240 },
      { id: 'p1-s2', text: 'Stronger deterrents reduce dangerous crossings.', agreement: 64, sources: 173 },
      { id: 'p1-s3', text: 'Rule of law requires consistent enforcement.', agreement: 70, sources: 198 },
    ],
    opposingClaims: [
      { id: 'p1-o1', text: 'Enforcement-only approaches ignore root causes.', agreement: 58, sources: 142 },
      { id: 'p1-o2', text: 'Hardline policy raises humanitarian costs.', agreement: 52, sources: 121 },
    ],
    relatedControversies: [
      { id: 'p1-c1', title: 'Border Security & Enforcement', impact: 'Very High', trend: [0.2, 0.4, 0.5, 0.7, 0.9, 0.8] },
      { id: 'p1-c2', title: 'Asylum Processing Backlogs', impact: 'High', trend: [0.3, 0.35, 0.5, 0.55, 0.6, 0.7] },
    ],
  },
  {
    id: 'pos-2',
    ordinal: 2,
    headline: 'Expand legal pathways for migrants',
    description:
      'Modernize visas and create more legal routes to relieve pressure on the asylum system.',
    storyCount: 528,
    advocates: [
      { id: 'a2-1', name: 'Alex Padilla' },
      { id: 'a2-2', name: 'Pramila Jayapal' },
      { id: 'a2-3', name: 'Jeb Bush' },
    ],
    agreementPct: 64,
    partyAgreement: { republican: 50, democrat: 72 },
    sources: 1124,
    disagreement: 'Moderate disagreement',
    supportingClaims: [
      { id: 'p2-s1', text: 'Legal pathways reduce reliance on smugglers.', agreement: 74, sources: 211 },
      { id: 'p2-s2', text: 'Labor shortages call for more work visas.', agreement: 68, sources: 187 },
      { id: 'p2-s3', text: 'Predictable routes ease border pressure.', agreement: 63, sources: 165 },
    ],
    opposingClaims: [
      { id: 'p2-o1', text: 'Expanded visas may depress local wages.', agreement: 49, sources: 118 },
      { id: 'p2-o2', text: 'New pathways are hard to administer quickly.', agreement: 44, sources: 96 },
    ],
    relatedControversies: [
      { id: 'p2-c1', title: 'Work Visa Reform', impact: 'High', trend: [0.4, 0.45, 0.5, 0.6, 0.65, 0.7] },
      { id: 'p2-c2', title: 'Labor Market Impact', impact: 'Moderate', trend: [0.3, 0.3, 0.4, 0.45, 0.5, 0.55] },
    ],
  },
  {
    id: 'pos-3',
    ordinal: 3,
    headline: 'The immigration system requires balanced reform',
    description:
      'Pair stronger enforcement with expanded legal pathways and a clear status process for those already here.',
    storyCount: 687,
    advocates: [
      { id: 'a3-1', name: 'Joe Biden' },
      { id: 'a3-2', name: 'Susan Collins' },
      { id: 'a3-3', name: 'Kyrsten Sinema' },
      { id: 'a3-4', name: 'Marco Rubio' },
    ],
    agreementPct: 66,
    partyAgreement: { republican: 60, democrat: 62 },
    sources: 1410,
    disagreement: 'Very High disagreement',
    supportingClaims: [
      { id: 'p3-s1', text: 'Comprehensive reform addresses both security and labor needs.', agreement: 79, sources: 312 },
      { id: 'p3-s2', text: 'A status process reduces an unsustainable backlog.', agreement: 71, sources: 268 },
      { id: 'p3-s3', text: 'Balanced policy holds broader public support.', agreement: 66, sources: 241 },
    ],
    opposingClaims: [
      { id: 'p3-o1', text: 'Bundled reform stalls on the most divisive pieces.', agreement: 61, sources: 198 },
      { id: 'p3-o2', text: 'Compromise satisfies neither enforcement nor advocacy goals.', agreement: 55, sources: 174 },
    ],
    relatedControversies: [
      { id: 'p3-c1', title: 'Border Security & Enforcement', impact: 'Very High', trend: [0.3, 0.5, 0.6, 0.8, 0.9, 0.95] },
      { id: 'p3-c2', title: 'Path to Legal Status', impact: 'High', trend: [0.4, 0.5, 0.55, 0.65, 0.75, 0.8] },
      { id: 'p3-c3', title: 'State vs Federal Authority', impact: 'Moderate', trend: [0.2, 0.3, 0.35, 0.4, 0.5, 0.55] },
    ],
  },
  {
    id: 'pos-4',
    ordinal: 4,
    headline: 'Prioritize humanitarian protection',
    description:
      'Center asylum rights and humane treatment, expanding protection for vulnerable migrants.',
    storyCount: 296,
    advocates: [
      { id: 'a4-1', name: 'Alexandria Ocasio-Cortez' },
      { id: 'a4-2', name: 'Ilhan Omar' },
      { id: 'a4-3', name: 'Pope Francis' },
    ],
    agreementPct: 55,
    partyAgreement: { republican: 44, democrat: 74 },
    sources: 768,
    disagreement: 'High disagreement',
    supportingClaims: [
      { id: 'p4-s1', text: 'Asylum is a legal and moral obligation.', agreement: 70, sources: 159 },
      { id: 'p4-s2', text: 'Detention conditions need stronger oversight.', agreement: 62, sources: 134 },
    ],
    opposingClaims: [
      { id: 'p4-o1', text: 'Broad protection can be exploited by non-qualifying claims.', agreement: 57, sources: 128 },
      { id: 'p4-o2', text: 'Capacity limits make rapid intake difficult.', agreement: 48, sources: 102 },
    ],
    relatedControversies: [
      { id: 'p4-c1', title: 'Asylum Processing Backlogs', impact: 'High', trend: [0.3, 0.4, 0.5, 0.55, 0.6, 0.65] },
      { id: 'p4-c2', title: 'Detention Standards', impact: 'Moderate', trend: [0.2, 0.25, 0.3, 0.4, 0.45, 0.5] },
    ],
  },
  {
    id: 'pos-5',
    ordinal: 5,
    headline: 'Shift immigration policy to states',
    description:
      'Give states more authority to set and enforce their own immigration and border measures.',
    storyCount: 143,
    advocates: [
      { id: 'a5-1', name: 'Ron DeSantis' },
      { id: 'a5-2', name: 'Greg Gianforte' },
    ],
    agreementPct: 60,
    partyAgreement: { republican: 68, democrat: 60 },
    sources: 421,
    disagreement: 'Moderate disagreement',
    supportingClaims: [
      { id: 'p5-s1', text: 'States face the most direct local impacts.', agreement: 59, sources: 88 },
      { id: 'p5-s2', text: 'Local control allows tailored responses.', agreement: 51, sources: 72 },
    ],
    opposingClaims: [
      { id: 'p5-o1', text: 'A patchwork of state rules creates legal chaos.', agreement: 64, sources: 110 },
      { id: 'p5-o2', text: 'Immigration is constitutionally a federal power.', agreement: 60, sources: 97 },
    ],
    relatedControversies: [
      { id: 'p5-c1', title: 'State vs Federal Authority', impact: 'High', trend: [0.2, 0.3, 0.45, 0.5, 0.6, 0.7] },
    ],
  },
]

const immigrationTopic: Topic = {
  id: 'immigration',
  title: 'Immigration',
  stats: [
    { id: 'positions', label: 'Main Positions', value: '4-5' },
    { id: 'claims', label: 'Key Claims', value: '128' },
    { id: 'sources', label: 'Sources', value: '3,482' },
    { id: 'countries', label: 'Countries', value: '24' },
    { id: 'languages', label: 'Languages', value: '12' },
  ],
  briefParagraphs: [
    'Immigration discourse splits sharply between enforcement-first and pathway-expansion camps, with a large middle that favors balanced reform pairing both. Public attention spikes around border events and major executive actions.',
    'Across thousands of sources in two dozen countries, the most durable agreement is that the current system is overwhelmed; the deepest disagreement is over sequencing — what must happen first.',
  ],
  positions: immigrationPositions,
}

export const topics: Topic[] = [immigrationTopic]

export const defaultTopicId = immigrationTopic.id

/** Default selected position to mirror the reference layout (Position 3). */
export const defaultPositionId = 'pos-3'

export function getTopicById(id: string | null | undefined): Topic {
  if (!id) return immigrationTopic
  return topics.find((t) => t.id === id) ?? immigrationTopic
}

export function findTopicById(id: string): Topic | null {
  return topics.find((t) => t.id === id) ?? null
}

export function getPositionById(topic: Topic, id: string | null | undefined): Position | null {
  if (!id) return null
  return topic.positions.find((p) => p.id === id) ?? null
}

export function getTopicPosition(
  topicId: string,
  positionId: string
): { topic: Topic; position: Position } | null {
  const topic = findTopicById(topicId)
  if (!topic) return null
  const position = getPositionById(topic, positionId)
  if (!position) return null
  return { topic, position }
}

export const detailTabs = ['Overview', 'Claims', 'Evidence', 'Sources', 'Trends'] as const
export type DetailTab = (typeof detailTabs)[number]
