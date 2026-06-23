'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function NavigationLoader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(false)
  }, [pathname, searchParams])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      const link = target?.closest('a')

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
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) return

      setLoading(true)
    }

    window.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('click', handleClick)
    }
  }, [])

  if (!loading) return null

  return (
    <div className="fixed left-0 top-0 z-[9999] h-1 w-full overflow-hidden bg-cyan-950">
      <div className="h-full w-1/3 animate-[hitsLoadingBar_1s_ease-in-out_infinite] bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)]" />
    </div>
  )
}