import { redirect } from 'next/navigation'

/** Legacy SQL positions UI retired — Neo Debate projections. */
export default function AdminPositionsRedirectPage() {
  redirect('/admin/graph-controversies')
}
