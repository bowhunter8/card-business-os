'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function WhatnotImportPage() {
  const [fileName, setFileName] = useState('')
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastImportedCount, setLastImportedCount] = useState<number | null>(null)
  const [lastDuplicateCount, setLastDuplicateCount] = useState<number | null>(null)

  async function onFileChange(file: File | null) {
    setError('')
    setSuccess('')
    setLastImportedCount(null)
    setLastDuplicateCount(null)

    if (!file) {
      setFileName('')
      setCsvText('')
      return
    }

    setFileName(file.name)
    const text = await file.text()
    setCsvText(text)
  }

  async function runImport() {
    if (!csvText) {
      setError('Upload a Whatnot CSV file first.')
      return
    }

    try {
      setImporting(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/imports/whatnot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'import',
          csvText,
          fileName,
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Import failed')
      }

      setLastImportedCount(Number(json.imported ?? 0))
      setLastDuplicateCount(Number(json.skippedDuplicates ?? 0))
      setSuccess(
        `Imported ${json.imported} Whatnot order stub(s). Skipped ${json.skippedDuplicates} duplicate(s).`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Whatnot Import</h1>
          <p className="mt-2 text-zinc-400">
            Import buyer order history from Whatnot into separate order stubs. Each order stays preserved so you can group them into breaks later.
          </p>
        </div>

        <Link
          href="/app/utilities"
          className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          Back to Utilities
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <div>
            <div className="text-lg font-semibold">Import File</div>
            <p className="mt-1 text-sm text-zinc-400">
              Select your Whatnot CSV export and import it directly. No preview step needed.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"
            />
            {fileName ? (
              <p className="mt-2 text-xs text-zinc-400">Loaded: {fileName}</p>
            ) : null}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={runImport}
              disabled={importing || !csvText}
              className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import Orders'}
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
            <div className="font-medium text-zinc-200">What gets stored</div>
            <div className="mt-2 space-y-1">
              <p>Order ID</p>
              <p>Numeric order ID</p>
              <p>Seller</p>
              <p>Product</p>
              <p>Subtotal</p>
              <p>Shipping</p>
              <p>Taxes</p>
              <p>Total</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div>
            <div className="text-lg font-semibold">Import Flow</div>
            <p className="mt-1 text-sm text-zinc-400">
              The importer creates separate Whatnot order stubs first. Then you can go to Whatnot Orders and combine them into one break when the package arrives.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">After Import</div>
              <div className="mt-2 text-sm text-zinc-300">
                Go to <span className="font-medium">Whatnot Orders</span> to review and combine orders into breaks.
              </div>
              <div className="mt-4">
                <Link
                  href="/app/whatnot-orders"
                  className="inline-flex rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
                >
                  View Whatnot Orders
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">Last Import Result</div>
              <div className="mt-2 space-y-2 text-sm text-zinc-300">
                <div>
                  Imported:{' '}
                  <span className="font-medium">
                    {lastImportedCount != null ? lastImportedCount : '—'}
                  </span>
                </div>
                <div>
                  Duplicates skipped:{' '}
                  <span className="font-medium">
                    {lastDuplicateCount != null ? lastDuplicateCount : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
            Recommended flow: export from Whatnot → import here → combine related orders into one break → enter cards when they arrive.
          </div>
        </div>
      </div>
    </div>
  )
}