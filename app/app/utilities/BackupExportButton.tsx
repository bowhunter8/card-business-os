'use client'

import { useState } from 'react'

type ActionState = 'idle' | 'creating' | 'downloading'

export default function BackupExportButton() {
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isBusy = actionState !== 'idle'

  async function createRestorePoint() {
    if (isBusy) return

    try {
      setActionState('creating')
      setError('')
      setSuccess('')

      const response = await fetch('/api/utilities/backup/create-restore-point', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupType: 'manual',
        }),
      })

      const json = await response.json()

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || 'Restore point could not be created.')
      }

      localStorage.setItem('last_backup_date', new Date().toISOString())

      setSuccess(
        'Restore point created successfully. You can use it later to return the app to this point.'
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Restore point could not be created.'
      )
    } finally {
      setActionState('idle')
    }
  }

  async function downloadFullBackup() {
    if (isBusy) return

    try {
      setActionState('downloading')
      setError('')
      setSuccess('')

      const response = await fetch('/api/utilities/backup/export', {
        method: 'GET',
      })

      if (!response.ok) {
        let message = 'Backup download failed'

        try {
          const json = await response.json()
          message = json?.error || message
        } catch {
          // ignore JSON parse failure
        }

        throw new Error(message)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const contentDisposition = response.headers.get('Content-Disposition') || ''
      const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
      const fileName =
        fileNameMatch?.[1] ||
        `hits-backup-${new Date().toISOString().slice(0, 10)}.json`

      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(url)

      localStorage.setItem('last_backup_date', new Date().toISOString())

      setSuccess(
        'Backup file downloaded successfully. Keep the file somewhere safe.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup download failed')
    } finally {
      setActionState('idle')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
        <button
          type="button"
          onClick={createRestorePoint}
          disabled={isBusy}
          className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionState === 'creating' ? 'Creating Restore Point...' : 'Create Restore Point'}
        </button>

        <button
          type="button"
          onClick={downloadFullBackup}
          disabled={isBusy}
          className="app-button disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionState === 'downloading' ? 'Downloading Backup...' : 'Download Backup File'}
        </button>
      </div>

      {actionState === 'creating' ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
            <div>
              <div className="font-semibold">Creating restore point...</div>
              <p className="mt-1 text-emerald-100/80">
                Please wait while HITS saves a full recovery point in the app.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {actionState === 'downloading' ? (
        <div className="rounded-2xl border border-blue-500/40 bg-blue-950/20 p-4 text-sm text-blue-100">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
            <div>
              <div className="font-semibold">Downloading backup file...</div>
              <p className="mt-1 text-blue-100/80">
                Please wait and keep the downloaded backup file somewhere safe.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="app-alert-error">{error}</div> : null}
      {success ? <div className="app-alert-success">{success}</div> : null}
    </div>
  )
}
