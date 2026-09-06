'use client'

import Link from 'next/link'
import {
  useEffect,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type Props = Omit<ComponentProps<typeof Link>, 'children'> & {
  children: ReactNode
}

export default function ChecklistLoadingLink({
  children,
  onClick,
  ...props
}: Props) {
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    setLoading(false)
  }, [pathname, searchParams])

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    setLoading(true)
  }

  return (
    <>
      <Link {...props} onClick={handleClick}>
        {children}
      </Link>

      {loading && (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm font-semibold text-zinc-100 shadow-2xl">
            Loading...
          </div>
        </div>
      )}
    </>
  )
}
