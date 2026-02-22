import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/Panel'
import { Separator } from '@/components/ui/separator'

const contentClass = 'min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10'

export function PageSkeletonHome() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        {/* Nav panel (LandingHeader) */}
        <header className="pt-2">
          <Panel
            as="nav"
            variant="soft"
            interactive={false}
            className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
          >
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-16" />
              <div className="hidden items-center gap-6 md:flex">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </Panel>
        </header>

        {/* Three columns: This week's question | middle | Trending stories */}
        <section className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)]">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="shrink-0">
              <Skeleton className="h-7 w-44" />
            </div>
            <Panel
              variant="soft"
              interactive={false}
              className="flex min-h-0 flex-1 flex-col gap-4 p-5"
            >
              <Skeleton className="h-4 w-full" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-4 w-24" />
                ))}
              </div>
              <Skeleton className="mt-auto h-10 w-full" />
            </Panel>
          </div>

          <div aria-hidden />

          <div className="space-y-4">
            <div>
              <Skeleton className="h-7 w-36" />
            </div>
            <Panel
              variant="soft"
              interactive={false}
              className="h-96 w-full overflow-hidden rounded-bevel p-3"
            >
              <div className="flex flex-col gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-4 w-4 shrink-0" />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        <footer
          id="signin"
          className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
          </div>
        </footer>
      </div>
    </main>
  )
}

export function PageSkeletonTopics() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        {/* Nav panel (LandingHeader) */}
        <header className="pt-2">
          <Panel
            as="nav"
            variant="soft"
            interactive={false}
            className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
          >
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-16" />
              <div className="hidden items-center gap-6 md:flex">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </Panel>
        </header>

        <section className="space-y-4">
          {/* h1 Browse topics */}
          <Skeleton className="h-8 w-40" />
          {/* p Click a topic... */}
          <Skeleton className="h-5 w-80" />
          <ul className="rounded-md border border-subtle bg-surface">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i}>
                {i > 0 && <Separator />}
                <div className="px-4 py-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="mt-1 h-4 w-full" />
                  <Skeleton className="mt-0.5 h-4 w-4/5" />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-center gap-1">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 w-16" />
          </div>
        </footer>
      </div>
    </main>
  )
}

export function PageSkeletonAbout() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        {/* Nav panel (LandingHeader) */}
        <header className="pt-2">
          <Panel
            as="nav"
            variant="soft"
            interactive={false}
            className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
          >
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-16" />
              <div className="hidden items-center gap-6 md:flex">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </Panel>
        </header>

        <section className="space-y-8">
          {/* DOXA definition panel */}
          <Panel
            variant="soft"
            interactive={false}
            className="w-full space-y-6 border-l-4 border-l-accent-primary pl-5 pr-5 py-5 md:pl-6 md:pr-6 md:py-6"
          >
            <div className="space-y-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="space-y-2 border-t border-subtle pt-5">
              <Skeleton className="h-4 w-80" />
              <Skeleton className="h-3 w-36" />
            </div>
          </Panel>

          {/* Intro paragraphs */}
          <div className="w-full space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>

          {/* How it works */}
          <div className="space-y-6">
            <Skeleton className="h-7 w-36" />
            <div className="grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Panel key={i} variant="base" interactive={false} className="flex flex-col gap-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-12 w-full" />
                </Panel>
              ))}
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
          </div>
        </footer>
      </div>
    </main>
  )
}

export function PageSkeletonSearch() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        {/* Nav panel (LandingHeader) */}
        <header className="pt-2">
          <Panel
            as="nav"
            variant="soft"
            interactive={false}
            className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
          >
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-16" />
              <div className="hidden items-center gap-6 md:flex">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </Panel>
        </header>

        <section className="space-y-4">
          {/* h2 Results for "..." */}
          <Skeleton className="h-7 w-48" />
          <ul className="rounded-md border border-subtle bg-surface">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i}>
                {i > 0 && <Separator />}
                <div className="px-4 py-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="mt-1 h-4 w-full" />
                  <Skeleton className="mt-0.5 h-4 w-4/5" />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-center gap-1">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 w-16" />
          </div>
        </footer>
      </div>
    </main>
  )
}

export function PageSkeletonProfile() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        {/* Nav panel (LandingHeader) */}
        <header className="pt-2">
          <Panel
            as="nav"
            variant="soft"
            interactive={false}
            className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
          >
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-16" />
              <div className="hidden items-center gap-6 md:flex">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </Panel>
        </header>

        <section className="space-y-6">
          {/* h1 Profile & account */}
          <Skeleton className="h-8 w-48" />

          {/* ProfileSettingsCard */}
          <Panel variant="soft" interactive={false} className="space-y-4 p-5">
            <Skeleton className="h-6 w-36" />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-48" />
                  <Skeleton className="h-9 w-16" />
                </div>
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          </Panel>

          <div className="space-y-4">
            {/* Your perspective */}
            <div>
              <Skeleton className="mb-2 h-6 w-44" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>

            {/* Assigned ideology panel */}
            <Panel variant="base" className="p-5">
              <Skeleton className="mb-4 h-3 w-32" />
              <Skeleton className="h-6 w-48" />
            </Panel>

            {/* Factor breakdown */}
            <div>
              <Skeleton className="mb-3 h-3 w-40" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-[7.5rem] w-full rounded-bevel" />
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
          </div>
        </footer>
      </div>
    </main>
  )
}

export function PageSkeletonTopicDetail() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <Skeleton className="h-12 w-64" />
        <section className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </section>
        <footer className="flex gap-4 border-t border-subtle pt-6">
          <Skeleton className="h-4 w-16" />
        </footer>
      </div>
    </main>
  )
}

export function PageSkeletonAtlas() {
  return (
    <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Atlas header: centered nav (DOXA, Explore, About, Account) */}
        <header className="flex flex-col gap-4 pt-2">
          <nav className="flex flex-1 items-center justify-center">
            <ul className="flex flex-col gap-2 md:flex-row md:gap-1">
              {[1, 2, 3, 4].map((i) => (
                <li key={i}>
                  <Skeleton className="h-9 w-[70px]" />
                </li>
              ))}
            </ul>
          </nav>
        </header>

        {/* Living Atlas panel */}
        <Panel
          variant="soft"
          interactive={false}
          className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"
        >
          <Skeleton className="h-7 w-28 shrink-0" />
          <Skeleton className="h-10 w-full max-w-md flex-1" />
        </Panel>

        {/* Map panel */}
        <Panel variant="soft" interactive={false} className="overflow-hidden p-0">
          <Skeleton className="min-h-[400px] w-full" />
        </Panel>
      </div>
    </main>
  )
}

export function PageSkeletonAdminTopics() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <Skeleton className="h-12 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </main>
  )
}
