'use client'

import { useState } from 'react'
import Link from 'next/link'
import Tesseract from 'tesseract.js'

type ScanResponse = {
  success?: boolean
  error?: string
  extracted?: {
    detectedFormat: 'desktop_order' | 'mobile_order' | 'delivery_email' | 'unknown'
    orderId: string | null
    trackingNumber: string | null
    seller: string | null
    orderDate: string | null
    total: number | null
    titles: string[]
    normalizedText: string
  }
  matchedBreak?: {
    id: string
    break_date: string | null
    source_name: string | null
    product_name: string | null
    order_number: string | null
    notes: string | null
    total_cost: number | null
    score?: number
    reasons?: string[]
  } | null
  matchedOrder?: {
    id: string
    break_id: string | null
    order_id: string | null
    order_numeric_id: string | null
    seller: string | null
    product_name: string | null
    processed_date: string | null
    processed_date_display: string | null
    total: number | null
    score?: number
    reasons?: string[]
  } | null
  matchedBy?: string[]
  confidence?: 'exact' | 'high' | 'medium' | 'low' | 'none'
  candidates?: {
    breaks: Array<{
      id: string
      break_date: string | null
      source_name: string | null
      product_name: string | null
      order_number: string | null
      total_cost: number | null
      score?: number
      reasons?: string[]
    }>
    whatnotOrders: Array<{
      id: string
      break_id: string | null
      order_id: string | null
      order_numeric_id: string | null
      seller: string | null
      product_name: string | null
      processed_date: string | null
      processed_date_display: string | null
      total: number | null
      score?: number
      reasons?: string[]
    }>
  }
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function confidenceBadge(confidence: ScanResponse['confidence']) {
  if (confidence === 'exact') {
    return 'rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300'
  }
  if (confidence === 'high') {
    return 'rounded-full border border-blue-800 bg-blue-950/40 px-3 py-1 text-xs text-blue-300'
  }
  if (confidence === 'medium') {
    return 'rounded-full border border-yellow-800 bg-yellow-950/40 px-3 py-1 text-xs text-yellow-300'
  }
  if (confidence === 'low') {
    return 'rounded-full border border-orange-800 bg-orange-950/40 px-3 py-1 text-xs text-orange-300'
  }
  return 'rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300'
}

function buildWhatnotOrderHref(order: NonNullable<ScanResponse['matchedOrder']>) {
  const exact = order.order_numeric_id || order.order_id || order.id

  const params = new URLSearchParams()
  params.set('focus', exact)
  params.set('matched', '1')

  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)
  params.set('row_id', order.id)

  return `/app/whatnot-orders?${params.toString()}`
}

function buildCandidateWhatnotOrderHref(item: NonNullable<ScanResponse['candidates']>['whatnotOrders'][number]) {
  const exact = item.order_numeric_id || item.order_id || item.id

  const params = new URLSearchParams()
  params.set('focus', exact)
  params.set('matched', '1')

  if (item.order_numeric_id) params.set('order_numeric_id', item.order_numeric_id)
  if (item.order_id) params.set('order_id', item.order_id)
  params.set('row_id', item.id)

  return `/app/whatnot-orders?${params.toString()}`
}

export default function WhatnotScanPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [ocrStep, setOcrStep] = useState<string>('Idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResponse | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file) {
      setError('Please choose an image first.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setOcrStep('Reading image in browser...')

    try {
      const {
        data: { text },
      } = await Tesseract.recognize(file, 'eng', {
        logger(message) {
          if (message.status === 'recognizing text') {
            const percent = Math.round((message.progress ?? 0) * 100)
            setOcrStep(`OCR in browser... ${percent}%`)
          } else if (message.status) {
            setOcrStep(String(message.status))
          }
        },
      })

      setOcrStep('Matching against imported orders and breaks...')

      const response = await fetch('/api/utilities/whatnot-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      })

      const json = (await response.json()) as ScanResponse

      if (!response.ok) {
        throw new Error(json.error || 'Scan failed.')
      }

      setResult(json)
      setOcrStep('Done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.')
      setOcrStep('Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Scan Whatnot Screenshot / Email</h1>
          <p className="mt-2 text-zinc-400">
            Upload a Whatnot desktop screenshot, mobile screenshot, or delivery email screenshot and try to match it to your imported orders or breaks.
          </p>
        </div>

        <Link
          href="/app/utilities"
          className="inline-flex rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          Back to Utilities
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Image file</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
              }}
              className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
            Best results usually come from:
            <div className="mt-2 space-y-1">
              <div>• full screenshot, not cropped too tight</div>
              <div>• order number visible</div>
              <div>• tracking number visible</div>
              <div>• item title visible when possible</div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-300">
              {ocrStep}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Scanning...' : 'Scan Image'}
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {result?.extracted ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">Scan Result</h2>
                <span className={confidenceBadge(result.confidence)}>
                  {result.confidence ? result.confidence.toUpperCase() : 'NONE'}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-xs text-zinc-400">Detected Format</div>
                  <div className="mt-1 font-medium">{result.extracted.detectedFormat}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-xs text-zinc-400">Order ID</div>
                  <div className="mt-1 font-medium">{result.extracted.orderId || '—'}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-xs text-zinc-400">Tracking Number</div>
                  <div className="mt-1 font-medium break-all">
                    {result.extracted.trackingNumber || '—'}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-xs text-zinc-400">Seller</div>
                  <div className="mt-1 font-medium">{result.extracted.seller || '—'}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-xs text-zinc-400">Order Date</div>
                  <div className="mt-1 font-medium">{result.extracted.orderDate || '—'}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-xs text-zinc-400">Total</div>
                  <div className="mt-1 font-medium">
                    {result.extracted.total != null ? money(result.extracted.total) : '—'}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-sm font-medium">Extracted title clues</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.extracted.titles.length > 0 ? (
                    result.extracted.titles.map((title) => (
                      <span
                        key={title}
                        className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
                      >
                        {title}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-zinc-500">No title clues found.</span>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-sm font-medium">Matched by</div>
                <div className="mt-2 text-sm text-zinc-400">
                  {result.matchedBy && result.matchedBy.length > 0
                    ? result.matchedBy.join(' • ')
                    : 'No strong match yet.'}
                </div>
              </div>
            </div>

            {result.matchedOrder ? (
              <div className="rounded-2xl border border-blue-900 bg-blue-950/20 p-6">
                <div className="text-sm text-blue-300">Matched Imported Whatnot Order</div>
                <div className="mt-2 text-2xl font-semibold">
                  {result.matchedOrder.product_name || 'Untitled order'}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-zinc-400">Order ID</div>
                    <div className="mt-1">
                      {result.matchedOrder.order_id || result.matchedOrder.order_numeric_id || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Seller</div>
                    <div className="mt-1">{result.matchedOrder.seller || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Processed Date</div>
                    <div className="mt-1">
                      {result.matchedOrder.processed_date_display ||
                        result.matchedOrder.processed_date ||
                        '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Total</div>
                    <div className="mt-1">{money(result.matchedOrder.total)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Break Link Status</div>
                    <div className="mt-1">
                      {result.matchedOrder.break_id ? 'Linked to break' : 'Imported / staging only'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {result.matchedOrder.break_id ? (
                    <Link
                      href={`/app/breaks/${result.matchedOrder.break_id}`}
                      className="inline-flex rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
                    >
                      Open Linked Break
                    </Link>
                  ) : null}

                  <Link
                    href={buildWhatnotOrderHref(result.matchedOrder)}
                    className="inline-flex rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
                  >
                    Open Exact Whatnot Order
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-yellow-900 bg-yellow-950/20 p-6">
                <div className="text-sm text-yellow-300">No imported Whatnot order matched yet</div>
                <div className="mt-2 text-zinc-200">
                  The screenshot OCR completed, but the app did not find a matching imported order in your Whatnot order history yet.
                </div>
              </div>
            )}

            {result.matchedBreak ? (
              <div className="rounded-2xl border border-emerald-900 bg-emerald-950/20 p-6">
                <div className="text-sm text-emerald-300">Linked Break Match</div>
                <div className="mt-2 text-2xl font-semibold">
                  {result.matchedBreak.product_name || 'Untitled break'}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-zinc-400">Breaker</div>
                    <div className="mt-1">{result.matchedBreak.source_name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Break Date</div>
                    <div className="mt-1">{result.matchedBreak.break_date || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Order #</div>
                    <div className="mt-1">{result.matchedBreak.order_number || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Total Cost</div>
                    <div className="mt-1">{money(result.matchedBreak.total_cost)}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <Link
                    href={`/app/breaks/${result.matchedBreak.id}`}
                    className="inline-flex rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
                  >
                    Open Break
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                <div className="text-sm text-zinc-400">No linked break found</div>
                <div className="mt-2 text-zinc-300">
                  That is okay if the order is still sitting in staging and has not been grouped into a break yet.
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-xl font-semibold">Possible Break Matches</h2>

              <div className="mt-4 space-y-3">
                {result.candidates?.breaks?.length ? (
                  result.candidates.breaks.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{item.product_name || 'Untitled break'}</div>
                        <div className="text-xs text-zinc-400">Score {item.score ?? 0}</div>
                      </div>
                      <div className="mt-2 text-sm text-zinc-400">
                        {item.source_name || '—'} • {item.break_date || '—'} • Order{' '}
                        {item.order_number || '—'}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {item.reasons && item.reasons.length > 0
                          ? item.reasons.join(' • ')
                          : 'No scoring notes available'}
                      </div>
                      <div className="mt-3">
                        <Link
                          href={`/app/breaks/${item.id}`}
                          className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                        >
                          Open Break
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
                    No break candidates yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-xl font-semibold">Possible Whatnot Order Matches</h2>

              <div className="mt-4 space-y-3">
                {result.candidates?.whatnotOrders?.length ? (
                  result.candidates.whatnotOrders.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{item.product_name || 'Untitled order'}</div>
                        <div className="text-xs text-zinc-400">Score {item.score ?? 0}</div>
                      </div>
                      <div className="mt-2 text-sm text-zinc-400">
                        {item.seller || '—'} •{' '}
                        {item.processed_date_display || item.processed_date || '—'} • Order{' '}
                        {item.order_id || item.order_numeric_id || '—'}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {item.reasons && item.reasons.length > 0
                          ? item.reasons.join(' • ')
                          : 'No scoring notes available'}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.break_id ? (
                          <Link
                            href={`/app/breaks/${item.break_id}`}
                            className="inline-flex rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-zinc-200"
                          >
                            Open Linked Break
                          </Link>
                        ) : null}

                        <Link
                          href={buildCandidateWhatnotOrderHref(item)}
                          className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                        >
                          Open Exact Whatnot Order
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
                    No whatnot order candidates yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-xl font-semibold">OCR Text</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Useful for debugging if a screenshot does not match correctly.
              </p>

              <pre className="mt-4 max-h-[500px] overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
                {result.extracted.normalizedText}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}