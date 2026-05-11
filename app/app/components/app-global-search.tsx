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

function normalizeSearchInput(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function getImageFileFromClipboard(event: React.ClipboardEvent<HTMLInputElement>) {
  const items = Array.from(event.clipboardData?.items ?? [])

  for (const item of items) {
    if (!item.type.startsWith('image/')) continue

    const file = item.getAsFile()
    if (file) return file
  }

  return null
}

export default function AppGlobalSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lastSubmittedRef = useRef('')
  const isOcrRunningRef = useRef(false)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isBusy = isPending || isOcrRunning

  useEffect(() => {
    setQuery('')
    setStatus('')
    lastSubmittedRef.current = ''
  }, [pathname])

  function submitSearch(value: string) {
    const clean = normalizeSearchInput(value)

    if (!clean) {
      setQuery('')
      setStatus('')
      lastSubmittedRef.current = ''

      startTransition(() => {
        router.push('/app/search')
      })

      return
    }

    if (lastSubmittedRef.current === clean) {
      return
    }

    lastSubmittedRef.current = clean

    const params = new URLSearchParams()
    params.set('q', clean)

    setStatus('Searching...')
    setQuery('')

    startTransition(() => {
      router.push(`/app/search?${params.toString()}`)
    })
  }

  async function processImageFile(file: File) {
    if (isOcrRunningRef.current) return

    isOcrRunningRef.current = true
    setIsOcrRunning(true)
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
      isOcrRunningRef.current = false
      setIsOcrRunning(false)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (isBusy) return

    submitSearch(query)
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (isBusy) return

    const imageFile = getImageFileFromClipboard(e)

    if (!imageFile) return

    e.preventDefault()
    setQuery('')
    lastSubmittedRef.current = ''

    void processImageFile(imageFile)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]

    if (!file) return

    await processImageFile(file)
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
              if (lastSubmittedRef.current) lastSubmittedRef.current = ''
            }}
            onPaste={handlePaste}
            placeholder="Search orders, breaks, players, sets, order IDs... or paste multiple orders"
            className="app-input"
            autoComplete="off"
            disabled={isBusy}
          />

          <button
            type="submit"
            disabled={isBusy}
            className="app-button-primary whitespace-nowrap disabled:opacity-60"
          >
            {isPending ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="text-[11px] text-zinc-500">
          Paste order numbers, copied email text, player, set, breaker, team, notes, etc...
        </div>

        {status ? <div className="text-[11px] text-zinc-400">{status}</div> : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleImageUpload}
          className="hidden"
          disabled={isBusy}
        />
      </form>
    </div>
  )
}
