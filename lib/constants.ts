/** How long the post-login loading symbol is shown (ms) before fade-out and redirect. Used by login page and auth transition page. */
export const LOADER_DURATION_MS = 2000

/** Minimum time (ms) interactive elements stay in "active" state so press/release animations run fully. Sync with --interactive-duration in globals.css. Used by Button and AnimatedPanelLink. */
export const INTERACTIVE_ANIMATION_MS = 200

/** Marketing landing page every visitor without a session is sent to. */
export const LANDING_PATH = '/welcome'
