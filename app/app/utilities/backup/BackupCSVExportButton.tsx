'use client'

import { useState } from 'react'

export default function BackupCSVExportButton() {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleExport() {
    if (isExporting) return

    try {
      setIsExporting(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/utilities/backup/export-csv', {
        method: 'GET',
      })

      if (!response.ok) {
        let message = 'CSV export failed'

        try {
          const json = await response.json()
          message = json?.error || message
        } catch {
          // ignore JSON parse failure
        }

        throw new Error(message)
      }

      const data = await response.json()

      Object.entries(data.files ?? {}).forEach(([fileName, csv]) => {
        const blob = new Blob([String(csv ?? '')], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()

        window.URL.revokeObjectURL(url)
      })

      setSuccess('CSV export downloaded successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed')
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
        className="app-button disabled:opacity-50"
      >
        {isExporting ? 'Exporting CSV...' : 'Export CSV for QuickBooks / CPA'}
      </button>

      {error ? <div className="app-alert-error">{error}</div> : null}
      {success ? <div className="app-alert-success">{success}</div> : null}
    </div>
  )
}