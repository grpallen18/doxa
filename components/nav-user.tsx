"use client"

import Link from "next/link"
import { Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { headerChromeIconButtonClassName, dropdownChromeBodyClassName, dropdownChromeContentClassName, dropdownChromeHeaderClassName, dropdownChromeSeparatorClassName } from "@/lib/header-chrome-styles"

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function UserDropdownContent({
  user,
  onSignOut,
  themeToggle,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onSignOut?: () => void
  themeToggle?: React.ReactNode
}) {
  return (
    <>
      <div className={dropdownChromeHeaderClassName}>
        <DropdownMenuLabel className="p-0 font-normal text-sidebar-foreground">
          <div className="grid text-left text-sm leading-tight">
            <span className="truncate font-semibold">{user.name}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{user.email}</span>
          </div>
        </DropdownMenuLabel>
      </div>
      <DropdownMenuSeparator className={dropdownChromeSeparatorClassName} />
      <div className={dropdownChromeBodyClassName}>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile">Account Settings</Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {themeToggle && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="flex cursor-default items-center gap-2"
            >
              <span className="flex-1 text-sm">Theme</span>
              <div className="ml-auto">{themeToggle}</div>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>Log out</DropdownMenuItem>
      </div>
    </>
  )
}

function NavUserHeader({
  user,
  onSignOut,
  themeToggle,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onSignOut?: () => void
  themeToggle?: React.ReactNode
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={headerChromeIconButtonClassName}
          aria-label="Account settings"
        >
          <Settings className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={4} className={dropdownChromeContentClassName}>
        <UserDropdownContent user={user} onSignOut={onSignOut} themeToggle={themeToggle} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavUserSidebar({
  user,
  onSignOut,
  themeToggle,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onSignOut?: () => void
  themeToggle?: React.ReactNode
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg bg-sidebar-accent text-sidebar-accent-foreground font-bold">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-sidebar-foreground/80">{user.email}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className={dropdownChromeContentClassName}
            side={isMobile ? "bottom" : "top"}
            align="end"
            sideOffset={4}
          >
            <UserDropdownContent user={user} onSignOut={onSignOut} themeToggle={themeToggle} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function NavUser({
  user,
  onSignOut,
  themeToggle,
  variant = "sidebar",
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onSignOut?: () => void
  themeToggle?: React.ReactNode
  variant?: "sidebar" | "header"
}) {
  if (variant === "header") {
    return <NavUserHeader user={user} onSignOut={onSignOut} themeToggle={themeToggle} />
  }

  return <NavUserSidebar user={user} onSignOut={onSignOut} themeToggle={themeToggle} />
}
