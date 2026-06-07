import { redirect } from 'next/navigation'

export default async function StoryExtractionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/stories/${id}#step-chunk-story-bodies`)
}
