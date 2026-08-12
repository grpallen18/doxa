import { hashSeed } from '@/lib/admin/neo-graph/layout-pipeline'
import {
  COMMUNITY_BRIDGE,
  COMMUNITY_UNLINKED,
} from '@/lib/admin/neo-graph/community-ids'
import { deriveNeoBorderColor } from '@/lib/admin/neo-graph/colors'

/** Island hues inspired by the nebula / clustered-graph references. */
export const NEO_COMMUNITY_PALETTE = [
  '#5ee4ff',
  '#f4a261',
  '#e9d8a6',
  '#e6397a',
  '#90be6d',
  '#b8a1ff',
  '#f77f00',
  '#43aa8b',
  '#c9ada7',
  '#4cc9f0',
] as const

export function resolveCommunityColor(communityId: string | null | undefined): string {
  if (!communityId || communityId === COMMUNITY_UNLINKED) return '#6b7280'
  if (communityId === COMMUNITY_BRIDGE) return '#9aa4ad'
  return NEO_COMMUNITY_PALETTE[hashSeed(communityId) % NEO_COMMUNITY_PALETTE.length]
}

export function resolveCommunityAppearance(communityId: string | null | undefined): {
  color: string
  borderColor: string
} {
  const color = resolveCommunityColor(communityId)
  return { color, borderColor: deriveNeoBorderColor(color) }
}
