'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  function submitSearch(value: string) {
    const clean = value.trim()

    if (!clean) {
      router.push('/app/search')
      return
    }

    const params = new URLSearchParams()
    params.set('q', clean)

    router.push(`/app/search?${params.toString()}`)
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
      const finalQuery =
        numbers.length > 0 ? numbers.join('\n') : extractedText

      setQuery(finalQuery)
      setStatus('Opening search...')

      startTransition(() => {
        submitSearch(finalQuery)
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'OCR failed'
      setStatus(msg)
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="w-full max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: paste orders, email text, player, set, card #, breaker, team, notes..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
            >
              Search
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
            >
              Upload
            </button>
          </div>
        </div>

        <div className="text-[11px] text-zinc-500">
          Paste order numbers, copied email text, or upload a screenshot.
        </div>

        {status && (
          <div className="text-[11px] text-zinc-400">{status}</div>
        )}

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