'use client'

import Link from 'next/link'
import { useUserRole } from '@/hooks/use-user-role'

export function AppFooterLinks() {
  const role = useUserRole()

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span>© {new Date().getFullYear()} Doxa.</span>
      <Link href="/about" className="hover:text-foreground">
        About
      </Link>
      <Link href="/about#how-heading" className="hover:text-foreground">
        How it works
      </Link>
      <Link href="/topics" className="hover:text-foreground">
        Topics
      </Link>
      <a href="/atlas" className="hover:text-foreground">
        Atlas
      </a>
      {role === 'admin' && (
        <Link href="/admin/topics" className="hover:text-foreground">
          Admin
        </Link>
      )}
      <Link href="#signin" className="hover:text-foreground">
        Log in
      </Link>
    </div>
  )
}
