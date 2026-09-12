'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function NavigationLoader() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopLoading() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setLoading(false)
  }

  function startLoading() {
    setLoading(true)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      setLoading(false)
      timeoutRef.current = null
    }, 12000)
  }

  useEffect(() => {
    stopLoading()
  }, [pathname])

  useEffect(() => {
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    function handleUrlChange() {
      stopLoading()
    }

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args)
      handleUrlChange()
    }

    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args)
      handleUrlChange()
    }

    window.addEventListener('popstate', handleUrlChange)

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return

      const submitButton = target.closest(
        'button[type="submit"], input[type="submit"]'
      ) as HTMLButtonElement | HTMLInputElement | null

      if (submitButton) {
        const form = submitButton.closest('form')

        if (!form) return
        if (form.target === '_blank') return
        if (!form.checkValidity()) return

        startLoading()
        return
      }

      const link = target.closest('a')

      if (!link) return
      if (link.target === '_blank') return
      if (link.hasAttribute('download')) return

      const href = link.getAttribute('href')
      if (!href) return
      if (href.startsWith('#')) return
      if (href.startsWith('mailto:')) return
      if (href.startsWith('tel:')) return

      const currentUrl = new URL(window.location.href)
      const nextUrl = new URL(href, window.location.href)

      if (nextUrl.origin !== currentUrl.origin) return

      const sameLocation =
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search

      if (sameLocation) return

      startLoading()
    }

    window.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('popstate', handleUrlChange)

      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  if (!loading) return null

  return (
    <div className="fixed left-0 top-0 z-9999 h-1 w-full overflow-hidden bg-cyan-950">
      <div className="h-full w-1/3 animate-[hitsLoadingBar_1s_ease-in-out_infinite] bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)]" />
    </div>
  )
}
