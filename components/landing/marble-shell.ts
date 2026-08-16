/**
 * Shared geometry for the signed-out marble column, so the layout, the auth
 * cards and any future loading fallback can never drift apart. Everything the
 * brand's position depends on is pinned here.
 */

/**
 * Tallest card in the flow (sign-up). The layout reserves this height under the
 * brand, which is what keeps the logo at one position on every marble route.
 * Changing it means changing the `100svh - 42rem` term in
 * `marbleLogoSizeClassName` by the same amount.
 */
export const MARBLE_CONTENT_MIN_HEIGHT_CLASS = 'min-h-[35rem]'

export const marbleColumnClassName =
  'flex w-full flex-col items-center py-10 text-center lg:max-w-[48%] lg:items-start lg:text-left'

export const marbleContentSlotClassName = `mt-8 flex ${MARBLE_CONTENT_MIN_HEIGHT_CLASS} w-full flex-col items-center lg:items-start`

/** Frosted card chrome. Shared so a placeholder card would match the real one. */
export const marbleAuthPanelClassName = 'glass-panel w-full max-w-lg p-6 text-left sm:p-7'
