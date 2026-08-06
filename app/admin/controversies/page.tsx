import { redirect } from 'next/navigation'

/** Legacy SQL controversies UI retired — Neo Debate projections. */
export default function AdminControversiesRedirectPage() {
  redirect('/admin/graph-controversies')
}
