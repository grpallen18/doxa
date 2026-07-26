export const ADMIN_STATUS_PLACEHOLDER = {
  storiesPendingQa: 12,
  scrapeFailures24h: 3,
  storiesInPipeline: 47,
  agreementClusters: 128,
  canonicalClaimsLinked: 892,
  awaitingScrape: 8,
  mergeQaBlocked: 4,
  scrapeSuccessRate: '94%',
  awaitingCleaning: 6,
  awaitingMerge: 11,
  chunksExtracted24h: 214,
  mergesCompleted24h: 38,
  controversiesActive: 19,
  viewpointsActive: 54,
  eventsLinked: 311,
  stuckProcessing: 2,
} as const

export type AdminStatusPlaceholder = typeof ADMIN_STATUS_PLACEHOLDER
