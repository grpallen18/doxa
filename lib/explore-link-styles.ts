/** Canonical class for accent links (dashed underline → solid on hover). See globals.css `.doxa-link`. */
export const doxaLinkClassName = 'doxa-link'

/** @deprecated Use `doxaLinkClassName` */
export const exploreLinkClassName = doxaLinkClassName

export type ExploreLinkListLayout = 'stack' | 'auto-grid'

/** Fills available width with as many columns as fit (min ~22rem each). */
export const exploreLinkGridClassName =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-x-4 gap-y-2'

export const exploreLinkGridItemClassName = 'min-w-0'
