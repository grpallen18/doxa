import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { LandingHeader } from '@/components/LandingHeader'
import { HomeFadeWrapper } from '@/components/HomeFadeWrapper'
import { createClient } from '@/lib/supabase/server'

type RecentStory = { story_id: string; title: string; url: string; created_at: string; source_name: string | null }

async function getRecentStories(limit: number): Promise<RecentStory[]> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('stories')
    .select('story_id, title, url, created_at, sources(name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (rows ?? []).map((row: { story_id: string; title: string; url: string; created_at: string; sources: { name: string } | null }) => ({
    story_id: row.story_id,
    title: row.title,
    url: row.url,
    created_at: row.created_at,
    source_name: row.sources?.name ?? null,
  }))
}

export default async function Home() {
  const recentStories = await getRecentStories(6)
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
              <p className="text-xs text-muted">6 most recently added stories</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {recentStories.length > 0 ? (
                recentStories.map((story) => (
                  <a
                    key={story.story_id}
                    href={story.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="panel-bevel-soft block h-full rounded-bevel p-4 transition hover:shadow-panel-hover"
                  >
                    <p className="text-sm font-medium text-foreground">{story.title}</p>
                    {story.source_name && (
                      <p className="mt-1 text-xs text-muted">{story.source_name}</p>
                    )}
                  </a>
                ))
              ) : (
                <p className="col-span-2 text-sm text-muted">No stories yet.</p>
              )}
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
