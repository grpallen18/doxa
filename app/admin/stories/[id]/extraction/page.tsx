import { redirect } from 'next/navigation'

/** Claims extraction UI is deprecated — Neo discourse graph is primary. */
export default async function StoryExtractionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/neo/${id}`)
}
