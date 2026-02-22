'use client'

import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { SearchBar } from '@/components/SearchBar'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
const exploreItems: { title: string; href: string; description: string }[] = [
  {
    title: 'Browse topics',
    href: '/topics',
    description: 'Read topic summaries and linked theses.',
  },
  {
    title: 'Search',
    href: '/search',
    description: 'Search for a headline or topic to research.',
  },
  {
    title: 'Living Atlas',
    href: '/atlas',
    description: 'Explore theses and claims in an interactive map.',
  },
]

function NavListItem({
  title,
  children,
  href,
  ...props
}: React.ComponentPropsWithoutRef<'li'> & { href: string }) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link href={href}>
          <div className="flex flex-col gap-1 text-sm">
            <div className="leading-none font-medium">{title}</div>
            <div className="text-muted-foreground line-clamp-2">{children}</div>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  )
}

interface LandingHeaderProps {
  variant?: 'default' | 'atlas'
  /** When true, the DOXA title animates letter-by-letter. Only used on the home page. */
  animateTitle?: boolean
}

export function LandingHeader({ variant = 'default', animateTitle = false }: LandingHeaderProps) {
  // Atlas page: centered nav menu, no search bar
  if (variant === 'atlas') {
    return (
      <header className="flex flex-col gap-4 pt-2">
        <NavigationMenu className="max-w-none justify-center">
          <NavigationMenuList className="flex flex-col gap-2 md:flex-row md:gap-1">
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/" className={navigationMenuTriggerStyle()}>
                  DOXA
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger className={navigationMenuTriggerStyle()}>
                Explore
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[320px] gap-2 p-4 md:w-[400px] md:grid-cols-1">
                  {exploreItems.map((item) => (
                    <NavListItem
                      key={item.title}
                      title={item.title}
                      href={item.href}
                    >
                      {item.description}
                    </NavListItem>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </header>
    )
  }

  // Main page and others: DOXA title at top, search panel below
  return (
    <header className="pt-2">
      <div className="mb-6 text-center">
        <Link
          href="/"
          className="text-6xl font-semibold uppercase tracking-[0.18em] text-muted font-['Times_New_Roman',serif] transition-colors hover:text-accent-primary sm:text-7xl"
        >
          {animateTitle ? (
            <>
              {'DOXA'.split('').map((letter, i) => (
                <span
                  key={i}
                  className="inline-block animate-doxa-letter opacity-0"
                  style={{ animationDelay: `${i * 360}ms` }}
                >
                  {letter}
                </span>
              ))}
            </>
          ) : (
            'DOXA'
          )}
        </Link>
      </div>
      <Panel
        as="nav"
        variant="soft"
        interactive={false}
        className="flex flex-col gap-4 px-4 py-3 md:px-6 md:py-4"
      >
        <SearchBar />
      </Panel>
    </header>
  )
}
