import type { Metadata } from 'next'
import { LandingHero } from '@/components/landing/landing-hero'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

/** Crawlers are always signed out, so the landing copy is the public face of `/`. */
export const metadata: Metadata = {
  title: 'Doxa — Navigate disagreement without radicalization',
  description:
    'A structured map of debates from the news: facts at the core, viewpoints side by side, evidence you can open. Sign in or create a free account to explore.',
}

/**
 * Marketing landing only. Signed-in visitors are redirected to `/home` by
 * middleware; the marble backdrop lives in the parent `(marble)` layout.
 */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  return <LandingHero redirectTo={sanitizeRedirectPath(params.redirect)} />
}
