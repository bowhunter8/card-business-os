'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'

type UploadState = 'idle' | 'dragging' | 'ready' | 'importing' | 'success' | 'error'

type SkippedRow = {
  row: number
  item: string
  reason: string
}
type ImportResult = {
  imported: number
  skipped: number
  errors?: string[]
  duplicates: number
  warnings?: number
  skippedRows?: SkippedRow[]
  
}

const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'

  const units = ['bytes', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function isCsvFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
}

export default function InventoryImportPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const canImport = Boolean(selectedFile) && uploadState === 'ready'
  const canClear = Boolean(selectedFile) || Boolean(errorMessage) || Boolean(importResult)

  const helperText = useMemo(() => {
    if (uploadState === 'dragging') return 'Drop your CSV file here.'
    if (uploadState === 'importing') return 'Importing your inventory CSV...'
    if (selectedFile) return 'CSV file selected and ready to import.'
    return 'Choose a CSV file exported from your spreadsheet, or download the HITS™ template first.'
  }, [selectedFile, uploadState])

  function validateAndSetFile(file: File | null) {
    setErrorMessage('')
    setImportResult(null)

    if (!file) {
      setSelectedFile(null)
      setUploadState('idle')
      return
    }

    if (!isCsvFile(file)) {
      setSelectedFile(null)
      setUploadState('error')
      setErrorMessage('Please choose a .csv file.')
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setSelectedFile(null)
      setUploadState('error')
      setErrorMessage(`CSV file is too large. Please keep it under ${MAX_FILE_SIZE_MB} MB.`)
      return
    }

    setSelectedFile(file)
    setUploadState('ready')
  }

  function handleBrowseClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    validateAndSetFile(event.target.files?.[0] ?? null)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (uploadState !== 'dragging') setUploadState('dragging')
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setUploadState(selectedFile ? 'ready' : 'idle')
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    validateAndSetFile(event.dataTransfer.files?.[0] ?? null)
  }

  function handleClearFile() {
    if (!canClear) return

    setSelectedFile(null)
    setUploadState('idle')
    setErrorMessage('')
    setImportResult(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleImport() {
    if (!canImport || !selectedFile) {
      setUploadState('error')
      setErrorMessage('Choose a CSV file before importing.')
      return
    }

    setUploadState('importing')
    setErrorMessage('')
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.set('file', selectedFile)

      const response = await fetch('/api/inventory/import', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || 'Inventory import failed.')
      }

      setImportResult(result as ImportResult)
      setUploadState('success')
    } catch (error) {
      setUploadState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Inventory import failed.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">Inventory</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Add Inventory in Bulk
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Add inventory quickly from a spreadsheet. Use the HITS™ template for the safest import, then review any skipped rows after the import runs.
              </p>

              <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                <p className="text-sm font-semibold text-cyan-100">
                  Required: Item and Purchase Price
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Tip: The more information you import now, the less you'll need to enter later and the more accurate your reports and tax records will be.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row md:justify-end">
              <Link
                href="/api/inventory/template"
                className="inline-flex items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Download Template
              </Link>
              <Link
                href="/app/inventory"
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
              >
                Back to Inventory
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
            <div
              role="button"
              tabIndex={0}
              onClick={handleBrowseClick}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleBrowseClick()
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
                uploadState === 'dragging'
                  ? 'border-cyan-300 bg-cyan-400/10'
                  : uploadState === 'error'
                    ? 'border-red-400/70 bg-red-500/10'
                    : selectedFile
                      ? 'border-emerald-400/70 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-950/60 hover:border-cyan-400/60 hover:bg-slate-950'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-2xl">
                {selectedFile ? '✓' : '↑'}
              </div>

              <h2 className="text-xl font-bold text-white">
                {selectedFile ? selectedFile.name : 'Drop CSV here or click to browse'}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">{helperText}</p>

              {selectedFile ? (
                <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200">
                  <span className="font-semibold text-slate-100">File size:</span> {formatBytes(selectedFile.size)}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100">
                  {errorMessage}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleClearFile}
                aria-disabled={!canClear}
                className={`rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 ${canClear ? '' : 'cursor-not-allowed opacity-50'}`}
              >
                Clear
              </button>

              <button
                type="button"
                onClick={handleImport}
                aria-disabled={!canImport}
                className={`rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 ${canImport ? '' : 'cursor-not-allowed opacity-50'}`}
              >
                {uploadState === 'importing' ? 'Importing...' : 'Import CSV'}
              </button>
            </div>

            {importResult ? (
              <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <h2 className="text-lg font-bold text-white">Import Results</h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-200">Imported</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-100">{importResult.imported}</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-amber-200">Skipped</p>
                    <p className="mt-1 text-2xl font-bold text-amber-100">{importResult.skipped}</p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Duplicates</p>
                    <p className="mt-1 text-2xl font-bold text-slate-100">{importResult.duplicates}</p>
                  </div>
                </div>

                {(importResult.skippedRows ?? []).length > 0 ? (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold text-amber-100">Skipped Rows</h3>
                    <div className="mt-2 overflow-x-auto rounded-xl border border-amber-500/30">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="bg-amber-500/10 text-xs uppercase tracking-wide text-amber-200">
                          <tr>
                            <th className="px-3 py-2">CSV Row</th>
                            <th className="px-3 py-2">Item</th>
                            <th className="px-3 py-2">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-500/20">
                          {(importResult.skippedRows ?? []).slice(0, 25).map((row, index) => (
                            <tr key={`${row.row}-${index}`}>
                              <td className="px-3 py-2 text-amber-100">{row.row}</td>
                              <td className="px-3 py-2 text-slate-200">{row.item}</td>
                              <td className="px-3 py-2 text-slate-300">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

             </section>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
            <h2 className="text-lg font-bold text-white">Import basics</h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="font-semibold text-slate-100">Required Fields</p>
                <p className="mt-1">
                  Only Item and Purchase Price are required. Additional information improves reporting,
                  inventory tracking, and tax records.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="font-semibold text-slate-100">After import</p>
                <p className="mt-1">HITS™ imports valid rows and lists only skipped rows that require correction.</p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="font-semibold text-slate-100">Perfect For</p>
                <p className="mt-1">Useful for Whatnot buys, card shows, collections, basement finds, and quick inventory adds.</p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
