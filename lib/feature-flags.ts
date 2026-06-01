/**
 * Branch-only experiment flags.
 *
 * `experimentHomeUi` swaps the home page and app shell for the topic-explorer
 * layout. It is OFF by default; only the preview branch env enables it
 * (see .env.local.branch.example). Merging to main keeps the current UI until
 * someone explicitly sets NEXT_PUBLIC_EXPERIMENT_HOME_UI=true.
 */
export const experimentHomeUi =
  process.env.NEXT_PUBLIC_EXPERIMENT_HOME_UI === 'true'
