'use client'

import { useState } from 'react'

type TaxExportPreflight = {
  ok: boolean
  locked: boolean
  year?: number
  endingInventorySnapshot?: number | null
  endingInventoryItemCount?: number | null
  endingInventoryLockedAt?: string | null
  message?: string
}

async function checkTaxYearExportReadiness(year: number): Promise<TaxExportPreflight> {
  const response = await fetch(`/api/reports/tax/preflight?year=${year}`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    return {
      ok: false,
      locked: false,
      message: `Could not verify tax year lock status. Status ${response.status}.`,
    }
  }

  return (await response.json()) as TaxExportPreflight
}

export default function TaxPdfExportButton({ year }: { year: number }) {
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    if (isExporting) return

    try {
      setIsExporting(true)

      const preflight = await checkTaxYearExportReadiness(year)

      if (!preflight.ok) {
        const proceed = window.confirm(
          `Tax PDF readiness could not be verified for ${year}.\n\n${preflight.message || ''}\n\nExport anyway?`
        )

        if (!proceed) return
      }

      if (preflight.ok && !preflight.locked) {
        const proceed = window.confirm(
          `Ending inventory is NOT locked for ${year}.\n\nIf you export this PDF now, the report will use live inventory and the tax numbers may change later if inventory changes.\n\nRecommended: go to Settings → Tax Year Settings and lock the ending inventory snapshot before filing or sending final numbers to a CPA.\n\nExport PDF anyway?`
        )

        if (!proceed) return
      }

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
      window.alert('PDF export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isExporting}
      className="app-button disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isExporting ? 'Exporting PDF...' : 'Export Tax PDF Summary'}
    </button>
  )
}
