'use client'

import { useState } from 'react'

export default function TaxExportButton({ year }: { year: number }) {
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    if (isExporting) return

    try {
      setIsExporting(true)

      const response = await fetch(`/api/reports/tax/export?year=${year}`)

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `tax-report-${year}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      window.alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isExporting}
      className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isExporting ? 'Exporting...' : 'Export CSV'}
    </button>
  )
}