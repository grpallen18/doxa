import { redirect } from 'next/navigation'

export default async function StoryCanonicalRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/stories/${id}#post-merge-actions`)
}
