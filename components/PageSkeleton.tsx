import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/Panel'
import { Separator } from '@/components/ui/separator'

const contentClass =
  'min-h-screen bg-background px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10'

export function PageSkeletonHome() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-content flex-col gap-10 md:gap-12">
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
      </div>
    </main>
  )
}

export function PageSkeletonAbout() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-content flex-col gap-10 md:gap-12">
        <section className="space-y-8">
          <Panel
            variant="soft"
            interactive={false}
            className="w-full space-y-6 border-l-4 border-l-accent-primary pl-5 pr-5 py-5 md:pl-6 md:pr-6 md:py-6"
          >
            <div className="space-y-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="space-y-2 border-t border-border pt-5">
              <Skeleton className="h-4 w-80" />
              <Skeleton className="h-3 w-36" />
            </div>
          </Panel>

          <div className="w-full space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>

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
      </div>
    </main>
  )
}

export function PageSkeletonSearch() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-content flex-col gap-10 md:gap-12">
        <section className="space-y-4">
          <Skeleton className="h-7 w-48" />
          <ul className="rounded-md border border-border bg-surface">
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
      </div>
    </main>
  )
}

export function PageSkeletonProfile() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-content flex-col gap-10 md:gap-12">
        <section className="space-y-6">
          <Skeleton className="h-8 w-48" />

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
            <div>
              <Skeleton className="mb-2 h-6 w-44" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>

            <Panel variant="base" className="p-5">
              <Skeleton className="mb-4 h-3 w-32" />
              <Skeleton className="h-6 w-48" />
            </Panel>

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
      </div>
    </main>
  )
}

export function PageSkeletonTopicDetail() {
  return (
    <main className={contentClass}>
      <div className="mx-auto flex w-full max-w-content flex-col gap-10 md:gap-12">
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
      </div>
    </main>
  )
}
