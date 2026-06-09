import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Bot,
  CalendarDays,
  GitFork,
  Handshake,
  Megaphone,
  ScrollText,
  Tags,
  TextQuote,
} from 'lucide-react'

export type EntityRecordKind =
  | 'story'
  | 'chunk'
  | 'claim'
  | 'position'
  | 'event'
  | 'agreement'
  | 'controversy'
  | 'agent'
  | 'topic'

export const ENTITY_RECORD_ICONS: Record<EntityRecordKind, LucideIcon> = {
  story: BookOpen,
  chunk: ScrollText,
  claim: TextQuote,
  position: Megaphone,
  event: CalendarDays,
  agreement: Handshake,
  controversy: GitFork,
  agent: Bot,
  topic: Tags,
}

export const ENTITY_RECORD_ICON_LABELS: Record<EntityRecordKind, string> = {
  story: 'Story',
  chunk: 'Chunk',
  claim: 'Claim',
  position: 'Position',
  event: 'Event',
  agreement: 'Agreement',
  controversy: 'Controversy',
  agent: 'Agent',
  topic: 'Topic',
}
