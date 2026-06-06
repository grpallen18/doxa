'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { usePathname } from 'next/navigation'
import { Glasses } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  dropdownChromeBodyClassName,
  dropdownChromeContentClassName,
  dropdownChromeHeaderClassName,
  dropdownChromeSeparatorClassName,
  headerChromeIconButtonClassName,
} from '@/lib/header-chrome-styles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const adminItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/topics', label: 'Topics' },
  { href: '/admin/stories', label: 'Stories' },
  { href: '/admin/health', label: 'Health' },
  { href: '/atlas', label: 'Atlas' },
]

export function HeaderAdminMenu() {
  const pathname = usePathname()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={headerChromeIconButtonClassName}
          aria-label="Admin menu"
        >
          <Glasses className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={dropdownChromeContentClassName}>
        <div className={dropdownChromeHeaderClassName}>
          <DropdownMenuLabel className="px-0 py-0 text-sidebar-foreground">Admin</DropdownMenuLabel>
        </div>
        <DropdownMenuSeparator className={dropdownChromeSeparatorClassName} />
        <div className={dropdownChromeBodyClassName}>
          {adminItems.map((item, index) => {
            const isActive =
              pathname === item.href ||
              (item.href === '/atlas' && pathname.startsWith('/atlas'))

            return (
              <Fragment key={item.href}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem asChild className={isActive ? 'bg-accent' : undefined}>
                  <Link href={item.href}>{item.label}</Link>
                </DropdownMenuItem>
              </Fragment>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
