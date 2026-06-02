'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  FileText,
  BookOpen,
  LayoutDashboard,
  Map,
  Shield,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const adminItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/topics', label: 'Topics', icon: FileText },
  { href: '/admin/stories', label: 'Stories', icon: BookOpen },
  { href: '/admin/health', label: 'Health', icon: Activity },
  { href: '/atlas', label: 'Atlas', icon: Map },
]

export function HeaderAdminMenu() {
  const pathname = usePathname()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Admin menu"
        >
          <Shield className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>Admin</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {adminItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === '/atlas' && pathname.startsWith('/atlas'))

          return (
            <DropdownMenuItem key={item.href} asChild className={isActive ? 'bg-accent' : undefined}>
              <Link href={item.href}>
                <item.icon className="size-4" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
