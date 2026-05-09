'use client'

import { useState } from 'react'

export default function BackupExportButton() {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleExport() {
    if (isExporting) return

    try {
      setIsExporting(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/utilities/backup/export', {
        method: 'GET',
      })

      if (!response.ok) {
        let message = 'Backup export failed'

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
        `card-business-backup-${new Date().toISOString().slice(0, 10)}.json`

      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      localStorage.setItem('last_backup_date', new Date().toISOString())

      setSuccess('Backup created successfully. Keep the downloaded file somewhere safe.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? 'Creating Backup...' : 'Backup Now'}
      </button>

      {isExporting ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
            <div>
              <div className="font-semibold">Creating backup...</div>
              <p className="mt-1 text-amber-100/80">
                Please wait and do not close this page.
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
