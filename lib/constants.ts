/** How long the post-login loading symbol is shown (ms) before fade-out and redirect. Used by login page and auth transition page. */
export const LOADER_DURATION_MS = 2000

/** Minimum time (ms) interactive elements stay in "active" state so press/release animations run fully. Sync with --interactive-duration in globals.css. Used by Button and AnimatedPanelLink. */
export const INTERACTIVE_ANIMATION_MS = 200

/** Marketing landing for visitors without a session (`/` under the marble layout). */
export const LANDING_PATH = '/'

/** Signed-in explore home. Middleware sends authenticated visitors here from `/`. */
export const HOME_PATH = '/home'