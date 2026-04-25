'use client'

import { useState } from 'react'

type ValidationResult = {
  ok: boolean
  backup?: {
    app: string
    type: string
    version: number
    exported_at: string | null
    user_id: string | null
  }
  summary?: {
    total_tables_attempted: number
    total_tables_included: number
    total_rows_exported: number
  }
  sections?: Array<{
    key: string
    table: string
    included: boolean
    count: number
    error?: string
  }>
  warnings?: string[]
  error?: string
}

type RestoreResult = {
  ok: boolean
  mode: 'merge' | 'replace'
  summary?: {
    inserted_total?: number
    skipped_existing_total?: number
    deleted_existing_total?: number
  }
  tables?: Array<{
    key: string
    table: string
    inserted: number
    skipped_existing?: number
  }>
  error?: string
  rollback_error?: string
}

export default function RestorePreviewPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)

  function onFileChange(file: File | null) {
    setSelectedFile(file)
    setFileName(file?.name ?? '')
    setError('')
    setResult(null)
    setRestoreResult(null)
    setConfirmed(false)
  }

  async function handleValidate() {
    if (!selectedFile || isValidating) return

    try {
      setIsValidating(true)
      setError('')
      setResult(null)
      setRestoreResult(null)
      setConfirmed(false)

      const text = await selectedFile.text()

      const response = await fetch('/api/utilities/backup/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          backupText: text,
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Backup validation failed')
      }

      setResult(json as ValidationResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup validation failed')
    } finally {
      setIsValidating(false)
    }
  }

  async function handleRestore() {
    if (!selectedFile || !result?.ok || !confirmed || isRestoring) return

    try {
      // 🔥 ONLY NEW ADDITION START
      const shouldBackup = confirm(
        'Do you want to create a backup before restoring? This is strongly recommended.'
      )

      if (shouldBackup) {
        try {
          const res = await fetch('/api/utilities/backup/export')
          if (res.ok) {
            localStorage.setItem('last_backup_date', new Date().toISOString())
          }
        } catch {
          // silent fail
        }
      }
      // 🔥 ONLY NEW ADDITION END

      setIsRestoring(true)
      setError('')
      setRestoreResult(null)

      const text = await selectedFile.text()

      const response = await fetch('/api/utilities/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupText: text,
          mode,
          confirmed: true,
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(
          [json?.error, json?.rollback_error].filter(Boolean).join(' ')
        )
      }

      setRestoreResult(json as RestoreResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm text-zinc-300">Backup File</label>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"
        />
        {fileName ? (
          <p className="mt-1.5 text-xs text-zinc-400">Loaded: {fileName}</p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Restore Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}
            className="app-select"
            disabled={isRestoring}
          >
            <option value="merge">Merge (safer, keeps existing data)</option>
            <option value="replace">Replace (overwrite current app data)</option>
          </select>
        </div>

        <div className="app-card-tight p-4 text-sm text-zinc-400">
          <div className="font-semibold text-zinc-200">
            {mode === 'merge' ? 'Merge Mode' : 'Replace Mode'}
          </div>
          <p className="mt-2">
            {mode === 'merge'
              ? 'Merge inserts only records that do not already exist by ID. Existing records stay in place.'
              : 'Replace removes current app data for these tables and restores from the backup file. Use only when you want the app returned to that backup state.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleValidate}
          disabled={!selectedFile || isValidating}
          className="app-button disabled:opacity-50"
        >
          {isValidating ? 'Validating Backup...' : 'Validate Backup File'}
        </button>

        <button
          type="button"
          onClick={handleRestore}
          disabled={!selectedFile || !result?.ok || !confirmed || isRestoring}
          className="app-button-primary disabled:opacity-50"
        >
          {isRestoring
            ? mode === 'merge'
              ? 'Running Merge Restore...'
              : 'Running Replace Restore...'
            : mode === 'merge'
              ? 'Run Merge Restore'
              : 'Run Replace Restore'}
        </button>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={!result?.ok || isRestoring}
          className="mt-1"
        />
        <span>
          I understand that restore changes live app data.
          {mode === 'replace'
            ? ' Replace mode will overwrite current records in the included tables.'
            : ' Merge mode adds missing records and skips existing record IDs.'}
        </span>
      </label>

      {error ? <div className="app-alert-error">{error}</div> : null}

      {result?.ok ? (
        <div className="space-y-4">
          <div className="app-alert-success">
            Backup file passed validation preview.
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="app-card-tight p-4">
              <div className="text-sm font-semibold">Backup Details</div>
              <div className="mt-2 space-y-1 text-sm text-zinc-400">
                <p>App: {result.backup?.app ?? '—'}</p>
                <p>Type: {result.backup?.type ?? '—'}</p>
                <p>Version: {result.backup?.version ?? '—'}</p>
                <p>Exported At: {result.backup?.exported_at ?? '—'}</p>
              </div>
            </div>

            <div className="app-card-tight p-4">
              <div className="text-sm font-semibold">Summary</div>
              <div className="mt-2 space-y-1 text-sm text-zinc-400">
                <p>
                  Tables Attempted:{' '}
                  {result.summary?.total_tables_attempted ?? 0}
                </p>
                <p>
                  Tables Included:{' '}
                  {result.summary?.total_tables_included ?? 0}
                </p>
                <p>
                  Total Rows Exported:{' '}
                  {result.summary?.total_rows_exported ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="app-section p-5">
            <h3 className="text-lg font-semibold">Restore Preview</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Validation passed. Review table counts before choosing a restore mode.
            </p>

            <div className="mt-4 app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th">Section</th>
                    <th className="app-th">Table</th>
                    <th className="app-th">Included</th>
                    <th className="app-th">Rows</th>
                    <th className="app-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.sections ?? []).map((section) => (
                    <tr key={section.key} className="app-tr">
                      <td className="app-td">{section.key}</td>
                      <td className="app-td">{section.table}</td>
                      <td className="app-td">
                        {section.included ? 'Yes' : 'No'}
                      </td>
                      <td className="app-td">{section.count}</td>
                      <td className="app-td">
                        {section.error ? section.error : 'Validated'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.warnings?.length ? (
            <div className="app-section p-5">
              <h3 className="text-lg font-semibold">Warnings</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-400">
                {result.warnings.map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {restoreResult?.ok ? (
        <div className="space-y-4">
          <div className="app-alert-success">
            {restoreResult.mode === 'merge'
              ? 'Merge restore completed successfully.'
              : 'Replace restore completed successfully.'}
          </div>

          <div className="app-section p-5">
            <h3 className="text-lg font-semibold">Restore Result</h3>
            <div className="mt-3 space-y-2 text-sm text-zinc-400">
              {restoreResult.mode === 'merge' ? (
                <>
                  <p>
                    Inserted Total: {restoreResult.summary?.inserted_total ?? 0}
                  </p>
                  <p>
                    Skipped Existing Total:{' '}
                    {restoreResult.summary?.skipped_existing_total ?? 0}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Deleted Existing Total:{' '}
                    {restoreResult.summary?.deleted_existing_total ?? 0}
                  </p>
                  <p>
                    Inserted Total: {restoreResult.summary?.inserted_total ?? 0}
                  </p>
                </>
              )}
            </div>

            <div className="mt-4 app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th">Section</th>
                    <th className="app-th">Table</th>
                    <th className="app-th">Inserted</th>
                    {restoreResult.mode === 'merge' ? (
                      <th className="app-th">Skipped Existing</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {(restoreResult.tables ?? []).map((tableRow) => (
                    <tr key={tableRow.key} className="app-tr">
                      <td className="app-td">{tableRow.key}</td>
                      <td className="app-td">{tableRow.table}</td>
                      <td className="app-td">{tableRow.inserted}</td>
                      {restoreResult.mode === 'merge' ? (
                        <td className="app-td">
                          {tableRow.skipped_existing ?? 0}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}