import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from '@/lib/reports/report-url-utils'
import {
  buildPresetHref,
  getActiveReportPreset,
  getReportPresets,
  reportPresetShortcutClass,
} from '@/lib/reports/report-presets'
import {
  deleteReportPresetAction,
  saveReportPresetAction,
  toggleFavoriteReportPresetAction,
} from '@/app/app/reports/actions'
import type { UserReportPresetRow } from '@/lib/reports/user-report-presets'

import ReportDateFilters from '@/app/app/components/reports/ReportDateFilters'
import ReportExportButtons from '@/app/app/components/reports/ReportExportButtons'
import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'
import ReportUserPresetList from '@/app/app/components/reports/ReportUserPresetList'

type InventoryItemRow = {
  id: string
  title?: string | null
  item_name?: string | null
  player_name?: string | null
  year?: string | number | null
  set_name?: string | null
  card_number?: string | null
  item_number?: string | null
  status?: string | null
  purchase_price?: number | string | null
  cost?: number | string | null
  allocated_cost?: number | string | null
  quantity?: number | string | null
  available_quantity?: number | string | null
  unit_cost?: number | string | null
  total_cost?: number | string | null
  cost_basis_unit?: number | string | null
  cost_basis_total?: number | string | null
  estimated_value_total?: number | string | null
  current_value?: number | string | null
  estimated_value?: number | string | null
  sale_price?: number | string | null
  sold_price?: number | string | null
  created_at?: string | null
  acquired_at?: string | null
  purchase_date?: string | null
  date_added?: string | null
  sold_at?: string | null
  sale_date?: string | null
  notes?: string | null
}

type SearchParams = {
  q?: string
  status?: string
  value?: string
  aging?: string
  action?: string
  dateFrom?: string
  dateTo?: string
  period?: string
  date?: string
  year?: string
  month?: string
  quarter?: string
  startDate?: string
  endDate?: string
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function asString(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  const numeric =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ''))

  return Number.isFinite(numeric) ? numeric : 0
}

function formatCurrency(value: unknown) {
  return currencyFormatter.format(asNumber(value))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return dateFormatter.format(date)
}

function getItemName(item: InventoryItemRow) {
  const directTitle = item.title || item.item_name || item.player_name || 'Untitled item'

  const details = [
    item.year ? String(item.year) : '',
    item.set_name || '',
    item.item_number || item.card_number || '',
  ].filter(Boolean)

  if (!details.length) return directTitle

  return `${directTitle} — ${details.join(' ')}`
}

function getItemDate(item: InventoryItemRow) {
  return item.acquired_at || item.purchase_date || item.date_added || item.created_at || null
}

function getItemCost(item: InventoryItemRow) {
  const quantity = asNumber(item.quantity ?? item.available_quantity ?? 1)
  const costBasisTotal = asNumber(item.cost_basis_total)
  const totalCost = asNumber(item.total_cost)
  const allocatedCost = asNumber(item.allocated_cost)
  const costBasisUnit = asNumber(item.cost_basis_unit)
  const unitCost = asNumber(item.unit_cost)
  const purchasePrice = asNumber(item.purchase_price)
  const legacyCost = asNumber(item.cost)

  if (costBasisTotal > 0) return costBasisTotal
  if (totalCost > 0) return totalCost
  if (allocatedCost > 0) return allocatedCost
  if (costBasisUnit > 0) return costBasisUnit * Math.max(quantity, 1)
  if (unitCost > 0) return unitCost * Math.max(quantity, 1)
  if (purchasePrice > 0) return purchasePrice
  if (legacyCost > 0) return legacyCost

  return 0
}

function getItemValue(item: InventoryItemRow) {
  const estimatedValueTotal = asNumber(item.estimated_value_total)
  const currentValue = asNumber(item.current_value)
  const estimatedValue = asNumber(item.estimated_value)
  const salePrice = asNumber(item.sale_price)
  const soldPrice = asNumber(item.sold_price)

  if (estimatedValueTotal > 0) return estimatedValueTotal
  if (currentValue > 0) return currentValue
  if (estimatedValue > 0) return estimatedValue
  if (salePrice > 0) return salePrice
  if (soldPrice > 0) return soldPrice

  return 0
}

function getDaysHeld(item: InventoryItemRow) {
  const rawDate = getItemDate(item)
  if (!rawDate) return null

  const itemDate = new Date(rawDate)
  if (Number.isNaN(itemDate.getTime())) return null

  const now = new Date()
  const millisecondsPerDay = 1000 * 60 * 60 * 24

  return Math.max(0, Math.floor((now.getTime() - itemDate.getTime()) / millisecondsPerDay))
}

function getAgingBucket(daysHeld: number | null) {
  if (daysHeld === null) return 'Unknown'
  if (daysHeld >= 365) return '365+ days'
  if (daysHeld >= 180) return '180-364 days'
  if (daysHeld >= 90) return '90-179 days'
  if (daysHeld >= 60) return '60-89 days'
  if (daysHeld >= 30) return '30-59 days'
  return '0-29 days'
}

function normalizeStatus(status: string | null | undefined) {
  const clean = asString(status).trim()
  return clean || 'unknown'
}

function prettyStatus(status: string | null | undefined) {
  const clean = normalizeStatus(status)

  return clean
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function getWorkflowAction(item: InventoryItemRow) {
  const status = normalizeStatus(item.status).toLowerCase()
  const value = getItemValue(item)
  const cost = getItemCost(item)
  const daysHeld = getDaysHeld(item)
  const notes = asString(item.notes).toLowerCase()

  if ((status === 'available' || status === 'listed') && cost <= 0) {
    return 'Missing Cost Basis'
  }

  if (status === 'available') {
    if (notes.includes('photo') || notes.includes('scan')) return 'Needs Photos / Scan'
    if (value <= 0) return 'Missing Estimated Value'
    if (daysHeld !== null && daysHeld >= 90) return '90+ Days Available'
    if (daysHeld !== null && daysHeld >= 30) return '30+ Days Available'
    return 'Ready To List'
  }

  if (status === 'listed') {
    if (daysHeld !== null && daysHeld >= 90) return 'Listed 90+ Days'
    if (daysHeld !== null && daysHeld >= 30) return 'Listed 30+ Days'
    return 'Monitor Listing'
  }

  if (status === 'personal') return 'Personal Collection Review'
  if (status === 'junk') return 'Disposal Candidate'
  if (status === 'disposed') return 'Finalized Disposal'
  if (status === 'sold') return 'Sold'

  return 'Review Status'
}

function matchesSearch(item: InventoryItemRow, search: string) {
  if (!search) return true

  const haystack = [
    item.title,
    item.item_name,
    item.player_name,
    item.year,
    item.set_name,
    item.card_number,
    item.item_number,
    item.status,
    item.notes,
  ]
    .map(asString)
    .join(' ')
    .toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function matchesDateRange(item: InventoryItemRow, startDate: string, endDate: string) {
  const rawDate = getItemDate(item)
  if (!rawDate) return true

  const itemDate = new Date(rawDate)
  if (Number.isNaN(itemDate.getTime())) return true

  if (startDate) {
    const fromDate = new Date(`${startDate}T00:00:00`)
    if (!Number.isNaN(fromDate.getTime()) && itemDate < fromDate) return false
  }

  if (endDate) {
    const toDate = new Date(`${endDate}T23:59:59`)
    if (!Number.isNaN(toDate.getTime()) && itemDate > toDate) return false
  }

  return true
}

function matchesValueFilter(item: InventoryItemRow, valueFilter: string) {
  if (!valueFilter || valueFilter === 'all') return true

  const value = getItemValue(item)

  if (valueFilter === 'no-value') return value <= 0
  if (valueFilter === 'under-10') return value > 0 && value < 10
  if (valueFilter === '10-50') return value >= 10 && value <= 50
  if (valueFilter === '50-100') return value > 50 && value <= 100
  if (valueFilter === 'over-100') return value > 100

  return true
}

function matchesAgingFilter(item: InventoryItemRow, agingFilter: string) {
  if (!agingFilter || agingFilter === 'all') return true

  const daysHeld = getDaysHeld(item)
  if (daysHeld === null) return false

  const minimumDays = Number(agingFilter)
  if (!Number.isFinite(minimumDays) || minimumDays <= 0) return true

  return daysHeld >= minimumDays
}

function matchesActionNeededFilter(item: InventoryItemRow, actionFilter: string) {
  if (!actionFilter || actionFilter === 'all') return true

  const status = normalizeStatus(item.status).toLowerCase()
  const value = getItemValue(item)
  const cost = getItemCost(item)
  const daysHeld = getDaysHeld(item)
  const notes = asString(item.notes).toLowerCase()
  const action = getWorkflowAction(item)

  if (actionFilter === 'ready-to-list') return action === 'Ready To List'
  if (actionFilter === 'missing-cost') {
    return (status === 'available' || status === 'listed') && cost <= 0
  }
  if (actionFilter === 'missing-value') return value <= 0
  if (actionFilter === 'needs-photos') {
    return notes.includes('photo') || notes.includes('scan')
  }
  if (actionFilter === 'available-30') {
    return status === 'available' && daysHeld !== null && daysHeld >= 30
  }
  if (actionFilter === 'available-90') {
    return status === 'available' && daysHeld !== null && daysHeld >= 90
  }
  if (actionFilter === 'listed-30') {
    return status === 'listed' && daysHeld !== null && daysHeld >= 30
  }
  if (actionFilter === 'listed-90') {
    return status === 'listed' && daysHeld !== null && daysHeld >= 90
  }
  if (actionFilter === 'pc-review') return status === 'personal'
  if (actionFilter === 'notes-review') return Boolean(asString(item.notes).trim())
  if (actionFilter === 'disposal-candidate') {
    return status === 'junk' || action === 'Disposal Candidate'
  }

  if (actionFilter === 'needed') {
    return (
      status === 'unknown' ||
      status === 'junk' ||
      cost <= 0 ||
      action === 'Missing Cost Basis' ||
      action === 'Needs Photos / Scan' ||
      action === '30+ Days Available' ||
      action === '90+ Days Available' ||
      action === 'Listed 30+ Days' ||
      action === 'Listed 90+ Days' ||
      action === 'Review Status' ||
      action === 'Personal Collection Review'
    )
  }

  return true
}

function getStatusCounts(items: InventoryItemRow[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = normalizeStatus(item.status)
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function statusBadgeClass(status: string | null | undefined) {
  const clean = normalizeStatus(status).toLowerCase()

  if (clean === 'sold') {
    return 'inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-200'
  }

  if (clean === 'listed') {
    return 'inline-flex items-center rounded-full border border-blue-800 bg-blue-950/40 px-2 py-0.5 text-xs font-medium text-blue-200'
  }

  if (clean === 'available') {
    return 'inline-flex items-center rounded-full border border-cyan-800 bg-cyan-950/40 px-2 py-0.5 text-xs font-medium text-cyan-200'
  }

  if (clean === 'personal') {
    return 'inline-flex items-center rounded-full border border-purple-800 bg-purple-950/40 px-2 py-0.5 text-xs font-medium text-purple-200'
  }

  if (clean === 'junk' || clean === 'disposed') {
    return 'inline-flex items-center rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200'
  }

  return 'inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-200'
}

function buildInventoryHref(search: string, selectedStatus: string) {
  const query = new URLSearchParams()

  if (search) query.set('q', search)
  if (selectedStatus && selectedStatus !== 'all') query.set('status', selectedStatus)

  const queryString = query.toString()
  return `/app/inventory${queryString ? `?${queryString}` : ''}`
}

function buildInventoryCsvHref(params: SearchParams) {
  return buildReportCsvHref('inventory', {
    q: params.q,
    status: params.status,
    value: params.value,
    aging: params.aging,
    action: params.action,
    period: params.period,
    date: params.date,
    year: params.year,
    month: params.month,
    quarter: params.quarter,
    startDate: params.startDate || params.dateFrom,
    endDate: params.endDate || params.dateTo,
    dateFrom: params.dateFrom || params.startDate,
    dateTo: params.dateTo || params.endDate,
  })
}

function PresetShortcut({
  href,
  label,
  active = false,
}: {
  href: string
  label: string
  active?: boolean
}) {
  return (
    <Link
      href={href}
      className={reportPresetShortcutClass(active)}
    >
      {label}
    </Link>
  )
}

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedStatus = resolvedSearchParams.status || 'all'
  const selectedValue = resolvedSearchParams.value || 'all'
  const selectedAging = resolvedSearchParams.aging || 'all'
  const selectedAction = resolvedSearchParams.action || 'all'
  const startDate = resolvedSearchParams.startDate || resolvedSearchParams.dateFrom || ''
  const endDate = resolvedSearchParams.endDate || resolvedSearchParams.dateTo || ''
  const csvHref = buildInventoryCsvHref({
    ...resolvedSearchParams,
    q: search,
    status: selectedStatus,
    value: selectedValue,
    aging: selectedAging,
    action: selectedAction,
    startDate,
    endDate,
  })

  const supabase = await createClient()

  const [
    inventoryItemsResponse,
    userPresetsResponse,
  ] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('*')
      .order('created_at', { ascending: false }),

    supabase
      .from('user_report_presets')
      .select('*')
      .eq('report_type', 'inventory')
      .order('created_at', { ascending: false }),
  ])

  const { data: inventoryItemsRaw, error } = inventoryItemsResponse

  const userInventoryPresets =
    (userPresetsResponse.data ?? []) as UserReportPresetRow[]

  const allInventoryItems = (inventoryItemsRaw || []) as InventoryItemRow[]

  const inventoryItems = allInventoryItems.filter((item) => {
    const status = normalizeStatus(item.status)

    if (selectedStatus !== 'all' && status !== selectedStatus) return false
    if (!matchesSearch(item, search)) return false
    if (!matchesDateRange(item, startDate, endDate)) return false
    if (!matchesValueFilter(item, selectedValue)) return false
    if (!matchesAgingFilter(item, selectedAging)) return false
    if (!matchesActionNeededFilter(item, selectedAction)) return false

    return true
  })

  const statusCounts = getStatusCounts(inventoryItems)
  const totalItems = inventoryItems.length
  const totalCost = inventoryItems.reduce((sum, item) => sum + getItemCost(item), 0)
  const totalValue = inventoryItems.reduce((sum, item) => sum + getItemValue(item), 0)
  const unrealizedGainLoss = totalValue - totalCost
  const listedCount = statusCounts.listed || 0
  const availableCount = statusCounts.available || 0
  const personalCount = statusCounts.personal || 0
  const soldCount = statusCounts.sold || 0
  const actionNeededCount = inventoryItems.filter((item) => matchesActionNeededFilter(item, 'needed')).length
  const aged30Count = inventoryItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return daysHeld !== null && daysHeld >= 30
  }).length
  const aged90Count = inventoryItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return daysHeld !== null && daysHeld >= 90
  }).length
  const listed30Count = inventoryItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return normalizeStatus(item.status).toLowerCase() === 'listed' && daysHeld !== null && daysHeld >= 30
  }).length

  const allStatuses = Array.from(
    new Set(allInventoryItems.map((item) => normalizeStatus(item.status)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  const inventoryPresets = getReportPresets('inventory')

  const activePreset = getActiveReportPreset('inventory', {
    status: selectedStatus,
    value: selectedValue,
    aging: selectedAging,
    action: selectedAction,
    q: search,
  })

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Inventory Report</h1>
          <p className="app-subtitle">
            Read-only inventory reporting for status, cost basis, estimated value, aging, action needed, and open inventory review.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/reports/operations" className="app-button">
            Back to Daily Operations
          </Link>

          <ReportExportButtons
            csvHref={csvHref}
            pdfHref={buildReportPdfHref('inventory', {
              ...(search ? { q: search } : {}),
              ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
              ...(selectedValue !== 'all' ? { value: selectedValue } : {}),
              ...(selectedAging !== 'all' ? { aging: selectedAging } : {}),
              ...(selectedAction !== 'all' ? { action: selectedAction } : {}),
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
              ...(resolvedSearchParams.period
                ? { period: resolvedSearchParams.period }
                : {}),
              ...(resolvedSearchParams.date
                ? { date: resolvedSearchParams.date }
                : {}),
              ...(resolvedSearchParams.year
                ? { year: resolvedSearchParams.year }
                : {}),
              ...(resolvedSearchParams.month
                ? { month: resolvedSearchParams.month }
                : {}),
              ...(resolvedSearchParams.quarter
                ? { quarter: resolvedSearchParams.quarter }
                : {}),
            })}
            printHref={buildReportPrintHref('inventory', {
              ...(search ? { q: search } : {}),
              ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
              ...(selectedValue !== 'all' ? { value: selectedValue } : {}),
              ...(selectedAging !== 'all' ? { aging: selectedAging } : {}),
              ...(selectedAction !== 'all' ? { action: selectedAction } : {}),
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
              ...(resolvedSearchParams.period
                ? { period: resolvedSearchParams.period }
                : {}),
              ...(resolvedSearchParams.date
                ? { date: resolvedSearchParams.date }
                : {}),
              ...(resolvedSearchParams.year
                ? { year: resolvedSearchParams.year }
                : {}),
              ...(resolvedSearchParams.month
                ? { month: resolvedSearchParams.month }
                : {}),
              ...(resolvedSearchParams.quarter
                ? { quarter: resolvedSearchParams.quarter }
                : {}),
            })}
          />
        </div>
      </div>

      {error ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">Inventory report could not load</h2>
          <p className="mt-1 text-sm text-red-200">
            Supabase returned an error while loading inventory_items: {error.message}
          </p>
        </section>
      ) : null}

      <form action="/app/reports/inventory" method="get" className="space-y-3">
        <ReportDateFilters
          period={resolvedSearchParams.period || 'monthly'}
          date={resolvedSearchParams.date || ''}
          year={resolvedSearchParams.year || ''}
          month={resolvedSearchParams.month || ''}
          quarter={resolvedSearchParams.quarter || ''}
          startDate={startDate}
          endDate={endDate}
          resetHref="/app/reports/inventory"
        >
          <>
            <label className="block xl:col-span-2">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Search
              </span>

              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Item, player, set, item #, notes..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Status
              </span>

              <select
                name="status"
                defaultValue={selectedStatus}
                className="app-select h-9 text-sm"
              >
                <option value="all">All statuses</option>

                {allStatuses.map((status) => (
                  <option key={status} value={status}>
                    {prettyStatus(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Value
              </span>

              <select
                name="value"
                defaultValue={selectedValue}
                className="app-select h-9 text-sm"
              >
                <option value="all">All values</option>
                <option value="no-value">No value entered</option>
                <option value="under-10">Under $10</option>
                <option value="10-50">$10 to $50</option>
                <option value="50-100">$50 to $100</option>
                <option value="over-100">Over $100</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Aging
              </span>

              <select
                name="aging"
                defaultValue={selectedAging}
                className="app-select h-9 text-sm"
              >
                <option value="all">All ages</option>
                <option value="30">30+ days held</option>
                <option value="60">60+ days held</option>
                <option value="90">90+ days held</option>
                <option value="180">180+ days held</option>
                <option value="365">365+ days held</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Action Filter
              </span>

              <select
                name="action"
                defaultValue={selectedAction}
                className="app-select h-9 text-sm"
              >
                <option value="all">All actions</option>
                <option value="needed">Action needed</option>
                <option value="ready-to-list">Ready To List</option>
                <option value="missing-cost">Missing Cost Basis</option>
                <option value="missing-value">Missing Estimated Value</option>
                <option value="needs-photos">Needs Photos / Scan</option>
                <option value="available-30">30+ Days Available</option>
                <option value="available-90">90+ Days Available</option>
                <option value="listed-30">Listed 30+ Days</option>
                <option value="listed-90">Listed 90+ Days</option>
                <option value="pc-review">Personal Collection Review</option>
                <option value="notes-review">Notes / Flagged Review</option>
                <option value="disposal-candidate">Disposal Candidates</option>
              </select>
            </label>
          </>
        </ReportDateFilters>
      </form>

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Save Current Report Preset
            </h2>

            <p className="text-sm text-zinc-400">
              Save the current filters as a reusable inventory report preset.
            </p>
          </div>

          <form
            action={saveReportPresetAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="reportType" value="inventory" />
            <input type="hidden" name="returnPath" value="/app/reports/inventory" />

            <input type="hidden" name="q" value={search} />
            <input type="hidden" name="status" value={selectedStatus} />
            <input type="hidden" name="value" value={selectedValue} />
            <input type="hidden" name="aging" value={selectedAging} />
            <input type="hidden" name="action" value={selectedAction} />
            <input type="hidden" name="startDate" value={startDate} />
            <input type="hidden" name="endDate" value={endDate} />
            <input
              type="hidden"
              name="period"
              value={resolvedSearchParams.period || ''}
            />
            <input
              type="hidden"
              name="year"
              value={resolvedSearchParams.year || ''}
            />
            <input
              type="hidden"
              name="month"
              value={resolvedSearchParams.month || ''}
            />
            <input
              type="hidden"
              name="quarter"
              value={resolvedSearchParams.quarter || ''}
            />

            <label className="block min-w-[220px]">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Preset Name
              </span>

              <input
                type="text"
                name="name"
                required
                placeholder="Available Inventory Review"
                className="app-input h-9 text-sm"
              />
            </label>

            <button
              type="submit"
              className="app-button-primary h-9 whitespace-nowrap px-3 text-sm"
            >
              Save Preset
            </button>
          </form>
        </div>
      </section>

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Inventory Presets
            </h2>

            <p className="text-sm text-zinc-400">
              Quick-launch inventory report filters for common review workflows.
            </p>
          </div>

          <div className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
            Shared Presets Active
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {inventoryPresets.map((preset) => (
            <PresetShortcut
              key={preset.id}
              href={buildPresetHref('/app/reports/inventory', preset)}
              label={preset.name}
              active={activePreset?.id === preset.id}
            />
          ))}
        </div>

        <ReportUserPresetList
          presets={userInventoryPresets.map((preset) => ({
            id: preset.id,
            name: preset.name,
            description: preset.description,
            is_favorite: Boolean(
              (preset as UserReportPresetRow & { is_favorite?: boolean | null }).is_favorite
            ),
            href: buildPresetHref('/app/reports/inventory', {
              id: preset.id,
              reportType: 'inventory',
              name: preset.name,
              description: preset.description || '',
              params: preset.params,
            }),
          }))}
          returnPath="/app/reports/inventory"
          onDeleteAction={deleteReportPresetAction}
          onFavoriteAction={toggleFavoriteReportPresetAction}
        />
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Items In View',
            value: totalItems.toLocaleString(),
            note: 'Filtered inventory records',
          },
          {
            label: 'Cost Basis',
            value: formatCurrency(totalCost),
            note: 'Allocated/purchase cost',
          },
          {
            label: 'Estimated Value',
            value: formatCurrency(totalValue),
            note: 'Current estimated value',
          },
          {
            label: 'Gain / Loss',
            value: formatCurrency(unrealizedGainLoss),
            note: 'Estimated unrealized amount',
          },
          {
            label: 'Available',
            value: availableCount.toLocaleString(),
            note: 'Ready for sale/listing',
          },
          {
            label: 'Action Needed',
            value: actionNeededCount.toLocaleString(),
            note: 'Workflow review queue',
          },
          {
            label: '30+ Days Available',
            value: aged30Count.toLocaleString(),
            note: 'Aging review',
          },
          {
            label: '90+ Days Available',
            value: aged90Count.toLocaleString(),
            note: 'Stale inventory review',
          },
          {
            label: 'Listed 30+ Days',
            value: listed30Count.toLocaleString(),
            note: 'Listing follow-up',
          },
          {
            label: 'Listed',
            value: listedCount.toLocaleString(),
            note: 'Currently listed',
          },
          {
            label: 'Sold',
            value: soldCount.toLocaleString(),
            note: 'Completed sales',
          },
          {
            label: 'Personal',
            value: personalCount.toLocaleString(),
            note: 'Personal collection',
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Inventory Table</h2>
            <p className="text-sm text-zinc-400">
              Report-only table. Open the inventory page to add, edit, sell, or dispose items.
            </p>
          </div>

          <Link href={buildInventoryHref(search, selectedStatus)} className="app-button">
            Open Inventory
          </Link>
        </div>

        <ReportTable
          rows={inventoryItems}
          emptyMessage="No inventory items matched those filters."
          columns={[
            {
              key: 'item',
              label: 'Item',
              render: (item) => (
                <div className="min-w-[240px]">
                  <div className="font-medium text-zinc-100">{getItemName(item)}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {[item.year, item.set_name, item.item_number || item.card_number]
                      .filter(Boolean)
                      .join(' • ') || 'No item details entered'}
                  </div>
                </div>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              render: (item) => (
                <span className={statusBadgeClass(item.status)}>
                  {prettyStatus(item.status)}
                </span>
              ),
            },
            {
              key: 'date',
              label: 'Date',
              render: (item) => formatDate(getItemDate(item)),
            },
            {
              key: 'daysHeld',
              label: 'Days Held',
              align: 'right',
              render: (item) => {
                const daysHeld = getDaysHeld(item)
                return daysHeld === null ? '—' : daysHeld.toLocaleString()
              },
            },
            {
              key: 'workflow',
              label: 'Suggested Action',
              render: (item) => (
                <div>
                  <div className="text-zinc-100">{getWorkflowAction(item)}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {getAgingBucket(getDaysHeld(item))}
                  </div>
                </div>
              ),
            },
            {
              key: 'cost',
              label: 'Cost Basis',
              align: 'right',
              render: (item) => formatCurrency(getItemCost(item)),
            },
            {
              key: 'value',
              label: 'Estimated Value',
              align: 'right',
              render: (item) => formatCurrency(getItemValue(item)),
            },
            {
              key: 'gain',
              label: 'Gain / Loss',
              align: 'right',
              render: (item) => formatCurrency(getItemValue(item) - getItemCost(item)),
            },
            {
              key: 'notes',
              label: 'Notes',
              className: 'max-w-[260px]',
              render: (item) => (
                <div className="line-clamp-2 text-zinc-300">{item.notes || '—'}</div>
              ),
            },
          ]}
        />
      </section>
    </main>
  )
}
