'use client'

import { useState } from 'react'

export default function BackupExportButton() {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    if (loading) return

    try {
      setLoading(true)

      const res = await fetch('/api/backup/export')

      if (!res.ok) {
        throw new Error('Export failed')
      }

      const blob = await res.blob()

      // ✅ Get filename from server
      const contentDisposition = res.headers.get('content-disposition')
      let fileName = 'card-business-os-backup.json'

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/)
        if (match) fileName = match[1]
      }

      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()

      window.URL.revokeObjectURL(url)

      alert('Backup downloaded successfully')
    } catch (err) {
      console.error(err)
      alert('Backup export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="app-button-primary"
      >
        {loading ? 'Exporting Backup...' : 'Export Full Backup'}
      </button>
    </div>
  )
}