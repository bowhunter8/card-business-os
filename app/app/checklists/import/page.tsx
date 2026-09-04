"use client"

import Link from 'next/link'
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
      alert('Choose one or more checklist XLSX files first.')
      return
    }

    const unsupported = files.filter(
      (file) => !file.name.toLowerCase().endsWith('.xlsx')
    )

    if (unsupported.length > 0) {
      setResults([
        {
          ok: false,
          error: `Unsupported file${unsupported.length === 1 ? '' : 's'}: ${unsupported
            .map((file) => file.name)
            .join(', ')}. HITS currently accepts XLSX checklist files.`,
        },
      ])
      return
    }

    const currentPopupMode = isPopupChecklistImport()
    setPopupMode(currentPopupMode)
    setImporting(true)
    setResults([])

    const completedResults: ImportResponse[] = []
    const successfulChecklistIds: string[] = []

    try {
      for (const file of files) {
        try {
          const formData = new FormData()
          formData.append('file', file)

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
    setResults([])
    setInputKey((value) => value + 1)
  }


  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Import Checklist</h1>
          <p className="app-subtitle">
            Upload one or more XLSX checklists. HITS identifies each workbook automatically.
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
            Beckett and Checklist Insider XLSX checklists are currently supported.
            You do not need to choose which source the file came from.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-800 bg-emerald-950/30 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            Beckett XLSX · Supported
          </span>
          <span className="rounded-full border border-emerald-800 bg-emerald-950/30 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            Checklist Insider XLSX · Supported
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5">
            <label className="block text-sm font-semibold text-zinc-100">
              Select checklist files
            </label>

            <div className="mt-1 text-sm text-zinc-400">
              Select as many XLSX checklists as you want. Browse again to add more files to the queue. Duplicate selections are ignored, and one failed file will not stop the others.
            </div>

            <input
              key={inputKey}
              type="file"
              multiple
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
                {files.map((file) => (
                  <div
                    key={fileIdentity(file)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-cyan-900/60 bg-cyan-950/20 px-3 py-2 text-sm text-zinc-200"
                  >
                    <span className="min-w-0 truncate" title={file.name}>
                      {file.name}
                    </span>

                    {!importing && (
                      <button
                        type="button"
                        className="app-button shrink-0 px-2.5 py-1 text-xs"
                        onClick={() => {
                          setFiles((current) =>
                            current.filter(
                              (candidate) =>
                                fileIdentity(candidate) !== fileIdentity(file)
                            )
                          )
                          setResults([])
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
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
          Have a checklist from another source? Submit a feature request so the
          format can be reviewed before HITS supports it.
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
                    <Link
                      href={`/app/checklists/${result.checklistId}`}
                      className="app-button mt-3 inline-flex"
                    >
                      Open Checklist
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
