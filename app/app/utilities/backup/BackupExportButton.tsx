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

      setSuccess('Full backup exported successfully.')
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
        className="app-button-primary disabled:opacity-50"
      >
        {isExporting ? 'Exporting Backup...' : 'Export Full Backup'}
      </button>

      {error ? <div className="app-alert-error">{error}</div> : null}
      {success ? <div className="app-alert-success">{success}</div> : null}
    </div>
  )
}