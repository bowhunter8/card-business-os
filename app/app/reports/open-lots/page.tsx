import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>

type InventoryRow = Record<string, unknown>
type SaleRow = Record<string, unknown>

type OpenLotRow = {
  id: string
  itemName: string
  player: string
  brand: string
  setName: string
  year: string
  status: string
  storageLocation: string
  acquiredDate: string
  ageDays: number | null
  originalQuantity: number
  soldQuantity: number
  remainingQuantity: number
  originalCost: number
  realizedCost: number
  remainingCost: number
  estimatedValue: number
  notes: string
}

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open / Available Lots' },
  { value: 'all', label: 'All Lot Statuses' },
  { value: 'available', label: 'Available' },
  { value: 'listed', label: 'Listed' },
  { value: 'junk', label: 'Junk' },
  { value: 'personal', label: 'Personal Collection' },
]

function getStringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  fallback = '',
) {
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? fallback
  return value ?? fallback
}

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,]/g, '').trim()
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}

function getText(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function getFirstText(row: InventoryRow, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = row[key]
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value)
    }
  }

  return fallback
}

function getFirstNumber(row: InventoryRow | SaleRow, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key]
    const parsed = getNumber(value, Number.NaN)
    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}

function getFirstDate(row: InventoryRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (!value) continue

    const parsed = new Date(String(value))
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return null
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(value) ? value : 0)
}

function formatDate(value: string) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function buildDateRange(period: string, start: string, end: string) {
  const now = new Date()
  const rangeEnd = new Date(now)
  rangeEnd.setHours(23, 59, 59, 999)

  const rangeStart = new Date(now)
  rangeStart.setHours(0, 0, 0, 0)

  if (period === 'daily') {
    return { startDate: rangeStart, endDate: rangeEnd }
  }

  if (period === 'weekly') {
    const day = rangeStart.getDay()
    const diff = day === 0 ? 6 : day - 1
    rangeStart.setDate(rangeStart.getDate() - diff)
    return { startDate: rangeStart, endDate: rangeEnd }
  }

  if (period === 'monthly') {
    rangeStart.setDate(1)
    return { startDate: rangeStart, endDate: rangeEnd }
  }

  if (period === 'quarterly') {
    const month = rangeStart.getMonth()
    const quarterStartMonth = Math.floor(month / 3) * 3
    rangeStart.setMonth(quarterStartMonth, 1)
    return { startDate: rangeStart, endDate: rangeEnd }
  }

  if (period === 'yearly') {
    rangeStart.setMonth(0, 1)
    return { startDate: rangeStart, endDate: rangeEnd }
  }

  if (period === 'custom') {
    const customStart = start ? new Date(`${start}T00:00:00`) : null
    const customEnd = end ? new Date(`${end}T23:59:59`) : null

    return {
      startDate:
        customStart && !Number.isNaN(customStart.getTime()) ? customStart : null,
      endDate: customEnd && !Number.isNaN(customEnd.getTime()) ? customEnd : null,
    }
  }

  return { startDate: null, endDate: null }
}

function dateToInputValue(date: Date | null) {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function getInventoryId(row: InventoryRow) {
  return getFirstText(row, ['id', 'inventory_item_id', 'item_id'])
}

function getSaleInventoryId(row: SaleRow) {
  return getFirstText(row, [
    'inventory_item_id',
    'item_id',
    'inventory_id',
    'card_id',
  ])
}

function buildOpenLotRows(inventoryRows: InventoryRow[], saleRows: SaleRow[]) {
  const soldByInventoryId = new Map<string, number>()
  const realizedCostByInventoryId = new Map<string, number>()

  for (const sale of saleRows) {
    const inventoryId = getSaleInventoryId(sale)
    if (!inventoryId) continue

    const soldQuantity = Math.max(
      getFirstNumber(sale, ['quantity', 'quantity_sold', 'qty'], 1),
      1,
    )

    const realizedCost = getFirstNumber(
      sale,
      [
        'cost_basis',
        'realized_cost',
        'cogs',
        'allocated_cost',
        'item_cost',
        'purchase_cost',
      ],
      0,
    )

    soldByInventoryId.set(
      inventoryId,
      (soldByInventoryId.get(inventoryId) ?? 0) + soldQuantity,
    )

    realizedCostByInventoryId.set(
      inventoryId,
      (realizedCostByInventoryId.get(inventoryId) ?? 0) + realizedCost,
    )
  }

  const today = new Date()

  return inventoryRows
    .map((item): OpenLotRow | null => {
      const id = getInventoryId(item)
      if (!id) return null

      const status = getFirstText(item, ['status'], 'available').toLowerCase()
      const originalQuantity = Math.max(
        getFirstNumber(item, ['quantity', 'qty', 'total_quantity'], 1),
        1,
      )

      const rowSoldQuantity = getFirstNumber(
        item,
        ['quantity_sold', 'sold_quantity', 'sold_qty'],
        0,
      )

      const soldQuantity = Math.max(
        soldByInventoryId.get(id) ?? rowSoldQuantity,
        rowSoldQuantity,
        0,
      )

      const explicitRemainingQuantity = getFirstNumber(
        item,
        ['remaining_quantity', 'quantity_remaining', 'remaining_qty'],
        Number.NaN,
      )

      const remainingQuantity = Number.isFinite(explicitRemainingQuantity)
        ? Math.max(explicitRemainingQuantity, 0)
        : Math.max(originalQuantity - soldQuantity, 0)

      const originalCost = getFirstNumber(
        item,
        [
          'total_cost',
          'cost_basis_total',
          'cost_basis',
          'purchase_price',
          'purchase_cost',
          'amount_paid',
          'price_paid',
        ],
        0,
      )

      const realizedCostFromSales = realizedCostByInventoryId.get(id) ?? 0
      const averageUnitCost =
        originalQuantity > 0 ? originalCost / originalQuantity : 0

      const realizedCost =
        realizedCostFromSales > 0
          ? realizedCostFromSales
          : Math.min(originalCost, soldQuantity * averageUnitCost)

      const explicitRemainingCost = getFirstNumber(
        item,
        ['remaining_cost', 'remaining_cost_basis'],
        Number.NaN,
      )

      const remainingCost = Number.isFinite(explicitRemainingCost)
        ? Math.max(explicitRemainingCost, 0)
        : Math.max(originalCost - realizedCost, 0)

      const acquiredAt = getFirstDate(item, [
        'acquired_at',
        'purchase_date',
        'date_acquired',
        'created_at',
      ])

      const ageDays = acquiredAt
        ? Math.max(
            Math.floor(
              (today.getTime() - acquiredAt.getTime()) / (1000 * 60 * 60 * 24),
            ),
            0,
          )
        : null

      return {
        id,
        itemName: getFirstText(
          item,
          ['item_name', 'name', 'title', 'card_name', 'description'],
          'Unnamed lot',
        ),
        player: getFirstText(item, ['player', 'player_name', 'athlete'], '—'),
        brand: getFirstText(item, ['brand', 'manufacturer'], '—'),
        setName: getFirstText(item, ['set_name', 'set', 'product_set'], '—'),
        year: getText(item.year, '—'),
        status,
        storageLocation: getFirstText(
          item,
          ['storage_location', 'location', 'box', 'bin'],
          '—',
        ),
        acquiredDate: acquiredAt ? acquiredAt.toISOString() : '',
        ageDays,
        originalQuantity,
        soldQuantity,
        remainingQuantity,
        originalCost,
        realizedCost,
        remainingCost,
        estimatedValue: getFirstNumber(
          item,
          ['estimated_value', 'market_value', 'current_value', 'opg_value'],
          0,
        ),
        notes: getFirstText(item, ['notes', 'note'], ''),
      }
    })
    .filter((row): row is OpenLotRow => Boolean(row))
}

function buildQueryString(params: Record<string, string>) {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }

  const value = search.toString()
  return value ? `?${value}` : ''
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <div className="app-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-100">{value}</div>
      {helper ? (
        <div className="mt-1 text-xs leading-5 text-zinc-400">{helper}</div>
      ) : null}
    </div>
  )
}

export default async function OpenLotsReportPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput
}) {
  const resolvedParams = searchParams ? await searchParams : {}

  const period = getStringParam(resolvedParams, 'period', 'all')
  const start = getStringParam(resolvedParams, 'start', '')
  const end = getStringParam(resolvedParams, 'end', '')
  const query = getStringParam(resolvedParams, 'q', '').trim()
  const status = getStringParam(resolvedParams, 'status', 'open')
  const staleDaysRaw = getStringParam(resolvedParams, 'staleDays', '90')
  const staleDays = Math.max(Number(staleDaysRaw) || 90, 1)

  const { startDate, endDate } = buildDateRange(period, start, end)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let inventoryRows: InventoryRow[] = []
  let saleRows: SaleRow[] = []
  let inventoryError = ''
  let salesError = ''

  if (user) {
    const inventoryResult = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (inventoryResult.error) {
      inventoryError = inventoryResult.error.message
    } else {
      inventoryRows = (inventoryResult.data ?? []) as InventoryRow[]
    }

    const salesResult = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', user.id)

    if (salesResult.error) {
      salesError = salesResult.error.message
    } else {
      saleRows = (salesResult.data ?? []) as SaleRow[]
    }
  }

  let rows = buildOpenLotRows(inventoryRows, saleRows)

  rows = rows.filter((row) => {
    const isLot = row.originalQuantity > 1
    const hasRemainingInventory = row.remainingQuantity > 0
    const isFinalClosedStatus = ['sold', 'disposed', 'archived'].includes(
      row.status,
    )

    if (!isLot || !hasRemainingInventory || isFinalClosedStatus) return false

    if (status !== 'all') {
      if (status === 'open') {
        if (
          ['sold', 'disposed', 'archived'].includes(row.status) ||
          row.remainingQuantity <= 0
        ) {
          return false
        }
      } else if (row.status !== status) {
        return false
      }
    }

    if (startDate || endDate) {
      const acquired = row.acquiredDate ? new Date(row.acquiredDate) : null

      if (!acquired || Number.isNaN(acquired.getTime())) return false
      if (startDate && acquired < startDate) return false
      if (endDate && acquired > endDate) return false
    }

    if (query) {
      const haystack = [
        row.itemName,
        row.player,
        row.brand,
        row.setName,
        row.year,
        row.status,
        row.storageLocation,
        row.notes,
      ]
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(query.toLowerCase())) return false
    }

    return true
  })

  const staleRows = rows.filter((row) => (row.ageDays ?? 0) >= staleDays)
  const partialRows = rows.filter((row) => row.soldQuantity > 0)
  const totalRemainingQuantity = rows.reduce(
    (total, row) => total + row.remainingQuantity,
    0,
  )
  const totalRemainingCost = rows.reduce(
    (total, row) => total + row.remainingCost,
    0,
  )
  const totalEstimatedValue = rows.reduce(
    (total, row) => total + row.estimatedValue,
    0,
  )

  const currentQuery = buildQueryString({
    period,
    start,
    end,
    q: query,
    status,
    staleDays: String(staleDays),
  })

  const csvHref = `/api/reports/open-lots/csv${currentQuery}`
  const pdfHref = `/api/reports/open-lots/pdf${currentQuery}`

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header gap-4">
        <div>
          <h1 className="app-title">Open Lots Report</h1>
          <p className="app-subtitle">
            Review partial lots, remaining quantity, remaining cost basis, stale
            inventory, and unsold lot aging. This page is read-only and built for
            inventory cleanup, CPA review, and future report exports.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app/reports" className="app-button">
            Back to Report Center
          </Link>

          <Link href="/app/reports/inventory" className="app-button">
            Inventory Reports
          </Link>
        </div>
      </div>

      <form action="/app/reports/open-lots" className="app-section p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Search Lots
            </span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Player, set, brand, notes, location..."
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Period
            </span>
            <select
              name="period"
              defaultValue={period}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Status
            </span>
            <select
              name="status"
              defaultValue={status}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Stale After
            </span>
            <input
              name="staleDays"
              type="number"
              min="1"
              defaultValue={staleDays}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
            />
          </label>

          <div className="flex items-end gap-2">
            <button type="submit" className="app-button-primary whitespace-nowrap">
              Search
            </button>

            <Link href="/app/reports/open-lots" className="app-button">
              Reset
            </Link>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Custom Start
            </span>
            <input
              name="start"
              type="date"
              defaultValue={
                period === 'custom' ? start : dateToInputValue(startDate)
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Custom End
            </span>
            <input
              name="end"
              type="date"
              defaultValue={period === 'custom' ? end : dateToInputValue(endDate)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
            />
          </label>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Open Lots"
          value={String(rows.length)}
          helper="Lots with remaining inventory"
        />
        <SummaryCard
          label="Partial Lots"
          value={String(partialRows.length)}
          helper="Lots with at least one sold unit"
        />
        <SummaryCard
          label="Remaining Qty"
          value={String(totalRemainingQuantity)}
          helper="Unsold units still open"
        />
        <SummaryCard
          label="Remaining Cost"
          value={money(totalRemainingCost)}
          helper="Estimated remaining basis"
        />
        <SummaryCard
          label="Stale Lots"
          value={String(staleRows.length)}
          helper={`${staleDays}+ days old`}
        />
      </div>

      <div className="app-section p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Open Lot Detail
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Use this to find lots that still have unsold quantity, remaining
              cost basis, or stale inventory that may need cleanup.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href={csvHref} className="app-button">
              Export CSV
            </a>
            <a href={pdfHref} className="app-button">
              Export PDF
            </a>
            <a href={pdfHref} className="app-button">
              Printable
            </a>
          </div>
        </div>

        {inventoryError || salesError ? (
          <div className="mt-4 rounded-2xl border border-amber-900 bg-amber-950/30 p-4 text-sm leading-6 text-amber-200">
            <div className="font-semibold">Report warning</div>
            {inventoryError ? <div>Inventory: {inventoryError}</div> : null}
            {salesError ? <div>Sales: {salesError}</div> : null}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-800 text-sm">
            <thead className="bg-zinc-950/80 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Item / Lot</th>
                <th className="px-3 py-3 font-semibold">Set</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">
                  Original Qty
                </th>
                <th className="px-3 py-3 text-right font-semibold">Sold</th>
                <th className="px-3 py-3 text-right font-semibold">
                  Remaining
                </th>
                <th className="px-3 py-3 text-right font-semibold">
                  Remaining Cost
                </th>
                <th className="px-3 py-3 font-semibold">Age</th>
                <th className="px-3 py-3 font-semibold">Location</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-sm text-zinc-400"
                  >
                    No open lots found for the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="bg-black/10">
                    <td className="max-w-[320px] px-3 py-3 align-top">
                      <div className="font-semibold text-zinc-100">
                        {row.itemName}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {row.player}
                      </div>
                      {row.notes ? (
                        <div className="mt-1 text-xs leading-5 text-zinc-500">
                          {row.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-300">
                      <div>{row.year}</div>
                      <div className="text-xs text-zinc-500">{row.brand}</div>
                      <div className="text-xs text-zinc-500">{row.setName}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-semibold capitalize text-zinc-300">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-300">
                      {row.originalQuantity}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-300">
                      {row.soldQuantity}
                    </td>
                    <td className="px-3 py-3 text-right align-top font-semibold text-zinc-100">
                      {row.remainingQuantity}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-300">
                      {money(row.remainingCost)}
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-300">
                      {row.ageDays === null ? '—' : `${row.ageDays} days`}
                      <div className="text-xs text-zinc-500">
                        {formatDate(row.acquiredDate)}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-300">
                      {row.storageLocation}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm leading-6 text-zinc-400">
          <div className="font-semibold text-zinc-200">Tax-safe note</div>
          <p className="mt-1">
            Open lots are still inventory. The remaining cost basis should stay
            attached to the unsold quantity until the items are sold, disposed,
            donated, used as a documented giveaway, or otherwise finalized
            through the proper workflow.
          </p>
        </div>
      </div>
    </div>
  )
}
