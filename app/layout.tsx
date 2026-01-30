import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Doxa - Community-Calibrated Political Knowledge Graph',
  description: 'A meta-news platform that structures political narratives from multiple perspectives',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
