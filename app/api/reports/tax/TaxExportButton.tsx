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

function formatLockedMessage(preflight: TaxExportPreflight) {
  if (!preflight.locked) return ''

  const lockedAt = preflight.endingInventoryLockedAt
    ? new Date(preflight.endingInventoryLockedAt).toLocaleString()
    : 'saved lock'

  const amount =
    preflight.endingInventorySnapshot == null
      ? 'locked ending inventory'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(Number(preflight.endingInventorySnapshot ?? 0))

  return `Ending inventory is locked at ${amount} (${lockedAt}).`
}

export default function TaxExportButton({ year }: { year: number }) {
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    if (isExporting) return

    try {
      setIsExporting(true)

      const preflight = await checkTaxYearExportReadiness(year)

      if (!preflight.ok) {
        const proceed = window.confirm(
          `Tax export readiness could not be verified for ${year}.\n\n${preflight.message || ''}\n\nExport anyway?`
        )

        if (!proceed) return
      }

      if (preflight.ok && !preflight.locked) {
        const proceed = window.confirm(
          `Ending inventory is NOT locked for ${year}.\n\nIf you export now, the report will use live inventory and the tax numbers may change later if inventory changes.\n\nRecommended: go to Settings → Tax Year Settings and lock the ending inventory snapshot before filing or sending final numbers to a CPA.\n\nExport anyway?`
        )

        if (!proceed) return
      }

      const response = await fetch(`/api/reports/tax/export?year=${year}`)

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `tax-report-${year}.xls`
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(url)

      if (preflight.locked) {
        console.info(formatLockedMessage(preflight))
      }
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
      className="app-button-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isExporting ? 'Exporting...' : 'Export Tax Workbook'}
    </button>
  )
}
