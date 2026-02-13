import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { LandingHeader } from '@/components/LandingHeader'

export default function AboutPage() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-muted sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        <section aria-labelledby="about-heading" className="space-y-8">
          <Panel variant="soft" interactive={false} className="w-full space-y-6 border-l-4 border-l-accent-primary pl-5 pr-5 py-5 md:pl-6 md:pr-6 md:py-6">
            <div className="space-y-1">
              <p id="about-heading" className="text-base font-bold uppercase tracking-[0.12em] text-muted">
                DOXA
              </p>
              <p className="text-sm text-muted">
                Ancient Greek | <span className="font-medium italic">dóxa</span> (δόξα): A belief, opinion, or reputation.
              </p>
            </div>
            <blockquote className="space-y-2 border-t border-subtle pt-5">
              <p className="text-sm italic leading-relaxed text-muted">
                &quot;Opinion is the intermediate between knowledge and ignorance.&quot;
              </p>
              <cite className="not-italic text-xs text-muted">
                Plato — Republic (Book V)
              </cite>
            </blockquote>
          </Panel>

          <div className="w-full space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              Most of what we believe as &quot;truth&quot; isn&apos;t ignorance or wisdom — it lives somewhere in between. This middle ground is where opinions form, shaped by experience, culture, media, and persuasion. Doxa exists to bring those opinions into the open. We examine topics from multiple viewpoints and place them side by side so you can understand not just what people believe, but why they believe it. The goal isn&apos;t to declare winners, but to clarify where beliefs come from, where they overlap, and where they diverge — with the aim of reducing polarization through exposure, rather than reinforcing silos.
            </p>
            <p className="text-sm leading-relaxed text-muted">
              To do this, we draw from a wide range of sources, summarize competing viewpoints, and present them within each topic. Just as importantly, we rely on user feedback to refine our work after publication. If your perspective isn&apos;t represented accurately, you can downvote and explain why. We analyze feedback patterns over time and clarify viewpoints accordingly, so each topic moves closer to capturing the full picture.
            </p>
          </div>

          <div className="space-y-6">
            <h2 id="how-heading" className="text-lg font-semibold tracking-tight text-muted sm:text-xl">
              How it works
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              <Panel variant="base" className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">1. Search or browse</p>
                <p className="text-sm text-muted">
                  Find a story or topic you want to understand. Use the search bar or explore the topic map.
                </p>
              </Panel>
              <Panel variant="base" className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">2. See how it&apos;s framed</p>
                <p className="text-sm text-muted">
                  Get a clear view of the facts, how different perspectives frame them, and where they agree or disagree.
                </p>
              </Panel>
              <Panel variant="base" className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">3. Contribute</p>
                <p className="text-sm text-muted">
                  Sign up (free) to explore, participate in polls, and provide feedback that improves the model.
                </p>
              </Panel>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="hover:opacity-80">
              Home
            </Link>
            <a href="/atlas" className="hover:opacity-80">
              Topics
            </a>
          </div>
        </footer>
      </div>
    </main>
  )
}
