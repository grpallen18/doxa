import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const supabase = createAdminClient()

  const { count: pending } = await supabase
    .from('l3_review_queue')
    .select('*', { count: 'exact', head: true })
    .eq('state', 'pending')
  const { count: leased } = await supabase
    .from('l3_review_queue')
    .select('*', { count: 'exact', head: true })
    .eq('state', 'leased')
  const { count: submitted } = await supabase
    .from('l3_proposals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'submitted')
  const { count: applied } = await supabase
    .from('l3_proposals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'applied')
  const { count: rejected } = await supabase
    .from('l3_proposals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'rejected')
  const { count: goldNeg } = await supabase
    .from('l3_gold_negatives')
    .select('*', { count: 'exact', head: true })
  const { data: questions } = await supabase
    .from('graph_questions')
    .select('uid, member_count, speaker_count, status')
    .limit(500)

  const q = questions ?? []
  const q1 = q.filter((r) => (r.member_count ?? 0) === 1).length
  const q2 = q.filter((r) => (r.member_count ?? 0) >= 2).length
  const attached = q.reduce((s, r) => s + (r.member_count ?? 0), 0)
  const fragmentation = attached > 0 ? q.length / attached : 0
  const speakerDensity =
    q.length > 0 ? q.reduce((s, r) => s + (r.speaker_count ?? 0), 0) / q.length : 0

  const opposingShare = q.length > 0 ? q2 / q.length : 0
  const rejectRate =
    (applied ?? 0) + (rejected ?? 0) > 0
      ? (rejected ?? 0) / ((applied ?? 0) + (rejected ?? 0))
      : 0

  return NextResponse.json({
    data: {
      queue: { pending: pending ?? 0, leased: leased ?? 0 },
      proposals: {
        submitted: submitted ?? 0,
        applied: applied ?? 0,
        rejected: rejected ?? 0,
      },
      gold_negatives: goldNeg ?? 0,
      foreign_member_rate: rejectRate,
      opposing_side_share: opposingShare,
      density: {
        questions: q.length,
        q1,
        q2plus: q2,
        attached,
        fragmentation_index: fragmentation,
        mean_speaker_density: speakerDensity,
      },
    },
  })
}
