import { redirect } from 'next/navigation'
import { peoplePath } from '@/lib/explore-routes'

type PageProps = {
  params: Promise<{ entityUid: string }>
}

/** Legacy entity URL — people profiles live at /people/{uid}. */
export default async function LegacyEntityRedirect({ params }: PageProps) {
  const { entityUid } = await params
  redirect(peoplePath(decodeURIComponent(entityUid)))
}
