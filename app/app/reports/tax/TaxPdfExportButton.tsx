'use client'

import { useState } from 'react'

export default function TaxPdfExportButton({ year }: { year: number }) {
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    if (isExporting) return

    try {
      setIsExporting(true)

      const response = await fetch(`/api/reports/tax/pdf?year=${year}`)

      if (!response.ok) {
        throw new Error(`PDF export failed with status ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `tax-summary-${year}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      alert('PDF export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isExporting}
      className="app-button"
    >
      {isExporting ? 'Exporting PDF...' : 'Export Tax PDF Summary'}
    </button>
  )
}