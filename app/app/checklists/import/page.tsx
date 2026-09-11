"use client"

import Link from 'next/link'
import ChecklistLoadingLink from '@/app/components/ChecklistLoadingLink'
import { FormEvent, useEffect, useMemo, useState } from 'react'

type ImportFileResult = {
  fileName: string
  totalRowsSeen: number
  normalizedRows: number
  insertedRows: number
  skippedRows: number
  sectionsCreated?: number
  checklistItemsCreated?: number
  teamRowsSeen?: number
  errors: string[]
}

type ProductIdentity = {
  year: string
  manufacturer: string
  brand: string
  checklistSport: string
  productName: string
}

type ImportResponse = {
  ok: boolean
  detectedSource?: string
  checklistId?: string
  checklistName?: string
  importMode?: string
  files?: ImportFileResult[]
  totals?: {
    files: number
    totalRowsSeen: number
    normalizedRows: number
    insertedRows: number
    skippedRows: number
    sectionsCreated?: number
    checklistItemsCreated?: number
    teamRowsSeen?: number
  }
  error?: string
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  )
}

function fileIdentity(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`
}

function inferProductIdentity(fileName: string): ProductIdentity {
  const rawBase = fileName
    .replace(/\.(?:xlsx|pdf)$/i, '')
    .replace(/\s*\(\d+\)\s*$/i, '')
    .trim()

  // Detect the stated year/season before normalizing filename separators.
  // This preserves 2024-25 / 2025-26 instead of turning the hyphen into a space
  // and accidentally treating the trailing 25/26 as part of the product name.
  const yearMatch = rawBase.match(
    /\b((?:19|20)\d{2})(?:\s*[-–—]\s*(\d{2,4}))?\b/
  )

  const year = yearMatch
    ? yearMatch[2]
      ? `${yearMatch[1]}-${yearMatch[2]}`
      : yearMatch[1]
    : ''

  const withoutRawYear = yearMatch
    ? rawBase.replace(yearMatch[0], ' ')
    : rawBase

  const base = withoutRawYear
    .replace(/[-_]+/g, ' ')
    .replace(/\bchecklist\s+insider\b/gi, ' ')
    .replace(/\bchecklist\b/gi, ' ')
    .replace(/\bdownloads?\b/gi, ' ')
    .replace(/\bexcel\b/gi, ' ')
    .replace(/\bspreadsheet\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const withoutYear = base
  const lower = withoutYear.toLowerCase()

  const paniniTerms = [
    'panini',
    'prizm',
    'national treasures',
    'donruss',
    'select',
    'immaculate',
    'three and two',
    'stars stripes',
    'stars & stripes',
  ]

  const toppsTerms = [
    'topps',
    'bowman',
    'finest',
    'stadium club',
    'heritage',
    'archives',
    'museum collection',
    'tier one',
    'pristine',
    'pro debut',
    't205',
    '205 baseball',
    'shoebox treasures',
    'allen ginter',
    'allen & ginter',
  ]

  const isPanini = paniniTerms.some((term) => lower.includes(term))
  const isTopps = !isPanini && toppsTerms.some((term) => lower.includes(term))

  const manufacturer =
    isPanini
      ? 'Panini'
      : isTopps
        ? 'Topps'
        : /\bfleer\b/i.test(withoutYear)
          ? 'Fleer'
          : ''

  const checklistSport =
    /\bbaseball\b/i.test(withoutYear)
      ? 'Baseball'
      : /\bbasketball\b/i.test(withoutYear)
        ? 'Basketball'
        : /\bfootball\b/i.test(withoutYear)
          ? 'Football'
          : /\bhockey\b/i.test(withoutYear)
            ? 'Hockey'
            : /\bsoccer\b/i.test(withoutYear)
              ? 'Soccer'
              : ''

  let brand = ''

  if (/\btopps chrome\b/i.test(withoutYear)) {
    brand = 'Chrome'
  } else if (/\bbowman chrome\b/i.test(withoutYear)) {
    brand = 'Bowman Chrome'
  } else if (/\bbowman\b/i.test(withoutYear)) {
    brand = 'Bowman'
  } else if (/\bprizm\b/i.test(withoutYear)) {
    brand = 'Prizm'
  } else if (/\bdonruss\b/i.test(withoutYear)) {
    brand = 'Donruss'
  } else if (/\bfinest\b/i.test(withoutYear)) {
    brand = 'Finest'
  } else if (/\bstadium club\b/i.test(withoutYear)) {
    brand = 'Stadium Club'
  } else if (/\bheritage\b/i.test(withoutYear)) {
    brand = 'Heritage'
  }

  const productName = [
    manufacturer,
    brand,
    checklistSport,
  ]
    .filter(Boolean)
    .join(' ')
    .trim() || withoutYear || 'Imported Checklist'

  return {
    year,
    manufacturer,
    brand,
    checklistSport,
    productName,
  }
}

function updateIdentityField(
  current: Record<string, ProductIdentity>,
  fileKey: string,
  field: keyof ProductIdentity,
  value: string
) {
  return {
    ...current,
    [fileKey]: {
      ...(current[fileKey] ?? {
        year: '',
        manufacturer: '',
        brand: '',
        checklistSport: '',
        productName: '',
      }),
      [field]: value,
    },
  }
}

function derivedProductName(identity: ProductIdentity) {
  const parts = [
    identity.manufacturer.trim(),
    identity.brand.trim(),
    identity.checklistSport.trim(),
  ].filter(Boolean)

  return parts.join(' ').trim() || identity.productName.trim() || 'Imported Checklist'
}

function isPopupChecklistImport() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('popup') === '1'
}

export default function ChecklistImportPage() {
  const [popupMode, setPopupMode] = useState(false)

  useEffect(() => {
    setPopupMode(isPopupChecklistImport())
  }, [])
  const [files, setFiles] = useState<File[]>([])
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResponse[]>([])
  const [inputKey, setInputKey] = useState(0)
  const [identities, setIdentities] = useState<Record<string, ProductIdentity>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const totalFileSize = useMemo(() => {
    const bytes = files.reduce((sum, file) => sum + file.size, 0)
    if (!bytes) return ''
    const megabytes = bytes / (1024 * 1024)
    return megabytes >= 1
      ? `${megabytes.toFixed(2)} MB total`
      : `${Math.max(1, Math.round(bytes / 1024))} KB total`
  }, [files])


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (files.length === 0) {
      alert('Choose one or more checklist XLSX or PDF files first.')
      return
    }

    const unsupported = files.filter((file) => {
      const lowerName = file.name.toLowerCase()
      return !lowerName.endsWith('.xlsx') && !lowerName.endsWith('.pdf')
    })

    if (unsupported.length > 0) {
      setResults([
        {
          ok: false,
          error: `Unsupported file${unsupported.length === 1 ? '' : 's'}: ${unsupported
            .map((file) => file.name)
            .join(', ')}. HITS currently accepts XLSX and PDF checklist files.`,
        },
      ])
      return
    }

    const currentPopupMode = isPopupChecklistImport()
    setPopupMode(currentPopupMode)
    setImporting(true)
    setResults([])
    setSuccessMessage(null)

    const completedResults: ImportResponse[] = []
    const successfulChecklistIds: string[] = []

    try {
      for (const file of files) {
        try {
          const formData = new FormData()
          formData.append('file', file)

          const identity =
            identities[fileIdentity(file)] ?? inferProductIdentity(file.name)

          formData.append(
            'metadataOverride',
            JSON.stringify({
              year: identity.year.trim(),
              manufacturer: identity.manufacturer.trim(),
              brand: identity.brand.trim(),
              checklistSport: identity.checklistSport.trim(),
              productName: derivedProductName(identity),
            })
          )

          const response = await fetch('/api/checklists/import', {
            method: 'POST',
            body: formData,
          })

          const contentType = response.headers.get('content-type') ?? ''
          if (!contentType.includes('application/json')) {
            throw new Error(
              `Checklist import returned an unexpected response (${response.status}).`
            )
          }

          const json = (await response.json()) as ImportResponse

          if (!json.files || json.files.length === 0) {
            json.files = [
              {
                fileName: file.name,
                totalRowsSeen: json.totals?.totalRowsSeen ?? 0,
                normalizedRows: json.totals?.normalizedRows ?? 0,
                insertedRows: json.totals?.insertedRows ?? 0,
                skippedRows: json.totals?.skippedRows ?? 0,
                sectionsCreated: json.totals?.sectionsCreated ?? 0,
                checklistItemsCreated: json.totals?.checklistItemsCreated ?? 0,
                teamRowsSeen: json.totals?.teamRowsSeen ?? 0,
                errors: json.error ? [json.error] : [],
              },
            ]
          }

          completedResults.push(json)
          setResults([...completedResults])

          if (json.ok && json.checklistId) {
            successfulChecklistIds.push(json.checklistId)
          }
        } catch (error) {
          const failed: ImportResponse = {
            ok: false,
            error:
              error instanceof Error
                ? `${file.name}: ${error.message}`
                : `${file.name}: The checklist import could not be completed.`,
            files: [
              {
                fileName: file.name,
                totalRowsSeen: 0,
                normalizedRows: 0,
                insertedRows: 0,
                skippedRows: 0,
                errors: [
                  error instanceof Error
                    ? error.message
                    : 'The checklist import could not be completed.',
                ],
              },
            ],
          }

          completedResults.push(failed)
          setResults([...completedResults])
        }
      }

      if (successfulChecklistIds.length > 0) {
        const importedCount = successfulChecklistIds.length
        setSuccessMessage(
          importedCount === 1
            ? 'Checklist imported successfully.'
            : `${importedCount} checklists imported successfully.`
        )
      }

      if (
        successfulChecklistIds.length > 0 &&
        isPopupChecklistImport() &&
        window.opener &&
        !window.opener.closed
      ) {
        window.opener.postMessage(
          {
            type: 'hits:checklists-imported',
            checklistIds: successfulChecklistIds,
          },
          window.location.origin
        )

        window.setTimeout(() => window.close(), 1200)
      }
    } finally {
      setImporting(false)
    }
  }

  function clearFiles() {
    setFiles([])
    setIdentities({})
    setResults([])
    setSuccessMessage(null)
    setInputKey((value) => value + 1)
  }


  return (
    <div className="app-page-wide space-y-5">
      {importing && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex min-w-72 flex-col items-center gap-4 rounded-2xl border border-cyan-800 bg-zinc-950 px-8 py-7 shadow-2xl">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-cyan-300" />
            <div className="text-center">
              <div className="text-base font-semibold text-zinc-100">
                Importing checklist{files.length === 1 ? '' : 's'}...
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                HITS is reading and validating the checklist file. Please wait.
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Import Checklist</h1>
          <p className="app-subtitle">
            Upload one or more XLSX or PDF checklists. HITS identifies each file automatically.
          </p>
        </div>

        {popupMode ? (
          <button
            type="button"
            className="app-button"
            onClick={() => window.close()}
          >
            Close
          </button>
        ) : (
          <Link href="/app/checklists" className="app-button">
            Back to Checklist Library
          </Link>
        )}
      </div>

      <section className="app-section space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Checklist Files</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Original checklist files from the manufacturer or an established provider
            are preferred. HITS supports structured XLSX workbooks and text-based PDFs,
            looks for real checklist structure such as card numbers, player or item names,
            sections, and team data, and safely rejects files it cannot identify with
            confidence.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-800 bg-emerald-950/30 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            Manufacturer XLSX · Preferred
          </span>
          <span className="rounded-full border border-emerald-800 bg-emerald-950/30 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            Beckett XLSX · Supported
          </span>
          <span className="rounded-full border border-emerald-800 bg-emerald-950/30 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            Checklist Insider XLSX · Supported
          </span>
          <span className="rounded-full border border-cyan-800 bg-cyan-950/30 px-2.5 py-1 text-xs font-semibold text-cyan-200">
            Text-based PDF · Supported
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5">
            <label className="block text-sm font-semibold text-zinc-100">
              Select checklist files
            </label>

            <div className="mt-1 text-sm text-zinc-400">
              Select as many XLSX or PDF checklists as you want. Browse again to add more files to the queue. Duplicate selections are ignored, and one failed file will not stop the others.
            </div>

            <input
              key={inputKey}
              type="file"
              multiple
              accept=".xlsx,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
              onChange={(event) => {
                const newlySelected = Array.from(event.target.files ?? [])

                setFiles((current) => {
                  const seen = new Set(current.map(fileIdentity))
                  const next = [...current]

                  for (const file of newlySelected) {
                    const identity = fileIdentity(file)
                    if (seen.has(identity)) continue
                    seen.add(identity)
                    next.push(file)
                  }

                  return next
                })

                setIdentities((current) => {
                  const next = { ...current }

                  for (const file of newlySelected) {
                    const identity = fileIdentity(file)
                    if (!next[identity]) {
                      next[identity] = inferProductIdentity(file.name)
                    }
                  }

                  return next
                })

                setResults([])
                setInputKey((value) => value + 1)
              }}
              className="mt-4 block w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:font-semibold file:text-zinc-100 hover:file:bg-zinc-700"
            />

            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-semibold text-cyan-200">
                  {files.length} checklist file{files.length === 1 ? '' : 's'} selected
                  {totalFileSize ? ` · ${totalFileSize}` : ''}
                </div>
                {files.map((file) => {
                  const key = fileIdentity(file)
                  const identity = identities[key] ?? inferProductIdentity(file.name)

                  return (
                    <details
                      key={key}
                      open
                      className="overflow-hidden rounded-xl border border-cyan-900/60 bg-cyan-950/20"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm text-zinc-200 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0">
                          <div className="truncate font-medium" title={file.name}>
                            {file.name}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-zinc-400">
                            {[
                              identity.year,
                              identity.manufacturer,
                              identity.brand,
                              identity.checklistSport,
                            ]
                              .filter(Boolean)
                              .join(' • ') || 'Product identity needs review'}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="app-badge">Review identity</span>

                          {!importing && (
                            <button
                              type="button"
                              className="app-button px-2.5 py-1 text-xs"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()

                                setFiles((current) =>
                                  current.filter(
                                    (candidate) =>
                                      fileIdentity(candidate) !== key
                                  )
                                )

                                setIdentities((current) => {
                                  const next = { ...current }
                                  delete next[key]
                                  return next
                                })

                                setResults([])
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </summary>

                      <div className="border-t border-cyan-900/60 bg-cyan-950/10 px-3 pt-3 text-xs text-cyan-100">
                        Confirm the checklist identity before importing. Year, Manufacturer, Set, and Checklist Sport give HITS a reliable product identity even when the file name is vague or the source is an older PDF.
                      </div>

                      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Year
                          <input
                            type="text"
                            value={identity.year}
                            disabled={importing}
                            onChange={(event) =>
                              setIdentities((current) =>
                                updateIdentityField(
                                  current,
                                  key,
                                  'year',
                                  event.target.value
                                )
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-100 outline-none focus:border-cyan-600"
                            placeholder="2025"
                          />
                        </label>

                        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Manufacturer
                          <input
                            type="text"
                            value={identity.manufacturer}
                            disabled={importing}
                            onChange={(event) =>
                              setIdentities((current) =>
                                updateIdentityField(
                                  current,
                                  key,
                                  'manufacturer',
                                  event.target.value
                                )
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-100 outline-none focus:border-cyan-600"
                            placeholder="Topps"
                          />
                        </label>

                        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Set
                          <input
                            type="text"
                            value={identity.brand}
                            disabled={importing}
                            onChange={(event) =>
                              setIdentities((current) =>
                                updateIdentityField(
                                  current,
                                  key,
                                  'brand',
                                  event.target.value
                                )
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-100 outline-none focus:border-cyan-600"
                            placeholder="Chrome, Prizm, Finest..."
                          />
                        </label>

                        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Checklist Sport
                          <input
                            type="text"
                            value={identity.checklistSport}
                            disabled={importing}
                            onChange={(event) =>
                              setIdentities((current) =>
                                updateIdentityField(
                                  current,
                                  key,
                                  'checklistSport',
                                  event.target.value
                                )
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-100 outline-none focus:border-cyan-600"
                            placeholder="Baseball"
                          />
                        </label>

                        <div className="sm:col-span-2 xl:col-span-4 text-xs text-zinc-500">
                          HITS pre-fills these when possible, but you can always correct them here. For example: 2026 • Topps • Chrome • Baseball. Older products may not have a separate Set, so that field can be left blank.
                        </div>
                      </div>
                    </details>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={importing}
              className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? `Importing ${files.length} Checklist${files.length === 1 ? '' : 's'}...` : files.length > 1 ? `Import ${files.length} Checklists` : 'Import Checklist'}
            </button>

            {files.length > 0 && !importing && (
              <button type="button" className="app-button" onClick={clearFiles}>
                Clear
              </button>
            )}
          </div>
        </form>

        <p className="text-xs text-zinc-500">
          HITS keeps the existing structured XLSX import paths and also accepts
          text-based PDFs. Card-row structure determines whether a file is safe to
          import. Team data and richer checklist details are helpful but are not required.
          Image-only or scanned PDFs are rejected rather than guessed at.
        </p>
      </section>

      {results.length > 0 && (
        <section className="app-section space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Import Results</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {results.filter((result) => result.ok).length} of {results.length}{' '}
              checklist{results.length === 1 ? '' : 's'} imported successfully.
            </p>
          </div>

          {popupMode && results.some((result) => result.ok && result.checklistId) && !importing && (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-200">
              Imported checklists are being returned to the break entry window...
            </div>
          )}

          <div className="space-y-3">
            {results.map((result, resultIndex) => {
              const fileResult = result.files?.[0]
              const displayName =
                fileResult?.fileName ||
                result.checklistName ||
                `Checklist ${resultIndex + 1}`

              return (
                <div
                  key={`${displayName}-${resultIndex}`}
                  className={`rounded-xl border p-4 ${
                    result.ok
                      ? 'border-emerald-900/70 bg-emerald-950/15'
                      : 'border-red-900 bg-red-950/20'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-zinc-100">{displayName}</div>
                      {result.detectedSource && (
                        <div className="mt-1 text-xs text-zinc-400">
                          {result.detectedSource}
                        </div>
                      )}
                      {result.checklistName && (
                        <div className="mt-1 text-sm text-zinc-300">
                          {result.checklistName}
                        </div>
                      )}
                      {result.importMode && (
                        <div
                          className={`mt-1 text-xs ${
                            result.importMode.startsWith('upgraded checklist source')
                              ? 'font-semibold text-amber-300'
                              : 'text-zinc-500'
                          }`}
                        >
                          {result.importMode}
                        </div>
                      )}
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        result.ok
                          ? 'border-emerald-800 text-emerald-300'
                          : 'border-red-800 text-red-300'
                      }`}
                    >
                      {result.ok ? 'Imported' : 'Failed'}
                    </span>
                  </div>

                  {!result.ok && (
                    <div className="mt-3 text-sm text-red-200">
                      {result.error || 'Checklist import failed.'}
                    </div>
                  )}

                  {result.ok && result.totals && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                      <Stat label="Rows Seen" value={result.totals.totalRowsSeen} />
                      <Stat label="Normalized" value={result.totals.normalizedRows} />
                      <Stat label="Inserted" value={result.totals.insertedRows} />
                      <Stat label="Skipped" value={result.totals.skippedRows} />
                      <Stat label="Sections" value={result.totals.sectionsCreated ?? 0} />
                      <Stat label="Team Rows" value={result.totals.teamRowsSeen ?? 0} />
                      <Stat label="Files" value={result.totals.files} />
                    </div>
                  )}

                  {!popupMode && result.ok && result.checklistId && (
                    <ChecklistLoadingLink
                      href={`/app/checklists/${result.checklistId}`}
                      className="app-button mt-3 inline-flex"
                    >
                      Open Checklist
                    </ChecklistLoadingLink>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {successMessage && !importing && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="text-lg font-semibold text-emerald-300">
              Import Successful
            </div>
            <div className="mt-2 text-sm text-zinc-300">
              {successMessage}
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Review the import results below or open the checklist to verify the imported rows.
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="app-button-primary"
                onClick={() => setSuccessMessage(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
