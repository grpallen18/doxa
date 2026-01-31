import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { AnimatedPanelLink } from '@/components/AnimatedPanelLink'
import { LandingHeader } from '@/components/LandingHeader'
import { HomeFadeWrapper } from '@/components/HomeFadeWrapper'

const TRENDING_STORIES = [
  { title: 'Minneapolis ICE protests', href: '/page/10000000-0000-0000-0000-000000000001' },
  { title: 'Election integrity and voting laws', href: '/page/10000000-0000-0000-0000-000000000002' },
  { title: 'Redistricting and gerrymandering', href: '/page/10000000-0000-0000-0000-000000000003' },
  { title: 'Tariff policy', href: '/page/10000000-0000-0000-0000-000000000004' },
  { title: 'Twitter Files', href: '/page/10000000-0000-0000-0000-000000000005' },
]

export default function Home() {
  return (
    <HomeFadeWrapper>
      <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        {/* Two-grid: Live poll (left) + Trending (right) */}
        <section aria-labelledby="discovery-heading" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <Panel variant="soft" interactive={false} className="flex flex-col gap-4 p-5">
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
            <Button href="/login" variant="primary" className="mt-2 w-full">
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
                <AnimatedPanelLink key={story.href} href={story.href} className="h-full p-4">
                  <p className="text-sm font-medium text-foreground">{story.title}</p>
                </AnimatedPanelLink>
              ))}
            </div>
          </div>
        </section>

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
    </HomeFadeWrapper>
  )
}
