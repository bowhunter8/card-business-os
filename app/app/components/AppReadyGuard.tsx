'use client'

import { useEffect, useState } from 'react'

export default function AppReadyGuard() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.appReady = 'true'
    setReady(true)
  }, [])

  if (ready) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-auto fixed inset-0 z-[9999] cursor-wait bg-transparent"
    />
  )
}
