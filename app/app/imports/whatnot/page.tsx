'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function WhatnotImportPage() {
  const [fileName, setFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastImportedCount, setLastImportedCount] = useState<number | null>(null)
  const [lastDuplicateCount, setLastDuplicateCount] = useState<number | null>(null)

  function onFileChange(file: File | null) {
    setError('')
    setSuccess('')
    setLastImportedCount(null)
    setLastDuplicateCount(null)

    if (!file) {
      setFileName('')
      setSelectedFile(null)
      return
    }

    setFileName(file.name)
    setSelectedFile(file)
  }

  async function runImport() {
    if (!selectedFile) {
      setError('Upload an order CSV file first.')
      return
    }

    try {
      setImporting(true)
      setError('')
      setSuccess('')

      const csvText = await selectedFile.text()

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
        `Imported ${json.imported} order stub(s). Skipped ${json.skippedDuplicates} duplicate(s).`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="app-page max-w-5xl">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Order CSV Import</h1>
          <p className="app-subtitle">
            Import order history from a CSV file into separate order stubs. Each
            order stays preserved so you can group related orders into a purchase
            batch later.
          </p>
        </div>

        <Link href="/app/utilities" className="app-button">
          Back to Utilities
        </Link>
      </div>

      {error ? <div className="app-alert-error">{error}</div> : null}

      {success ? <div className="app-alert-success">{success}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="app-section space-y-3">
          <div>
            <div className="text-lg font-semibold">Import File</div>
            <p className="mt-0.5 text-sm text-zinc-400">
              Select your order CSV export and import it directly. No preview step
              needed.
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
              <p className="mt-1.5 text-xs text-zinc-400">Loaded: {fileName}</p>
            ) : null}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={runImport}
              disabled={importing || !selectedFile}
              className="app-button-primary disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import Orders'}
            </button>
          </div>

          <div className="app-card-tight text-sm text-zinc-400">
            <div className="font-medium text-zinc-200">What gets stored</div>
            <div className="mt-2 space-y-1">
              <p>Order ID</p>
              <p>Numeric order ID</p>
              <p>Seller / Source</p>
              <p>Product / Description</p>
              <p>Subtotal</p>
              <p>Shipping</p>
              <p>Taxes</p>
              <p>Total</p>
            </div>
          </div>
        </div>

        <div className="app-section">
          <div>
            <div className="text-lg font-semibold">Import Flow</div>
            <p className="mt-0.5 text-sm text-zinc-400">
              The importer creates separate order stubs first. Then you can review
              and combine related orders into a break, batch, or other grouped
              purchase workflow when the items arrive.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="app-card-tight">
              <div className="text-sm text-zinc-400">After Import</div>
              <div className="mt-2 text-sm text-zinc-300">
                Go to <span className="font-medium">Orders</span> to review and
                combine imported orders into your inventory workflow.
              </div>
              <div className="mt-3">
                <Link href="/app/whatnot-orders" className="app-button">
                  View Imported Orders
                </Link>
              </div>
            </div>

            <div className="app-card-tight">
              <div className="text-sm text-zinc-400">Last Import Result</div>
              <div className="mt-2 space-y-1.5 text-sm text-zinc-300">
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

          <div className="app-card-tight mt-4 text-sm text-zinc-400">
            Recommended flow: export order history → import here → combine related
            orders into one batch or break → enter items when they arrive.
          </div>
        </div>
      </div>
    </div>
  )
}