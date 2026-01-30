import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { LandingHeader } from '@/components/LandingHeader'

const TRENDING_STORIES = [
  { title: 'Are undocumented immigrants eligible for welfare programs?', href: '/page/10000000-0000-0000-0000-000000000001' },
  { title: 'What does CBP mean by an "encounter"?', href: '/page/10000000-0000-0000-0000-000000000002' },
  { title: 'What happened during the Minneapolis ICE protest?', href: '/page/10000000-0000-0000-0000-000000000003' },
  { title: 'How does the U.S. asylum process work?', href: '/page/10000000-0000-0000-0000-000000000004' },
  { title: 'What is the difference between a refugee and an asylee?', href: '/page/10000000-0000-0000-0000-000000000005' },
]

export default function Home() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        {/* Two-grid: Live poll (left) + Trending (right) */}
        <section aria-labelledby="discovery-heading" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <Panel variant="soft" className="flex flex-col gap-4 p-5">
            <h2 id="discovery-heading" className="text-lg font-semibold tracking-tight text-foreground">
              This week&apos;s question
            </h2>
            <p className="text-sm text-muted">
              How much do you trust major news outlets to separate facts from opinion on immigration?
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Choose one</legend>
              {['A lot', 'Some', 'A little', 'Not at all'].map((opt) => (
                <label key={opt} className="flex cursor-not-allowed items-center gap-2 text-sm text-muted">
                  <input type="radio" name="poll-1" value={opt} disabled className="opacity-60" />
                  {opt}
                </label>
              ))}
            </fieldset>
            <Button href="#signup" variant="secondary" className="mt-2 w-full">
              Sign in to participate
            </Button>
          </Panel>

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Trending stories</h2>
              <p className="text-xs text-muted">Topics with high traffic or covered by multiple outlets</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {TRENDING_STORIES.map((story) => (
                <Link key={story.href} href={story.href}>
                  <Panel variant="soft" className="panel-bevel-interactive h-full p-4">
                    <p className="text-sm font-medium text-foreground">{story.title}</p>
                  </Panel>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <Panel
          as="section"
          id="signup"
          aria-labelledby="cta-heading"
          variant="base"
          className="panel-bevel-interactive space-y-6"
        >
          <div className="space-y-2">
            <h2 id="cta-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Create a free profile to get started
            </h2>
            <p className="text-sm text-muted">
              Sign-up is required to access the site. It&apos;s completely free—no paid features for now.
            </p>
          </div>
          <Button href="#signup" variant="primary">
            Sign up
          </Button>
        </Panel>

        {/* Footer */}
        <footer
          id="signin"
          className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-4">
            <span>© {new Date().getFullYear()} Doxa.</span>
            <Link href="/about" className="hover:text-foreground">
              About
            </Link>
            <Link href="/about#how-heading" className="hover:text-foreground">
              How it works
            </Link>
            <a href="/graph" className="hover:text-foreground">
              Topics
            </a>
            <Link href="#signin" className="hover:text-foreground">
              Log in
            </Link>
          </div>
          <div className="flex gap-4">
            <Link href="#" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="#" className="hover:text-foreground">
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}
