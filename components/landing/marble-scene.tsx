import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Marble hero backdrop for the signed-out world. Mounted once by the
 * `(marble)` layout so landing and auth only swap the content column.
 */
export function MarbleScene({
  children,
  className,
  rootClassName,
  as: Root = 'main',
}: {
  children: React.ReactNode
  /** Applied to the left content column (not the scene root). */
  className?: string
  /** Applied to the scene root — use for full-bleed overlays like 404. */
  rootClassName?: string
  as?: 'main' | 'div'
}) {
  return (
    <Root
      className={cn(
        'marble-scene relative isolate flex min-h-svh flex-col overflow-clip',
        rootClassName
      )}
    >
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

      {/*
        Not the app's centred max-w-content column: this one owns the marble to
        the left of the figure and centres its content in it, so the brand keeps
        the same relationship to the statue from a laptop to an ultrawide.
        Below lg the figure is a faint full-width wash, so the scene is simply
        full width there and the column centres on the viewport as before.
      */}
      <div
        className={cn(
          'relative flex w-full flex-1 flex-col justify-center px-6 lg:w-[calc(100%_-_1.25rem_-_var(--statue-art-width))]',
          className
        )}
      >
        {children}
      </div>
    </Root>
  )
}
