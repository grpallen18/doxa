import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { LandingHeader } from '@/components/LandingHeader'
import { InstrumentModule } from '@/components/InstrumentModule'
import { ProfileSettingsCard } from '@/components/auth/profile-settings-card'

const IDEOLOGY_FACTORS = [
  { id: 'economic', label: 'Economic', value: '42%' },
  { id: 'social', label: 'Social', value: '58%' },
  { id: 'foreign', label: 'Foreign policy', value: '35%' },
  { id: 'civil', label: 'Civil liberties', value: '71%' },
  { id: 'fiscal', label: 'Fiscal', value: '48%' },
  { id: 'cultural', label: 'Cultural', value: '55%' },
]

export default function ProfilePage() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        <section aria-labelledby="profile-heading" className="space-y-6">
          <h1 id="profile-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
            Profile &amp; account
          </h1>

          <ProfileSettingsCard />

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Your perspective (read-only)
              </h2>
              <p className="text-sm text-muted">
                Doxa-calculated ratings based on your activity. These are placeholders; the ideology engine is not yet implemented.
              </p>
            </div>

            <Panel variant="base" className="p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Assigned ideology
              </p>
              <p className="text-lg font-medium text-foreground">
                Center-left (placeholder)
              </p>
            </Panel>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Factor breakdown (3×2)
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {IDEOLOGY_FACTORS.map((factor) => (
                  <InstrumentModule
                    key={factor.id}
                    title={factor.label}
                    value={factor.value}
                    indicator={false}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <a href="/" className="hover:text-foreground">
              ← Home
            </a>
            <Link href="/graph" className="hover:text-foreground">
              Topics
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}
