import { requireAdmin } from '@/lib/auth'
import { getHeldByForProposition } from '@/lib/neo4j/queries/held-by'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ uid: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { uid } = await params
  try {
    const intervals = await getHeldByForProposition(uid)
    return NextResponse.json({ data: { intervals } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load HELD_BY'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
