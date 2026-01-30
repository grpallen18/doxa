'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { SearchBar } from '@/components/SearchBar'

export function LandingHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="pt-2">
      <Panel
        as="nav"
        variant="soft"
        className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
      >
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-accent-primary">
            DOXA
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-6 text-sm text-muted md:flex">
              <Link href="/profile" className="transition-colors hover:text-accent-primary">
                Account
              </Link>
              <Link href="/about" className="transition-colors hover:text-accent-primary">
                About
              </Link>
              <a href="#" className="transition-colors hover:text-accent-primary">
                Log out
              </a>
            </div>

            <button
              type="button"
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-foreground shadow-panel-soft md:hidden"
              onClick={() => setOpen((prev) => !prev)}
            >
              <span className="sr-only">Toggle navigation</span>
              <div className="flex flex-col items-center justify-center gap-1">
                <span className={`h-0.5 w-4 rounded-full bg-foreground transition-transform ${open ? 'translate-y-1 rotate-45' : ''}`} />
                <span className={`h-0.5 w-4 rounded-full bg-foreground transition-opacity ${open ? 'opacity-0' : 'opacity-100'}`} />
                <span className={`h-0.5 w-4 rounded-full bg-foreground transition-transform ${open ? '-translate-y-1 -rotate-45' : ''}`} />
              </div>
            </button>
          </div>
        </div>

        <div className="border-t border-subtle pt-3">
          <SearchBar />
        </div>

        {open && (
          <div className="flex flex-col gap-3 border-t border-subtle pt-3 text-sm text-muted md:hidden">
            <Link href="/profile" className="hover:text-accent-primary">
              Account
            </Link>
            <Link href="/about" className="hover:text-accent-primary">
              About
            </Link>
            <a href="#" className="hover:text-accent-primary">
              Log out
            </a>
          </div>
        )}
      </Panel>
    </header>
  )
}
