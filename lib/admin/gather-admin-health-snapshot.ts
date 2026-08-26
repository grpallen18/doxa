import type { SupabaseClient } from '@supabase/supabase-js'
import { gatherPostgresPipelineCounts } from '@/lib/admin/observability-pipeline-counts'
import { getNeoPipelineCounts } from '@/lib/neo4j/queries/pipeline-counts'
import {
  buildSnapshotHealthSections,
  type AdminHealthSnapshotPayload,
} from '@/lib/admin/gather-health-metrics'
import { withTtlCache } from '@/lib/admin/ttl-cache'

const POSTGRES_SNAPSHOT_TTL_MS = 15_000
const NEO_SNAPSHOT_TTL_MS = 60_000

/** Cached live snapshot for admin KPI polling. */
export async function gatherCachedAdminHealthSnapshot(
  supabase: SupabaseClient
): Promise<AdminHealthSnapshotPayload> {
  const [postgres, neo] = await Promise.all([
    withTtlCache('admin-metrics-postgres-snapshot', POSTGRES_SNAPSHOT_TTL_MS, () =>
      gatherPostgresPipelineCounts(supabase)
    ),
    withTtlCache('admin-metrics-neo-snapshot', NEO_SNAPSHOT_TTL_MS, () =>
      getNeoPipelineCounts()
    ),
  ])

  return {
    polledAt: new Date().toISOString(),
    sections: buildSnapshotHealthSections({ ...postgres, neo }),
  }
}
