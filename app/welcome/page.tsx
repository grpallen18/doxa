import type { Metadata } from 'next'
import Image from 'next/image'
import { GlassButton } from '@/components/landing/glass-button'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

export const metadata: Metadata = {
  title: 'Doxa — Navigate disagreement without radicalization',
  description:
    'A structured map of debates from the news: facts at the core, viewpoints side by side, evidence you can open. Sign in or create a free account to explore.',
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  const redirectTo = sanitizeRedirectPath(params.redirect)
  const query =
    redirectTo === '/' ? '' : `?redirect=${encodeURIComponent(redirectTo)}`
  const loginHref = `/login${query}`
  const signUpHref = `/auth/sign-up${query}`

  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-clip">
      <Image
        src="/landing-marble-background.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        quality={90}
        aria-hidden
        className="-z-10 object-cover"
      />
      {/* Lifts the logo off the busiest veining without washing out the stone. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0.12)_45%,rgba(90,84,76,0.18)_100%)]"
      />

      {/*
        Decorative: a faint backdrop on narrow screens, the right-hand figure from lg up.
        Anchored to the viewport rather than the content column — the column caps at
        max-w-content, so on wide screens its gutter would strand the figure hundreds
        of pixels inside the edge. Sized past the bottom so it renders larger; the
        faded tail is trimmed by main's overflow-clip instead of adding page scroll.

        statue-fade dissolves the lower portion into the marble and statue-btt
        materializes the figure in from the hem upward on load. They sit on
        separate elements and use the un-faded artwork deliberately — see the
        comment on statue-fade in globals.css.
      */}
      <div
        aria-hidden
        className="statue-fade pointer-events-none absolute bottom-0 right-0 -z-10 h-[58%] w-[86%] opacity-[0.22] sm:w-[66%] lg:-bottom-8 lg:right-5 lg:top-10 lg:h-auto lg:w-[58%] lg:opacity-100"
      >
        <div className="statue-btt animate-statue-btt absolute inset-0">
          <Image
            src="/landing-plato-statue-solid.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 58vw, 86vw"
            className="object-contain object-right-bottom"
          />
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-content flex-1 flex-col justify-center px-6 py-16">
        <div className="flex flex-col items-center text-center lg:max-w-[48%] lg:items-start lg:text-left">
          <Image
            src="/logo-color-no-bg.png"
            alt="DOXA"
            width={2172}
            height={724}
            priority
            className="doxa-logo-ltr animate-doxa-logo-ltr w-[min(86vw,34rem)] max-h-[32svh] object-contain drop-shadow-[0_3px_12px_rgba(36,31,26,0.18)] lg:object-left"
          />

          <div className="mt-10 flex w-full max-w-xs flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
            <GlassButton href={signUpHref}>Sign up</GlassButton>
            <GlassButton href={loginHref} variant="secondary">
              Log in
            </GlassButton>
          </div>
        </div>
      </div>
    </main>
  )
}
