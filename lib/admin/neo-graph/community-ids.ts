export const COMMUNITY_UNLINKED = 'unlinked'
export const COMMUNITY_BRIDGE = 'bridge'

export function controversyCommunityId(uid: string): string {
  return `controversy:${uid}`
}

export function publicationCommunityId(uid: string): string {
  return `publication:${uid}`
}

export function isIslandCommunityId(id: string | null | undefined): boolean {
  if (!id) return false
  return id !== COMMUNITY_UNLINKED && id !== COMMUNITY_BRIDGE
}
