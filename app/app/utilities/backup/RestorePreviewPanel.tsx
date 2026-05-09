'use client'

import { useEffect, useState } from 'react'

type ValidationResult = {
  ok: boolean
  backup?: {
    app: string
    type: string
    version: number
    exported_at: string | null
    user_id: string | null
    file_name?: string | null
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

type RestorePoint = {
  id: string
  created_at: string | null
  backup_name: string | null
  backup_type: string | null
  backup_summary?: Record<string, unknown> | null
  total_records?: number | null
  backup_size_bytes?: number | null
}

type RestoreSource = 'restore_point' | 'backup_file'

type RestorePreviewPanelProps = {
  allowedSources?: RestoreSource[]
  defaultSource?: RestoreSource
}

function formatBackupDate(value: string | null | undefined) {
  if (!value) return 'Unknown date'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function isAllowedSource(
  source: RestoreSource,
  allowedSources: RestoreSource[]
) {
  return allowedSources.includes(source)
}

export default function RestorePreviewPanel({
  allowedSources = ['restore_point', 'backup_file'],
  defaultSource = 'restore_point',
}: RestorePreviewPanelProps) {
  const startingSource = isAllowedSource(defaultSource, allowedSources)
    ? defaultSource
    : allowedSources[0] ?? 'restore_point'

  const [restoreSource, setRestoreSource] =
    useState<RestoreSource>(startingSource)
  const [restorePoints, setRestorePoints] = useState<RestorePoint[]>([])
  const [selectedRestorePointId, setSelectedRestorePointId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [isLoadingPoints, setIsLoadingPoints] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  const selectedRestorePoint =
    restorePoints.find((point) => point.id === selectedRestorePointId) ?? null

  const canShowSourcePicker = allowedSources.length > 1
  const canUseRestorePoint = isAllowedSource('restore_point', allowedSources)
  const canUseBackupFile = isAllowedSource('backup_file', allowedSources)

  useEffect(() => {
    const nextSource = isAllowedSource(defaultSource, allowedSources)
      ? defaultSource
      : allowedSources[0] ?? 'restore_point'

    setRestoreSource(nextSource)
  }, [allowedSources, defaultSource])

  useEffect(() => {
    if (canUseRestorePoint) {
      void loadRestorePoints()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseRestorePoint])

  async function loadRestorePoints() {
    try {
      setIsLoadingPoints(true)
      setError('')

      const response = await fetch(
        '/api/utilities/backup/list-restore-points?limit=25',
        {
          method: 'GET',
        }
      )

      const json = await response.json()

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || 'Restore points could not be loaded.')
      }

      const points = (json.restorePoints ?? []) as RestorePoint[]
      setRestorePoints(points)

      if (!selectedRestorePointId && points.length > 0) {
        setSelectedRestorePointId(points[0].id)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Restore points could not be loaded.'
      )
    } finally {
      setIsLoadingPoints(false)
    }
  }

  async function validateBackupText({
    backupText,
    sourceName,
  }: {
    backupText: string
    sourceName: string
  }) {
    const response = await fetch('/api/utilities/backup/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: sourceName,
        backupText,
      }),
    })

    const json = await response.json()

    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || 'Backup check failed')
    }

    return json as ValidationResult
  }

  async function validateBackupFile(file: File) {
    try {
      setIsChecking(true)
      setStatusMessage('Checking backup file...')
      setError('')
      setResult(null)
      setRestoreResult(null)

      const text = await file.text()
      const validation = await validateBackupText({
        backupText: text,
        sourceName: file.name,
      })

      setResult(validation)
      setStatusMessage('Backup file is ready to restore.')
    } catch (err) {
      setStatusMessage('')
      setError(err instanceof Error ? err.message : 'Backup check failed')
    } finally {
      setIsChecking(false)
    }
  }

  async function onFileChange(file: File | null) {
    setSelectedFile(file)
    setFileName(file?.name ?? '')
    setError('')
    setResult(null)
    setRestoreResult(null)
    setStatusMessage('')

    if (file) {
      await validateBackupFile(file)
    }
  }

  async function getBackupTextForRestore() {
    if (restoreSource === 'backup_file') {
      if (!selectedFile) {
        throw new Error('Choose a backup file first.')
      }

      return selectedFile.text()
    }

    if (!selectedRestorePointId) {
      throw new Error('Choose a restore point first.')
    }

    const response = await fetch(
      `/api/utilities/backup/get-restore-point?id=${encodeURIComponent(
        selectedRestorePointId
      )}`,
      {
        method: 'GET',
      }
    )

    const json = await response.json()

    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || 'Restore point could not be loaded.')
    }

    const backupJson = json.restorePoint?.backup_json

    if (!backupJson) {
      throw new Error('Restore point is missing backup data.')
    }

    return JSON.stringify(backupJson)
  }

  async function handleRestore() {
    if (isRestoring || isChecking) return

    if (restoreSource === 'restore_point' && !selectedRestorePointId) return
    if (restoreSource === 'backup_file' && (!selectedFile || !result?.ok)) return

    const restoreLabel =
      restoreSource === 'restore_point'
        ? selectedRestorePoint?.backup_name || 'this restore point'
        : fileName || 'this backup file'

    const confirmed = window.confirm(
      `Restore from ${restoreLabel}? This will update the app data to match the selected point.`
    )

    if (!confirmed) return

    try {
      setIsRestoring(true)
      setError('')
      setRestoreResult(null)
      setStatusMessage('Creating safety restore point...')

      await fetch('/api/utilities/backup/create-restore-point', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupType: 'before_restore',
        }),
      }).catch(() => {
        // Do not block restore if emergency restore point creation fails.
      })

      setStatusMessage('Loading restore data...')
      const backupText = await getBackupTextForRestore()

      setStatusMessage('Checking restore data...')
      const validation = await validateBackupText({
        backupText,
        sourceName: restoreLabel,
      })

      setResult(validation)
      setStatusMessage('Restoring app data...')

      const response = await fetch('/api/utilities/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupText,
          mode: 'replace',
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
      setStatusMessage('Restore complete.')
      localStorage.setItem('last_restore_date', new Date().toISOString())

      if (canUseRestorePoint) {
        await loadRestorePoints()
      }
    } catch (err) {
      setStatusMessage('')
      setError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="space-y-4">
      {canShowSourcePicker ? (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setRestoreSource('restore_point')
              setError('')
              setRestoreResult(null)
              setStatusMessage('')
            }}
            className={
              restoreSource === 'restore_point'
                ? 'app-button-primary justify-center'
                : 'app-button justify-center'
            }
            disabled={isRestoring || !canUseRestorePoint}
          >
            Restore Point
          </button>

          <button
            type="button"
            onClick={() => {
              setRestoreSource('backup_file')
              setError('')
              setRestoreResult(null)
              setStatusMessage('')
            }}
            className={
              restoreSource === 'backup_file'
                ? 'app-button-primary justify-center'
                : 'app-button justify-center'
            }
            disabled={isRestoring || !canUseBackupFile}
          >
            Backup File
          </button>
        </div>
      ) : null}

      {restoreSource === 'restore_point' && canUseRestorePoint ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Select restore point
              </span>

              <select
                value={selectedRestorePointId}
                onChange={(event) => {
                  setSelectedRestorePointId(event.target.value)
                  setRestoreResult(null)
                  setError('')
                  setStatusMessage('')
                }}
                disabled={
                  isLoadingPoints || isRestoring || restorePoints.length === 0
                }
                className="app-select"
              >
                {restorePoints.length === 0 ? (
                  <option value="">No restore points yet</option>
                ) : null}

                {restorePoints.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.backup_name || 'Restore Point'} —{' '}
                    {formatBackupDate(point.created_at)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadRestorePoints()}
              disabled={isLoadingPoints || isRestoring}
              className="app-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingPoints ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {selectedRestorePoint ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-sm text-emerald-100">
              Selected restore point:{' '}
              <span className="font-semibold">
                {selectedRestorePoint.backup_name || 'Restore Point'}
              </span>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-100">
              No restore points found yet. Use Create Restore Point first.
            </div>
          )}
        </div>
      ) : null}

      {restoreSource === 'backup_file' && canUseBackupFile ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">
              Select backup file
            </label>

            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"
              disabled={isRestoring}
            />

            <p className="mt-2 text-xs text-zinc-500">
              Choose a full backup JSON file that was downloaded from HITS.
            </p>
          </div>

          {result?.ok && !isRestoring ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-sm text-emerald-100">
              Backup file ready:{' '}
              <span className="font-semibold">
                {fileName || 'Selected backup'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {isChecking || isRestoring || statusMessage ? (
        <div className="rounded-2xl border border-blue-500/40 bg-blue-950/20 p-4 text-sm text-blue-100">
          <div className="flex items-start gap-3">
            {isChecking || isRestoring ? (
              <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
            ) : (
              <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-blue-300 text-[10px] font-bold">
                ✓
              </div>
            )}

            <div>
              <div className="font-semibold">
                {statusMessage || 'Ready'}
              </div>

              {isChecking || isRestoring ? (
                <p className="mt-1 text-blue-100/80">
                  HITS is handling the safety checks in the background.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="app-alert-error">{error}</div> : null}

      <button
        type="button"
        onClick={handleRestore}
        disabled={
          isRestoring ||
          isChecking ||
          (restoreSource === 'restore_point' && !selectedRestorePointId) ||
          (restoreSource === 'backup_file' && (!selectedFile || !result?.ok))
        }
        className="app-button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRestoring ? 'Restoring...' : 'Restore App to This Point'}
      </button>

      {restoreResult?.ok ? (
        <div className="app-alert-success">
          App restored successfully.
        </div>
      ) : null}
    </div>
  )
}
