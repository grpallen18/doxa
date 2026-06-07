import { redirect } from 'next/navigation'

export default async function StoryIngestionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/stories/${id}#step-relevance-gate`)
}
