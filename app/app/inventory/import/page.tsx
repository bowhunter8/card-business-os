'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

type UploadState = 'idle' | 'ready' | 'importing' | 'success' | 'error'

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

function isDuplicateProtectionRow(row: SkippedRow) {
  return row.reason.toLowerCase().includes('already imported')
}

function getRowsNeedingAttention(result: ImportResult) {
  return (result.skippedRows ?? []).filter((row) => !isDuplicateProtectionRow(row))
}

function getNeedsAttentionCount(result: ImportResult) {
  return getRowsNeedingAttention(result).length
}

function getResultTitle(result: ImportResult) {
  const needsAttention = getNeedsAttentionCount(result)

  if (result.imported > 0 && needsAttention === 0) {
    return `Import complete: ${result.imported} row${result.imported === 1 ? '' : 's'} imported successfully.`
  }

  if (result.imported > 0 && needsAttention > 0) {
    return `Import complete: ${result.imported} imported, ${needsAttention} need attention.`
  }

  if (result.duplicates > 0 && needsAttention === 0) {
    return `Import complete: ${result.duplicates} already imported.`
  }

  return `Import finished with ${needsAttention} row${needsAttention === 1 ? '' : 's'} needing attention.`
}

function ImportResultSummary({ result }: { result: ImportResult }) {
  const rowsNeedingAttention = getRowsNeedingAttention(result)
  const needsAttention = rowsNeedingAttention.length

  return (
    <section className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5 shadow-xl shadow-emerald-950/30">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200">Import Results</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{getResultTitle(result)}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
            HITS™ imported valid rows and automatically protected you from duplicate inventory. Only rows that need correction are listed below.
          </p>
        </div>

        <div className="grid min-w-full gap-3 sm:grid-cols-3 lg:min-w-[420px]">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-200">Imported</p>
            <p className="mt-1 text-3xl font-bold text-emerald-100">{result.imported}</p>
          </div>
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 p-3">
            <p className="text-xs uppercase tracking-wide text-cyan-200">Already Imported</p>
            <p className="mt-1 text-3xl font-bold text-cyan-100">{result.duplicates}</p>
          </div>
          <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-3">
            <p className="text-xs uppercase tracking-wide text-red-200">Needs Attention</p>
            <p className="mt-1 text-3xl font-bold text-red-100">{needsAttention}</p>
          </div>
        </div>
      </div>

      {result.duplicates > 0 ? (
        <div className="mt-5 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm font-semibold text-cyan-100">
          {result.duplicates} row{result.duplicates === 1 ? '' : 's'} were already imported, so HITS™ safely skipped them to prevent duplicate inventory.
        </div>
      ) : null}

      {rowsNeedingAttention.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <h3 className="text-base font-bold text-red-100">Rows that need attention</h3>
          <p className="mt-1 text-sm text-slate-200">
            Fix these rows in the spreadsheet, save the CSV, and upload the corrected file again.
          </p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-red-500/30">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-red-500/15 text-xs uppercase tracking-wide text-red-200">
                <tr>
                  <th className="px-3 py-2">CSV Row</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-500/20 bg-slate-950/40">
                {rowsNeedingAttention.slice(0, 25).map((row, index) => (
                  <tr key={`${row.row}-${index}`}>
                    <td className="px-3 py-2 font-semibold text-red-100">{row.row}</td>
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
  )
}

export default function InventoryImportPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)

  const canImport = Boolean(selectedFile) && uploadState === 'ready'
  const canClear = Boolean(selectedFile) || Boolean(errorMessage) || Boolean(importResult)
  const modalRowsNeedingAttention = importResult ? getRowsNeedingAttention(importResult) : []
  const modalNeedsAttention = modalRowsNeedingAttention.length

  function validateAndSetFile(file: File | null) {
    setErrorMessage('')
    setImportResult(null)
    setShowResultModal(false)

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

  function handleClearFile() {
    if (!canClear) return

    setSelectedFile(null)
    setUploadState('idle')
    setErrorMessage('')
    setImportResult(null)
    setShowResultModal(false)

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
    setShowResultModal(false)

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
      setShowResultModal(true)
    } catch (error) {
      setUploadState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Inventory import failed.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {importResult && showResultModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-emerald-400/40 bg-slate-950 p-5 shadow-2xl shadow-black">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200">Import Complete</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{getResultTitle(importResult)}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResultModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-200">Imported</p>
                  <p className="mt-1 text-4xl font-bold text-emerald-100">{importResult.imported}</p>
                </div>
                <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 p-4">
                  <p className="text-xs uppercase tracking-wide text-cyan-200">Already Imported</p>
                  <p className="mt-1 text-4xl font-bold text-cyan-100">{importResult.duplicates}</p>
                </div>
                <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-4">
                  <p className="text-xs uppercase tracking-wide text-red-200">Needs Attention</p>
                  <p className="mt-1 text-4xl font-bold text-red-100">{modalNeedsAttention}</p>
                </div>
              </div>

              {importResult.duplicates > 0 ? (
                <div className="mt-5 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm font-semibold text-cyan-100">
                  {importResult.duplicates} row{importResult.duplicates === 1 ? '' : 's'} were already imported, so HITS™ safely skipped them to prevent duplicate inventory.
                </div>
              ) : null}

              {modalRowsNeedingAttention.length > 0 ? (
                <div className="mt-5 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
                  <h3 className="text-base font-bold text-red-100">Rows that need attention</h3>
                  <p className="mt-1 text-sm text-slate-200">
                    Correct only these rows in the CSV and upload again. Already imported rows were safely skipped and do not need to be fixed.
                  </p>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-red-500/30">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-red-500/15 text-xs uppercase tracking-wide text-red-200">
                        <tr>
                          <th className="px-3 py-2">CSV Row</th>
                          <th className="px-3 py-2">Item</th>
                          <th className="px-3 py-2">Problem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-500/20 bg-slate-950/40">
                        {modalRowsNeedingAttention.slice(0, 25).map((row, index) => (
                          <tr key={`${row.row}-${index}`}>
                            <td className="px-3 py-2 font-semibold text-red-100">{row.row}</td>
                            <td className="px-3 py-2 text-slate-200">{row.item}</td>
                            <td className="px-3 py-2 text-slate-300">{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
                  No rows need attention. Everything valid was imported, and any duplicates were safely skipped.
                </div>
              )}
            </div>
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">Templates</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Add Inventory in Bulk
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
                Choose a template, fill in your items, then use the import box at the end of the row.
              </p>
            </div>

            <Link
              href="/app/inventory"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
            >
              Back to Inventory
            </Link>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-4 lg:grid-cols-2">

            <div className="flex h-full flex-col rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">Before You Start</h3>
              </div>

              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                <div>
                  <p className="font-semibold text-slate-100">Required Fields</p>
                  <p className="mt-1 text-slate-400">Only Item and Purchase Price are required. Quantity defaults to 1 if left blank.</p>
                </div>

                <div>
                  <p className="font-semibold text-slate-100">After import</p>
                  <p className="mt-1 text-slate-400">HITS™ imports valid rows and lists only skipped rows that require correction.</p>
                </div>

                <div>
                  <p className="font-semibold text-slate-100">Perfect For</p>
                  <p className="mt-1 text-slate-400">Whatnot buys, card shows, collections, basement finds, giveaways, and quick inventory adds.</p>
                </div>
              </div>
            </div>
            <div className="flex h-full flex-col rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-emerald-100">Quick Inventory Template</h3>
                <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2 py-1 text-xs font-semibold text-emerald-100">
                  Recommended
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                The fastest way to get inventory into HITS™. Only Item and Purchase Price are required.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Best for most users, quick adds, card show buys, collections, breaks, and basement finds.
              </p>
              <a
                href="/api/inventory/template"
                download
                className="mt-auto inline-flex items-center justify-center rounded-xl border border-emerald-300/40 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
              >
                Download Template
              </a>
            </div>

            <div className="flex h-full flex-col rounded-2xl border border-fuchsia-400/40 bg-fuchsia-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-fuchsia-100">Giveaway Template</h3>
                <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-400/15 px-2 py-1 text-xs font-semibold text-fuchsia-100">
                  Planned Giveaways
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Import planned giveaway inventory for livestreams, card shows, promotions, and show prep.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Uses the same simple fields as Quick Inventory. Items imported with this template are handled as giveaway inventory.
              </p>
              <a
                href="/api/inventory/template?type=giveaway"
                download
                className="mt-auto inline-flex items-center justify-center rounded-xl border border-fuchsia-300/40 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20"
              >
                Download Template
              </a>
            </div>

            <div className="flex h-full flex-col rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-amber-100">Import Completed CSV</h3>
                <span className="rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-100">
                  Final Step
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-200">
                Choose your completed CSV file, then click Import CSV.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />

              <button
                type="button"
                onClick={handleBrowseClick}
                className="mt-4 inline-flex items-center justify-center rounded-xl border border-amber-300/40 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
              >
                Choose CSV File
              </button>

              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                {selectedFile ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Selected File</p>
                    <p className="mt-1 break-all text-sm font-bold text-white">{selectedFile.name}</p>
                    <p className="mt-1 text-xs text-slate-400">File size: {formatBytes(selectedFile.size)}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-slate-100">No CSV selected</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">CSV only · Max {MAX_FILE_SIZE_MB} MB</p>
                  </div>
                )}
              </div>

              {errorMessage ? (
                <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100">
                  {errorMessage}
                </div>
              ) : null}

              <div className="mt-auto flex flex-col gap-2 pt-4">
                <button
                  type="button"
                  onClick={handleImport}
                  aria-disabled={!canImport}
                  className={`rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 ${canImport ? '' : 'cursor-not-allowed opacity-50'}`}
                >
                  {uploadState === 'importing' ? 'Importing...' : 'Import CSV'}
                </button>

                <button
                  type="button"
                  onClick={handleClearFile}
                  aria-disabled={!canClear}
                  className={`rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 ${canClear ? '' : 'cursor-not-allowed opacity-50'}`}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </section>

        {importResult ? <ImportResultSummary result={importResult} /> : null}
      </div>
    </main>
  )
}
