'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'

const TOP_OFFSET = 208

export default function BreakQuickActionsFloat({
  children,
  stopAtId = 'break-items',
}: {
  children: ReactNode
  stopAtId?: string
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [floating, setFloating] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    const update = () => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      const stopNode = document.getElementById(stopAtId)

      if (!anchor || !panel || !stopNode) return

      const anchorRect = anchor.getBoundingClientRect()
      const stopRect = stopNode.getBoundingClientRect()
      const panelHeight = panel.offsetHeight

      const shouldFloat =
        anchorRect.top < TOP_OFFSET &&
        stopRect.bottom > TOP_OFFSET + panelHeight + 8

      if (!shouldFloat) {
        setFloating(false)
        setStyle({})
        return
      }

      setFloating(true)
      setStyle({
        position: 'fixed',
        top: `${TOP_OFFSET}px`,
        left: `${anchorRect.left}px`,
        width: `${anchorRect.width}px`,
        zIndex: 50,
      })
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    const observer = new ResizeObserver(update)
    if (anchorRef.current) observer.observe(anchorRef.current)
    if (panelRef.current) observer.observe(panelRef.current)

    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [stopAtId])

  return (
    <div ref={anchorRef}>
      {floating ? <div style={{ height: panelRef.current?.offsetHeight ?? 0 }} /> : null}
      <div ref={panelRef} style={style}>
        {children}
      </div>
    </div>
  )
}
