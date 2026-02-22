import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { LandingHeader } from '@/components/LandingHeader'
import { HomeFadeWrapper } from '@/components/HomeFadeWrapper'
import { TrendingStoriesList } from '@/components/TrendingStoriesList'
import { AppFooterLinks } from '@/components/AppFooterLinks'
import { createClient } from '@/lib/supabase/server'

type RecentStory = { story_id: string; title: string; url: string; created_at: string; source_name: string | null }

async function getRecentStories(limit: number): Promise<RecentStory[]> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('stories')
    .select('story_id, title, url, created_at, sources(name)')
    .eq('relevance_status', 'KEEP')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (rows ?? []).map((row: { story_id: string; title: string; url: string; created_at: string; sources: { name: string } | { name: string }[] | null }) => {
    const src = row.sources
    const name = Array.isArray(src) ? src[0]?.name : src?.name
    return {
      story_id: row.story_id,
      title: row.title,
      url: row.url,
      created_at: row.created_at,
      source_name: name ?? null,
    }
  })
}

export default async function Home() {
  const recentStories = await getRecentStories(20)
  return (
    <HomeFadeWrapper>
      <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        {/* Three columns: This week's question (30%) | middle (40%) | Trending (30%) */}
        <section aria-labelledby="discovery-heading" className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)]">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="shrink-0">
              <h2 id="discovery-heading" className="text-lg font-semibold tracking-tight text-foreground">
                This week&apos;s question
              </h2>
            </div>
            <Panel variant="soft" interactive={false} className="flex min-h-0 flex-1 flex-col gap-4 p-5">
            <p className="text-sm text-muted">
              How often do you fact-check a story before sharing it?
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
            <Button href="/login" variant="primary" className="mt-auto w-full">
              Sign in to participate
            </Button>
          </Panel>
          </div>

          <div aria-hidden="true" />

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Trending stories</h2>
            </div>
            <TrendingStoriesList stories={recentStories} />
          </div>
        </section>

        {/* Footer */}
        <footer
          id="signin"
          className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between"
        >
          <AppFooterLinks />
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
