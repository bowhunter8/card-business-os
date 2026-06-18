'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'

type PreviewRow = Record<string, string>

type ValidationIssue = {
  row: number
  field: string
  message: string
}

const REQUIRED_HEADERS = [
  'player_item_name',
  'category',
  'quantity',
  'cost_basis',
]

const OPTIONAL_HEADERS = [
  'brand',
  'year',
  'card_number',
  'condition',
  'purchase_date',
  'purchased_from',
  'purchase_notes',
  'storage_location',
  'tags',
]

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"'
      index += 1
      continue
    }

    if (character === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (character === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  values.push(current.trim())
  return values
}

function parseCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return { headers: [], rows: [] as PreviewRow[] }
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return headers.reduce<PreviewRow>((row, header, index) => {
      row[header] = values[index] ?? ''
      return row
    }, {})
  })

  return { headers, rows }
}

function validateRows(headers: string[], rows: PreviewRow[]) {
  const issues: ValidationIssue[] = []
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header))

  missingHeaders.forEach((header) => {
    issues.push({
      row: 0,
      field: header,
      message: `Missing required column: ${header}`,
    })
  })

  rows.forEach((row, rowIndex) => {
    const displayRow = rowIndex + 2

    if (!String(row.player_item_name || '').trim()) {
      issues.push({ row: displayRow, field: 'player_item_name', message: 'Player/Item Name is required.' })
    }

    if (!String(row.category || '').trim()) {
      issues.push({ row: displayRow, field: 'category', message: 'Category is required.' })
    }

    const quantity = Number(row.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push({ row: displayRow, field: 'quantity', message: 'Quantity must be greater than 0.' })
    }

    const costBasis = Number(row.cost_basis)
    if (!Number.isFinite(costBasis) || costBasis < 0) {
      issues.push({ row: displayRow, field: 'cost_basis', message: 'Cost basis must be 0 or higher.' })
    }
  })

  return issues
}

function InventoryImportPreviewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => parseCsv(csvText), [csvText])
  const issues = useMemo(() => validateRows(parsed.headers, parsed.rows), [parsed.headers, parsed.rows])
  const hasRows = parsed.rows.length > 0
  const canImport = hasRows && issues.length === 0 && !importing

  const visibleHeaders = useMemo(() => {
    const existing = parsed.headers.filter((header) => ALL_HEADERS.includes(header))
    const extras = parsed.headers.filter((header) => !ALL_HEADERS.includes(header))
    return [...existing, ...extras]
  }, [parsed.headers])

  async function handleImport() {
    if (!canImport) return

    setImporting(true)
    setError(null)

    try {
      const response = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed.rows }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || 'Inventory import failed.')
      }

      router.push('/inventory?imported=1')
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Inventory import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">HITS™ Inventory Import</p>
            <h1 className="mt-2 text-2xl font-bold text-white">CSV Preview</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Review the file before anything is added to inventory. Required columns are Player/Item Name, category,
              quantity, and cost basis.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/inventory/import"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-cyan-400 hover:text-cyan-200"
            >
              Back to Upload
            </Link>
            <Link
              href="/api/inventory/template"
              className="rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
            >
              Download Template
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <label className="text-sm font-semibold text-slate-200" htmlFor="csvText">
            Paste CSV content for preview
          </label>
          <textarea
            id="csvText"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder="Paste the CSV content here if the upload page did not pass it automatically."
            className="mt-3 min-h-40 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none ring-cyan-500/30 placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4"
          />
          {searchParams.get('file') ? (
            <p className="mt-2 text-xs text-slate-400">Selected file: {searchParams.get('file')}</p>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Rows Ready</p>
            <p className="mt-2 text-3xl font-bold text-white">{parsed.rows.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Columns Found</p>
            <p className="mt-2 text-3xl font-bold text-white">{parsed.headers.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Issues</p>
            <p className={`mt-2 text-3xl font-bold ${issues.length ? 'text-amber-300' : 'text-emerald-300'}`}>
              {issues.length}
            </p>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
        ) : null}

        {issues.length > 0 ? (
          <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
            <h2 className="text-lg font-bold text-amber-100">Fix these before importing</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-amber-200/80">
                  <tr>
                    <th className="py-2 pr-4">Row</th>
                    <th className="py-2 pr-4">Field</th>
                    <th className="py-2 pr-4">Issue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-500/20 text-amber-50">
                  {issues.slice(0, 25).map((issue, index) => (
                    <tr key={`${issue.row}-${issue.field}-${index}`}>
                      <td className="py-2 pr-4">{issue.row === 0 ? 'Header' : issue.row}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{issue.field}</td>
                      <td className="py-2 pr-4">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Preview Rows</h2>
              <p className="mt-1 text-sm text-slate-400">Showing the first 50 rows before import.</p>
            </div>
            <button
              type="button"
              disabled={!canImport}
              onClick={handleImport}
              className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/40 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {importing ? 'Importing...' : 'Import Inventory'}
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  {visibleHeaders.length ? (
                    visibleHeaders.map((header) => (
                      <th key={header} className="px-3 py-3 font-semibold">
                        {header}
                      </th>
                    ))
                  ) : (
                    <th className="px-3 py-3 font-semibold">No CSV loaded</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {parsed.rows.slice(0, 50).map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-800/50">
                    {visibleHeaders.map((header) => (
                      <td key={header} className="max-w-64 truncate px-3 py-3 text-slate-200">
                        {row[header] || <span className="text-slate-600">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {!hasRows ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={Math.max(visibleHeaders.length, 1)}>
                      Paste CSV content above to preview rows.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

export default function InventoryImportPreviewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-100">Loading preview...</div>}>
      <InventoryImportPreviewContent />
    </Suspense>
  )
}
