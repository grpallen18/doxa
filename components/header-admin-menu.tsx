'use client'

import Link from 'next/link'
import { Glasses } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { headerChromeIconButtonClassName } from '@/lib/header-chrome-styles'

export function HeaderAdminMenu() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={headerChromeIconButtonClassName}
      aria-label="Admin Center"
      asChild
    >
      <Link href="/admin">
        <Glasses className="size-4" />
      </Link>
    </Button>
  )
}
