'use client'

import { useEffect, useState } from 'react'

import { Icons } from './icons'

export function ThemeToggle() {
  const [dark, setDark] = useState(true)

  // The inline script in <head> already set the class; read it back so the
  // button starts in the right state without causing a hydration mismatch.
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      // Private mode with storage disabled — the toggle still works for this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:border-border-strong hover:text-text"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Icons.sun className="h-4 w-4" /> : <Icons.moon className="h-4 w-4" />}
    </button>
  )
}
