import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { LogoutTransitionWrapper } from '@/components/LogoutTransitionWrapper'
import { NavigationOverlayProvider, PageNavigationOverlay } from '@/components/NavigationOverlayContext'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { cinzel } from '@/lib/fonts'

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

const themeScript = `
(function() {
  try {
    if (typeof window !== 'undefined' && window.location.pathname === '/login') {
      document.documentElement.classList.remove('dark');
      return;
    }
    var stored = localStorage.getItem('doxa-theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (stored !== 'light' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={cinzel.variable}>
        <ThemeProvider>
          <NavigationOverlayProvider>
            <LogoutTransitionWrapper>
            <AppShell>{children}</AppShell>
          </LogoutTransitionWrapper>
            <PageNavigationOverlay />
          </NavigationOverlayProvider>
          <Toaster position="bottom-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
