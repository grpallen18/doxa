import { Panel } from '@/components/Panel'
import { ProfileSettingsCard } from '@/components/auth/profile-settings-card'

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-content flex-col gap-10 md:gap-12">
        <section aria-labelledby="profile-heading" className="space-y-6">
          <h1 id="profile-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
            Profile &amp; account
          </h1>

          <ProfileSettingsCard />

          <Panel variant="soft" interactive={false} className="space-y-2 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Perspective (coming later)
            </p>
            <p className="text-sm leading-relaxed text-muted">
              Personalization will emerge from reading and structured feedback — not from an
              upfront ideology quiz. Saved debates and critiques already feed that loop.
            </p>
          </Panel>
        </section>
      </div>
    </main>
  )
}
