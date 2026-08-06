'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  dropdownChromeBodyClassName,
  dropdownChromeContentClassName,
  dropdownChromeHeaderClassName,
  dropdownChromeSeparatorClassName,
  headerChromeIconButtonClassName,
} from '@/lib/header-chrome-styles'
import { useUserRole } from '@/hooks/use-user-role'
import { defaultTopicId } from '@/lib/mock/topic-explore'
import { topicPath } from '@/lib/topic-routes'
import { cn } from '@/lib/utils'

type NavLink = {
  label: string
  href: string
  /** Match active state with pathname.startsWith when true */
  matchPrefix?: boolean
}

const exploreLinks: NavLink[] = [
  { label: 'Explore Topics', href: topicPath(defaultTopicId), matchPrefix: true },
  { label: 'Search', href: '/search' },
  { label: 'About', href: '/about' },
  { label: 'Profile', href: '/profile' },
]

const adminLinks: NavLink[] = [
  { label: 'Admin Center', href: '/admin' },
  { label: 'Stories', href: '/admin/stories', matchPrefix: true },
  { label: 'Health', href: '/admin/health', matchPrefix: true },
  { label: 'Debate', href: '/admin/graph-controversies', matchPrefix: true },
  { label: 'Topics', href: '/admin/topics', matchPrefix: true },
  { label: 'Pipeline Roadmap', href: '/admin/pipeline-roadmap' },
]

function isActive(pathname: string, link: NavLink): boolean {
  if (link.href === '/admin') {
    return pathname === '/admin'
  }
  // Highlight Explore for any topic detail route (not a list index).
  if (link.href.startsWith('/topics/')) {
    return pathname.startsWith('/topics/')
  }
  if (link.matchPrefix) {
    return pathname === link.href || pathname.startsWith(`${link.href}/`)
  }
  return pathname === link.href
}

function NavSection({
  label,
  links,
  pathname,
}: {
  label: string
  links: NavLink[]
  pathname: string
}) {
  return (
    <>
      <div className={dropdownChromeHeaderClassName}>
        <DropdownMenuLabel className="p-0 text-xs font-semibold text-muted">
          {label}
        </DropdownMenuLabel>
      </div>
      <div className={dropdownChromeBodyClassName}>
        <DropdownMenuGroup>
          {links.map((link) => (
            <DropdownMenuItem key={link.href} asChild>
              <Link
                href={link.href}
                className={cn(isActive(pathname, link) && 'bg-accent font-medium')}
              >
                {link.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </div>
    </>
  )
}

export function HeaderPagesMenu() {
  const pathname = usePathname()
  const role = useUserRole()
  const showAdmin = role === 'admin'

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={headerChromeIconButtonClassName}
          aria-label="Navigate pages"
        >
          <Menu className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={4}
        className={cn(dropdownChromeContentClassName, 'min-w-[12rem]')}
      >
        <NavSection label="Explore" links={exploreLinks} pathname={pathname} />
        {showAdmin ? (
          <>
            <DropdownMenuSeparator className={dropdownChromeSeparatorClassName} />
            <NavSection label="Admin" links={adminLinks} pathname={pathname} />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
