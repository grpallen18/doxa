import { notFound } from 'next/navigation'
import { getPersonProfile } from '@/lib/explore/person'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { PersonIdentityRail } from '@/components/explore/person-identity-rail'
import { PersonProfileMain } from '@/components/explore/person-profile-main'
import { homePath } from '@/lib/explore-routes'

type PageProps = {
  params: Promise<{ uid: string }>
}

export default async function PersonProfilePage({ params }: PageProps) {
  const { uid: raw } = await params
  const uid = decodeURIComponent(raw)
  let profile: Awaited<ReturnType<typeof getPersonProfile>> = null
  try {
    profile = await getPersonProfile(uid)
  } catch {
    profile = null
  }
  if (!profile) notFound()

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <ExploreBreadcrumbs
          items={[
            { label: 'Debates', href: homePath() },
            { label: profile.name },
          ]}
        />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <PersonIdentityRail profile={profile} />
          <PersonProfileMain profile={profile} />
        </div>
      </div>
    </main>
  )
}
