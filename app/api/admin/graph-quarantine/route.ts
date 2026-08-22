import { requireAdmin } from '@/lib/auth'
import { listGraphQuarantineDecisions } from '@/lib/neo4j/queries/graph-quarantine'
import { NextResponse } from 'next/server'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const items = await listGraphQuarantineDecisions(100)
    return NextResponse.json({ data: { items } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load quarantine queue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
