import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { LogoutTransitionWrapper } from '@/components/LogoutTransitionWrapper'
import { NavigationOverlayProvider, PageNavigationOverlay } from '@/components/NavigationOverlayContext'
import {
  SCROLL_RESTORATION_BOOT_SCRIPT,
  ScrollRestoration,
} from '@/components/scroll-restoration'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { getThemeBootScript } from '@/lib/admin/global-layout-theme'
import { appFont } from '@/lib/fonts'

export const metadata: Metadata = {
  title: 'Doxa - Community-Calibrated Political Knowledge Graph',
  description: 'A meta-news platform that structures political narratives from multiple perspectives',
  icons: {
    icon: [
      { url: '/favicon-light.png' },
      { url: '/favicon-light.png', media: '(prefers-color-scheme: light)' },
      { url: '/favicon-dark.png', media: '(prefers-color-scheme: dark)' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

const themeScript = getThemeBootScript()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: SCROLL_RESTORATION_BOOT_SCRIPT }} />
      </head>
      <body className={`${appFont.variable} font-sans`}>
        <ThemeProvider>
          <ScrollRestoration />
          <NavigationOverlayProvider>
            <LogoutTransitionWrapper>
            <AppShell>{children}</AppShell>
          </LogoutTransitionWrapper>
            <PageNavigationOverlay />
          </NavigationOverlayProvider>
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
