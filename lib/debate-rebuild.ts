/** Product debate surfaces are paused while L3 is rebuilt. */

export function isDebateRebuildMode(): boolean {
  return process.env.DEBATE_REBUILD_MODE === 'true'
}

export const DEBATE_REBUILD_MESSAGE =
  'Public debate surfaces are paused while the L3 graph is rebuilt.'

export function debateRebuildPayload() {
  return {
    maintenance: true as const,
    message: DEBATE_REBUILD_MESSAGE,
    controversies: [] as unknown[],
    topics: [] as unknown[],
  }
}
