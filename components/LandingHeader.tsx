'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { SearchBar } from '@/components/SearchBar'
import { createClient } from '@/lib/supabase/client'
import { useLogoutTransition } from '@/components/LogoutTransitionWrapper'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { User } from '@supabase/supabase-js'

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const startLogout = useLogoutTransition()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  const displayName = user?.user_metadata?.full_name ?? 'Account'

  function handleSignOut() {
    if (startLogout) {
      startLogout.startLogout()
    } else {
      createClient().auth.signOut().then(() => {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('fromLogoutTransition', '1')
        }
        window.location.href = '/login'
      })
    }
  }

  return (
    <header className="pt-2">
      <Panel
        as="nav"
        variant="soft"
        interactive={false}
        className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
      >
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-accent-primary">
            DOXA
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-6 text-sm text-muted md:flex">
              <ThemeToggle />
              <Link
                href="/profile"
                className="flex items-center gap-2 transition-colors hover:text-accent-primary"
              >
                <span>{displayName}</span>
              </Link>
              <Link href="/about" className="transition-colors hover:text-accent-primary">
                About
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="transition-colors hover:text-accent-primary"
              >
                Log out
              </button>
            </div>

            <button
              type="button"
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-foreground shadow-panel-soft md:hidden"
              onClick={() => setOpen((prev) => !prev)}
            >
              <span className="sr-only">Toggle navigation</span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 shrink-0"
                style={{
                  transform: open ? 'scale(1.1)' : 'scale(1)',
                  transformOrigin: 'center',
                  transition: 'transform 200ms ease-out',
                }}
                aria-hidden
              >
                {/* Top bar: morphs down and rotates into X */}
                <line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="6"
                  style={{
                    transform: open ? 'translateY(6px) rotate(45deg)' : 'translateY(0) rotate(0)',
                    transformOrigin: '12px 6px',
                    transition: 'transform 200ms ease-out',
                  }}
                />
                {/* Middle bar: fades out */}
                <line
                  x1="6"
                  y1="12"
                  x2="18"
                  y2="12"
                  style={{
                    opacity: open ? 0 : 1,
                    transition: 'opacity 200ms ease-out',
                  }}
                />
                {/* Bottom bar: morphs up and rotates into X */}
                <line
                  x1="6"
                  y1="18"
                  x2="18"
                  y2="18"
                  style={{
                    transform: open ? 'translateY(-6px) rotate(-45deg)' : 'translateY(0) rotate(0)',
                    transformOrigin: '12px 18px',
                    transition: 'transform 200ms ease-out',
                  }}
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="border-t border-subtle pt-3">
          <SearchBar />
        </div>

        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-out md:hidden"
          style={{
            gridTemplateRows: open ? '1fr' : '0fr',
            opacity: open ? 1 : 0,
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-3 pb-0.5 text-sm text-muted">
              <ThemeToggle />
              <span className="text-muted-foreground/50 select-none" aria-hidden>·</span>
              <Link
                href="/profile"
                className="flex items-center gap-2 hover:text-accent-primary"
              >
                <span>{displayName}</span>
              </Link>
              <span className="text-muted-foreground/50 select-none" aria-hidden>·</span>
              <Link href="/about" className="hover:text-accent-primary">
                About
              </Link>
              <span className="text-muted-foreground/50 select-none" aria-hidden>·</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="hover:text-accent-primary"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </Panel>
    </header>
  )
}
