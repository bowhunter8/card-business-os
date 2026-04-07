'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

type PreviewRow = {
  rowNumber: number
  orderNumber: string | null
  orderDate: string | null
  itemTitle: string
  buyer: string | null
  quantity: number
  grossSale: number
  shippingCharged: number
  platformFees: number
  postageCost: number
  netProceeds: number
  notes: string
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

export default function EbayImportPage() {
  const [fileName, setFileName] = useState('')
  const [csvText, setCsvText] = useState('')
  const [defaultSuppliesCost, setDefaultSuppliesCost] = useState('0.00')
  const [defaultOtherCosts, setDefaultOtherCosts] = useState('0.00')
  const [platform, setPlatform] = useState('eBay')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [totalRows, setTotalRows] = useState(0)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])

  async function onFileChange(file: File | null) {
    setError('')
    setSuccess('')
    setPreviewRows([])
    setTotalRows(0)

    if (!file) {
      setFileName('')
      setCsvText('')
      return
    }

    setFileName(file.name)
    const text = await file.text()
    setCsvText(text)
  }

  async function previewImport() {
    if (!csvText) {
      setError('Upload an eBay CSV file first.')
      return
    }

    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/imports/ebay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'preview',
          csvText,
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Failed to preview import')
      }

      setPreviewRows(Array.isArray(json.rows) ? json.rows : [])
      setTotalRows(Number(json.totalRows ?? 0))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview import')
      setPreviewRows([])
      setTotalRows(0)
    } finally {
      setLoading(false)
    }
  }

  async function runImport() {
    if (!csvText) {
      setError('Upload an eBay CSV file first.')
      return
    }

    try {
      setImporting(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/imports/ebay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'import',
          csvText,
          defaultSuppliesCost,
          defaultOtherCosts,
          platform,
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Import failed')
      }

      setSuccess(
        `Imported ${json.imported} sale(s) successfully using ${json.mode}.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const previewTotals = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.grossSale += Number(row.grossSale || 0)
        acc.shippingCharged += Number(row.shippingCharged || 0)
        acc.platformFees += Number(row.platformFees || 0)
        acc.postageCost += Number(row.postageCost || 0)
        acc.netProceeds += Number(row.netProceeds || 0)
        return acc
      },
      {
        grossSale: 0,
        shippingCharged: 0,
        platformFees: 0,
        postageCost: 0,
        netProceeds: 0,
      }
    )
  }, [previewRows])

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">eBay Import</h1>
          <p className="mt-2 text-zinc-400">
            Upload an eBay CSV export, preview it, then import the rows into your sales table.
          </p>
        </div>

        <Link
          href="/app"
          className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          Back
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <div>
            <div className="text-lg font-semibold">Import Settings</div>
            <p className="mt-1 text-sm text-zinc-400">
              Good default starting point: set supplies cost if you want every imported eBay sale to include a packaging estimate.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"
            />
            {fileName ? (
              <p className="mt-2 text-xs text-zinc-400">Loaded: {fileName}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Platform</label>
            <input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Default Supplies Cost</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultSuppliesCost}
              onChange={(e) => setDefaultSuppliesCost(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Default Other Costs</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultOtherCosts}
              onChange={(e) => setDefaultOtherCosts(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={previewImport}
              disabled={loading || importing}
              className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? 'Previewing...' : 'Preview CSV'}
            </button>

            <button
              type="button"
              onClick={runImport}
              disabled={loading || importing || previewRows.length === 0}
              className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import Sales'}
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
            <div className="font-medium text-zinc-200">What maps automatically</div>
            <div className="mt-2 space-y-1">
              <p>Sale price → gross sale</p>
              <p>Shipping paid by buyer → shipping charged</p>
              <p>eBay fees columns → platform fees</p>
              <p>Shipping label/postage columns → actual postage cost</p>
              <p>Order, buyer, item title, item ID, SKU → notes</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Preview</div>
              <p className="mt-1 text-sm text-zinc-400">
                Showing up to 50 rows before import.
              </p>
            </div>

            <div className="text-sm text-zinc-400">
              Total rows detected: <span className="text-white">{totalRows}</span>
            </div>
          </div>

          {previewRows.length === 0 ? (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
              Upload a CSV and click Preview CSV.
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 md:grid-cols-5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-400">Gross Sale</div>
                  <div className="mt-1 text-lg font-semibold">
                    {money(previewTotals.grossSale)}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-400">Shipping Charged</div>
                  <div className="mt-1 text-lg font-semibold">
                    {money(previewTotals.shippingCharged)}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-400">Platform Fees</div>
                  <div className="mt-1 text-lg font-semibold">
                    {money(previewTotals.platformFees)}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-400">Postage Cost</div>
                  <div className="mt-1 text-lg font-semibold">
                    {money(previewTotals.postageCost)}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-400">Net Proceeds</div>
                  <div className="mt-1 text-lg font-semibold">
                    {money(previewTotals.netProceeds)}
                  </div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-950 text-zinc-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Order</th>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-left">Buyer</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Sale</th>
                      <th className="px-3 py-2 text-right">Ship Charged</th>
                      <th className="px-3 py-2 text-right">Fees</th>
                      <th className="px-3 py-2 text-right">Postage</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.orderNumber ?? row.itemTitle}`} className="border-t border-zinc-800">
                        <td className="px-3 py-2 text-zinc-400">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.orderDate ?? '—'}</td>
                        <td className="px-3 py-2">{row.orderNumber ?? '—'}</td>
                        <td className="px-3 py-2 min-w-[280px]">{row.itemTitle}</td>
                        <td className="px-3 py-2">{row.buyer ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{row.quantity}</td>
                        <td className="px-3 py-2 text-right">{money(row.grossSale)}</td>
                        <td className="px-3 py-2 text-right">{money(row.shippingCharged)}</td>
                        <td className="px-3 py-2 text-right">{money(row.platformFees)}</td>
                        <td className="px-3 py-2 text-right">{money(row.postageCost)}</td>
                        <td className="px-3 py-2 text-right">{money(row.netProceeds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}