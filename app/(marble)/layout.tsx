import { MarbleBrandLogo } from '@/components/landing/marble-brand-logo'
import { MarbleScene } from '@/components/landing/marble-scene'
import {
  marbleColumnClassName,
  marbleContentSlotClassName,
} from '@/components/landing/marble-shell'

/**
 * Shared shell for every signed-out marble page (landing, log in, auth).
 * The scene and the brand mount once here, so navigating between those routes
 * only swaps what sits under the logo — the stone, statue and brand stay put
 * and their reveal runs a single time.
 *
 * The group's `loading.tsx` sits inside the reserved content slot below, so a
 * page that starts awaiting data leaves everything here on screen.
 */
export default function MarbleLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarbleScene>
      <div className={marbleColumnClassName}>
        <MarbleBrandLogo />
        {/*
          The scene centres this column, so without a reserved slot the brand
          would land at a different height on every route — the sign-up card is
          half a viewport taller than the landing buttons. Height comes from
          marble-shell so loading fallbacks stay aligned with the real cards.
        */}
        <div className={marbleContentSlotClassName}>{children}</div>
      </div>
    </MarbleScene>
  )
}
