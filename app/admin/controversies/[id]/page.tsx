import { redirect } from 'next/navigation'

type Params = { params: Promise<{ id: string }> }

/** Legacy SQL controversy detail retired — prefer Neo detail when id is a graph uid. */
export default async function AdminControversyDetailRedirectPage({ params }: Params) {
  const { id } = await params
  if (id?.startsWith('ctr:')) {
    redirect(`/admin/graph-controversies/${encodeURIComponent(id)}`)
  }
  redirect('/admin/graph-controversies')
}
