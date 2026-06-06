export const ADMIN_STATUS_PLACEHOLDER = {
  storiesPendingQa: 12,
  scrapeFailures24h: 3,
  storiesInPipeline: 47,
  agreementClusters: 128,
  canonicalClaimsLinked: 892,
} as const

export type AdminStatusPlaceholder = typeof ADMIN_STATUS_PLACEHOLDER
