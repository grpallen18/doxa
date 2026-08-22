import Image from 'next/image'
import { GlassButton } from '@/components/landing/glass-button'
import { MarbleScene } from '@/components/landing/marble-scene'
import { LANDING_PATH } from '@/lib/constants'

/**
 * Full-bleed marble 404. Fixed over AppShell chrome so a missing admin/explore
 * URL still gets the same immersive scene as the signed-out world.
 *
 * The brand mark is a large faded watermark behind the copy. It lives only in
 * the left content column (with overflow clipped), so it can wash through the
 * 404 type without crossing onto the statue on the right.
 *
 * Opacity sits on the wrapper — not the img — because `animate-doxa-logo-ltr`
 * keys opacity to 1 and would wipe a class on the image itself.
 */
export function NotFoundView({
  title = '404',
  message = 'Not all those who wander are lost...but you are.',
  homeHref = LANDING_PATH,
  homeLabel = 'Return to home page.',
}: {
  title?: string
  message?: string
  homeHref?: string
  homeLabel?: string
}) {
  return (
    <MarbleScene
      as="div"
      rootClassName="fixed inset-0 z-[100] min-h-svh"
      className="overflow-hidden py-8 sm:py-10"
    >
      <div className="relative flex w-full flex-1 animate-scene-fade-in flex-col items-center justify-center overflow-hidden pl-4 text-center sm:pl-8 lg:items-start lg:pl-12 lg:text-left">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 w-[min(150vw,72rem)] -translate-x-1/2 opacity-[0.3] lg:left-0 lg:w-[min(95%,68rem)] lg:translate-x-0"
        >
          <Image
            src="/logo-color-no-bg.png"
            alt=""
            width={2172}
            height={724}
            priority
            className="h-auto w-full object-contain object-top lg:object-left-top"
          />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[34rem] flex-col items-center gap-5 lg:mx-0 lg:items-start">
          <h1 className="text-[clamp(4.5rem,14vw,8.5rem)] font-semibold leading-none tracking-[-0.06em] text-foreground">
            {title}
          </h1>
          <GlassButton href={homeHref} variant="secondary">
            {homeLabel}
          </GlassButton>
        </div>
        <p className="relative z-10 mt-16 w-full text-center text-base italic leading-relaxed text-foreground/80 sm:mt-20 sm:text-lg">
          &ldquo;{message}&rdquo;
        </p>
      </div>
    </MarbleScene>
  )
}
