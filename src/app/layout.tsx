import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PC Builder — pick parts that actually fit',
  description:
    'Build a PC with live compatibility checking, a real power budget, and current prices scraped from Newegg and Amazon.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0c10' },
  ],
}

/**
 * Applied before first paint, in a blocking head script, so the page never
 * flashes the wrong theme.
 *
 * Dark is the default. Deliberately not derived from `prefers-color-scheme`:
 * Chromium reports `light` both for "the user prefers light" and for "no
 * preference expressed", so an OS-driven default silently sends most visitors
 * to light. An explicit choice from the toggle is stored and always wins.
 */
const THEME_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    document.documentElement.classList.toggle('dark', stored !== 'light');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  )
}
