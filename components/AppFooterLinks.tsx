'use client'

import Link from 'next/link'

export function AppFooterLinks() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span>© {new Date().getFullYear()} Doxa.</span>
      <Link href="#" className="hover:opacity-80">
        Terms
      </Link>
      <Link href="#" className="hover:opacity-80">
        Privacy
      </Link>
    </div>
  )
}
