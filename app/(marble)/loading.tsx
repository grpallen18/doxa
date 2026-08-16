/**
 * Suspense fallback for every route in the group, including the nested auth
 * segments — one boundary is enough because `loading.tsx` wraps the whole
 * subtree below it.
 *
 * It renders nothing on purpose. The cards and CTAs here start invisible and
 * fade themselves in, so any placeholder would either flash a second surface
 * or land under the real one mid-fade. The scene, brand and the reserved
 * content slot live in the layout, which sits outside this boundary, so an
 * empty fallback still holds the exact geometry: a page that starts awaiting
 * data leaves the marble and logo untouched and the card fades in when ready.
 *
 * If a future marble page needs a visible placeholder, give that segment its
 * own `loading.tsx` and match the real card's height so the slot never resizes.
 */
export default function Loading() {
  return null
}
