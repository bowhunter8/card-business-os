'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function extractOrderNumbers(input: string): string[] {
  if (!input) return []
  return Array.from(new Set(input.match(/\d{6,}/g) || []))
}

export default function AppGlobalSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setQuery('')
    setStatus('')
  }, [pathname])

  function submitSearch(value: string) {
    const clean = value.trim()

    if (!clean) {
      setQuery('')
      setStatus('')
      startTransition(() => {
        router.push('/app/search')
      })
      return
    }

    const params = new URLSearchParams()
    params.set('q', clean)

    setStatus('Searching...')

    startTransition(() => {
      router.push(`/app/search?${params.toString()}`)
      setQuery('')
      setStatus('')
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submitSearch(query)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('Reading screenshot...')

    try {
      const imageDataUrl = await fileToDataUrl(file)

      setStatus('Running OCR...')

      const res = await fetch('/api/search-ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageDataUrl }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'OCR failed')
      }

      const extractedText = String(data.text || '').trim()

      if (!extractedText) {
        setStatus('No text found.')
        return
      }

      const numbers = extractOrderNumbers(extractedText)
      const finalQuery = numbers.length > 0 ? numbers.join('\n') : extractedText

      submitSearch(finalQuery)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR failed'
      setStatus(msg)
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="w-full max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (status === 'Searching...') setStatus('')
            }}
            placeholder="Search orders, breaks, players, sets, order IDs... or paste multiple orders"
            className="app-input"
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={isPending}
            className="app-button-primary whitespace-nowrap disabled:opacity-60"
          >
            {isPending ? 'Searching...' : 'Search'}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="app-button whitespace-nowrap"
          >
            Upload
          </button>
        </div>

        <div className="text-[11px] text-zinc-500">
          Paste order numbers, copied email text, player, set, breaker, team, notes, or upload a screenshot.
        </div>

        {status ? <div className="text-[11px] text-zinc-400">{status}</div> : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleImageUpload}
          className="hidden"
        />
      </form>
    </div>
  )
}