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
import {
  buildThemeCssRule,
  getThemeBootScript,
  SIGNED_IN_ATTRIBUTE,
  THEME_STYLE_ELEMENT_IDS,
} from '@/lib/admin/global-layout-theme'
import { appFont } from '@/lib/fonts'
import { getServerThemeState } from '@/lib/server-theme'
import { getCurrentUser } from '@/lib/supabase/current-user'

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /*
    Marketing landing and auth share the `(marble)` layout. Signed-in explore
    home is `/home`. Session still drives product chrome and theme preference.
  */
  const user = await getCurrentUser()
  const signedIn = Boolean(user)
  const themeState = await getServerThemeState(user?.id)
  const themeScript = getThemeBootScript(themeState.preferenceMode, signedIn)

  return (
    <html lang="en" {...{ [SIGNED_IN_ATTRIBUTE]: String(signedIn) }} suppressHydrationWarning>
      <head>
        <style
          id={THEME_STYLE_ELEMENT_IDS.light}
          dangerouslySetInnerHTML={{
            __html: buildThemeCssRule('light', themeState.colors.light),
          }}
        />
        <style
          id={THEME_STYLE_ELEMENT_IDS.dark}
          dangerouslySetInnerHTML={{
            __html: buildThemeCssRule('dark', themeState.colors.dark),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: SCROLL_RESTORATION_BOOT_SCRIPT }} />
      </head>
      <body className={`${appFont.variable} ${appFont.className} font-sans`}>
        <ThemeProvider
          signedIn={signedIn}
          initialPreferenceMode={themeState.preferenceMode}
          initialColors={themeState.colors}
          initialSelections={themeState.selections}
        >
          <ScrollRestoration />
          <NavigationOverlayProvider>
            <LogoutTransitionWrapper signedIn={signedIn}>
              <AppShell signedIn={signedIn}>{children}</AppShell>
            </LogoutTransitionWrapper>
            <PageNavigationOverlay />
          </NavigationOverlayProvider>
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
