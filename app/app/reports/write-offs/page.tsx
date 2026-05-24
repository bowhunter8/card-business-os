import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from '@/lib/reports/report-url-utils'
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

type SearchParams = {
  q?: string
  status?: string
  from?: string
  to?: string
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

type InventoryRow = {
  id: string
  title?: string | null
  item_name?: string | null
  name?: string | null
  player_name?: string | null
  player?: string | null
  year?: string | number | null
  brand?: string | null
  set_name?: string | null
  card_number?: string | null
  item_number?: string | null
  status?: string | null
  quantity?: string | number | null
  cost_basis?: string | number | null
  cost?: string | number | null
  purchase_price?: string | number | null
  allocated_cost?: string | number | null
  estimated_value?: string | number | null
  current_value?: string | number | null
  sale_price?: string | number | null
  sold_price?: string | number | null
  notes?: string | null
  disposal_reason?: string | null
  disposed_reason?: string | null
  write_off_reason?: string | null
  disposed_at?: string | null
  disposal_date?: string | null
  updated_at?: string | null
  created_at?: string | null
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

function formatDate(value: unknown) {
  const text = asString(value)
  if (!text) return '—'

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return '—'

  return dateFormatter.format(date)
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

function statusBadgeClass(status: string | null | undefined) {
  const clean = normalizeStatus(status).toLowerCase()

  if (clean === 'disposed') {
    return 'inline-flex items-center rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200'
  }

  if (clean === 'junk') {
    return 'inline-flex items-center rounded-full border border-red-800 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-200'
  }

  return 'inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-200'
}

function getQuantity(item: InventoryRow) {
  return asNumber(item.quantity) || 1
}

function getCostBasis(item: InventoryRow) {
  return (
    asNumber(item.cost_basis) ||
    asNumber(item.allocated_cost) ||
    asNumber(item.purchase_price) ||
    asNumber(item.cost)
  )
}

function getEstimatedValue(item: InventoryRow) {
  return (
    asNumber(item.current_value) ||
    asNumber(item.estimated_value) ||
    asNumber(item.sale_price) ||
    asNumber(item.sold_price)
  )
}

function getItemName(item: InventoryRow) {
  const directName =
    item.title ||
    item.item_name ||
    item.name ||
    item.player_name ||
    item.player

  if (directName) return asString(directName)

  const details = [
    item.year,
    item.brand,
    item.set_name,
    item.card_number || item.item_number
      ? `#${item.card_number || item.item_number}`
      : '',
  ]
    .map((part) => asString(part).trim())
    .filter(Boolean)

  return details.join(' ') || 'Untitled inventory item'
}

function getItemDetails(item: InventoryRow) {
  const details = [
    item.year,
    item.brand,
    item.set_name,
    item.card_number || item.item_number
      ? `#${item.card_number || item.item_number}`
      : '',
  ]
    .map((part) => asString(part).trim())
    .filter(Boolean)

  return details.join(' • ') || 'No item details entered'
}

function getReason(item: InventoryRow) {
  return (
    item.disposal_reason ||
    item.disposed_reason ||
    item.write_off_reason ||
    item.notes ||
    '—'
  )
}

function getReviewDate(item: InventoryRow) {
  return (
    item.disposed_at ||
    item.disposal_date ||
    item.updated_at ||
    item.created_at ||
    null
  )
}

function matchesSearch(item: InventoryRow, search: string) {
  if (!search) return true

  const haystack = [
    item.title,
    item.item_name,
    item.name,
    item.player_name,
    item.player,
    item.year,
    item.brand,
    item.set_name,
    item.card_number,
    item.item_number,
    item.status,
    item.notes,
    item.disposal_reason,
    item.disposed_reason,
    item.write_off_reason,
  ]
    .map(asString)
    .join(' ')
    .toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function matchesDateRange(item: InventoryRow, startDate: string, endDate: string) {
  const rawDate = getReviewDate(item)
  if (!rawDate) return true

  const itemDate = new Date(asString(rawDate))
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

function buildInventoryHref(search: string, selectedStatus: string) {
  const query = new URLSearchParams()

  if (search) query.set('q', search)
  if (selectedStatus && selectedStatus !== 'all') query.set('status', selectedStatus)

  const queryString = query.toString()
  return `/app/inventory${queryString ? `?${queryString}` : ''}`
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

function normalizePeriod(raw?: string | null): ReportPeriod {
  if (raw === 'day' || raw === 'daily') return 'daily'
  if (raw === 'week' || raw === 'weekly') return 'weekly'
  if (raw === 'month' || raw === 'monthly') return 'monthly'
  if (raw === 'quarter' || raw === 'quarterly') return 'quarterly'
  if (raw === 'year' || raw === 'yearly') return 'yearly'
  if (raw === 'custom') return 'custom'

  return 'monthly'
}

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return parsed
}

function clampMonth(raw?: string | null) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    return new Date().getMonth() + 1
  }

  return parsed
}

function clampQuarter(raw?: string | null) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
    return Math.floor(new Date().getMonth() / 3) + 1
  }

  return parsed
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseInputDate(value: string | undefined | null, fallback: Date) {
  if (!value) return fallback

  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== 3) return fallback

  const [year, month, day] = parts
  if (!year || !month || !day) return fallback

  const date = new Date(year, month - 1, day)

  if (Number.isNaN(date.getTime())) return fallback

  return date
}

function getStartOfWeekSunday(date: Date) {
  const result = new Date(date)
  result.setDate(result.getDate() - result.getDay())

  return result
}

function getEndOfWeekSunday(date: Date) {
  const result = getStartOfWeekSunday(date)
  result.setDate(result.getDate() + 6)

  return result
}

function getReportDateRange({
  selectedYear,
  period,
  date,
  start,
  end,
  month,
  quarter,
}: {
  selectedYear: number
  period: ReportPeriod
  date?: string | null
  start?: string | null
  end?: string | null
  month: number
  quarter: number
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'daily') {
    const selectedDay = parseInputDate(date, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      date: dateToInputValue(selectedDay),
      year: selectedDay.getFullYear(),
      month: selectedDay.getMonth() + 1,
      quarter: Math.floor(selectedDay.getMonth() / 3) + 1,
    }
  }

  if (period === 'weekly') {
    const selectedDay = parseInputDate(date, defaultAnchor)
    const weekStart = getStartOfWeekSunday(selectedDay)
    const weekEnd = getEndOfWeekSunday(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      date: dateToInputValue(weekStart),
      year: weekStart.getFullYear(),
      month: weekStart.getMonth() + 1,
      quarter: Math.floor(weekStart.getMonth() / 3) + 1,
    }
  }

  if (period === 'monthly') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      date: dateToInputValue(monthStart),
      year: selectedYear,
      month,
      quarter: Math.floor((month - 1) / 3) + 1,
    }
  }

  if (period === 'quarterly') {
    const quarterStartMonth = (quarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      date: dateToInputValue(quarterStart),
      year: selectedYear,
      month: quarterStartMonth + 1,
      quarter,
    }
  }

  if (period === 'yearly') {
    return {
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
      date: `${selectedYear}-01-01`,
      year: selectedYear,
      month: new Date().getMonth() + 1,
      quarter: Math.floor(new Date().getMonth() / 3) + 1,
    }
  }

  const fallbackStart = new Date(selectedYear, 0, 1)
  const fallbackEnd = new Date(selectedYear, 11, 31)
  const customStart = parseInputDate(start, fallbackStart)
  const customEnd = parseInputDate(end, fallbackEnd)

  const normalizedStart =
    customStart.getTime() <= customEnd.getTime() ? customStart : customEnd
  const normalizedEnd =
    customStart.getTime() <= customEnd.getTime() ? customEnd : customStart

  return {
    startDate: dateToInputValue(normalizedStart),
    endDate: dateToInputValue(normalizedEnd),
    date: dateToInputValue(normalizedStart),
    year: selectedYear,
    month,
    quarter,
  }
}

function buildWriteOffExportParams({
  search,
  selectedStatus,
  selectedPeriod,
  selectedYear,
  selectedMonth,
  selectedQuarter,
  selectedDate,
  startDate,
  endDate,
}: {
  search: string
  selectedStatus: string
  selectedPeriod: ReportPeriod
  selectedYear: number
  selectedMonth: number
  selectedQuarter: number
  selectedDate: string
  startDate: string
  endDate: string
}) {
  return {
    ...(search ? { q: search } : {}),
    ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
    period: selectedPeriod,
    year: String(selectedYear),
    ...(selectedPeriod === 'daily' || selectedPeriod === 'weekly'
      ? { date: selectedDate }
      : {}),
    ...(selectedPeriod === 'monthly' ? { month: String(selectedMonth) } : {}),
    ...(selectedPeriod === 'quarterly' ? { quarter: String(selectedQuarter) } : {}),
    ...(selectedPeriod === 'custom'
      ? {
          startDate,
          endDate,
          dateFrom: startDate,
          dateTo: endDate,
          from: startDate,
          to: endDate,
        }
      : {}),
  }
}

export default async function WriteOffDisposalReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedStatus = resolvedSearchParams.status || 'all'
  const selectedPeriod = normalizePeriod(resolvedSearchParams.period)
  const selectedYear = clampYear(resolvedSearchParams.year)
  const selectedMonth = clampMonth(resolvedSearchParams.month)
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter)
  const selectedDate =
    selectedPeriod === 'daily' || selectedPeriod === 'weekly'
      ? resolvedSearchParams.date || ''
      : ''
  const selectedStart =
    selectedPeriod === 'custom'
      ? resolvedSearchParams.startDate ||
        resolvedSearchParams.dateFrom ||
        resolvedSearchParams.from ||
        ''
      : ''
  const selectedEnd =
    selectedPeriod === 'custom'
      ? resolvedSearchParams.endDate ||
        resolvedSearchParams.dateTo ||
        resolvedSearchParams.to ||
        ''
      : ''

  const resolvedDateRange = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    date: selectedDate,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
  })

  const startDate = resolvedDateRange.startDate
  const endDate = resolvedDateRange.endDate

  const exportParams = buildWriteOffExportParams({
    search,
    selectedStatus,
    selectedPeriod,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    selectedDate: selectedDate || resolvedDateRange.date,
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
      .in('status', ['disposed', 'junk'])
      .order('updated_at', { ascending: false }),

    supabase
      .from('user_report_presets')
      .select('*')
      .eq('report_type', 'write-offs')
      .order('created_at', { ascending: false }),
  ])

  const { data: inventoryItemsRaw, error } = inventoryItemsResponse
  const userWriteOffPresets =
    (userPresetsResponse.data ?? []) as UserReportPresetRow[]

  const allWriteOffItems = (inventoryItemsRaw || []) as InventoryRow[]

  const writeOffItems = allWriteOffItems.filter((item) => {
    const status = normalizeStatus(item.status)

    if (selectedStatus !== 'all' && status !== selectedStatus) return false
    if (!matchesSearch(item, search)) return false
    if (!matchesDateRange(item, startDate, endDate)) return false

    return true
  })

  const totalRecords = writeOffItems.length
  const disposedCount = writeOffItems.filter(
    (item) => normalizeStatus(item.status) === 'disposed'
  ).length
  const junkCount = writeOffItems.filter(
    (item) => normalizeStatus(item.status) === 'junk'
  ).length

  const totalQuantity = writeOffItems.reduce(
    (sum, item) => sum + getQuantity(item),
    0
  )

  const totalCostBasis = writeOffItems.reduce((sum, item) => {
    return sum + getCostBasis(item) * getQuantity(item)
  }, 0)

  const totalEstimatedValue = writeOffItems.reduce((sum, item) => {
    return sum + getEstimatedValue(item) * getQuantity(item)
  }, 0)

  const estimatedDifference = totalEstimatedValue - totalCostBasis

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Write-Off / Disposal Review</h1>
          <p className="app-subtitle">
            Read-only review for junk, damaged, donated, giveaway, and finalized disposal records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/reports/tax/summary" className="app-button">
            Year-End Tax Center
          </Link>

          <ReportExportButtons
            csvHref={buildReportCsvHref('write-offs', exportParams)}
            pdfHref={buildReportPdfHref('write-offs', exportParams)}
            printHref={buildReportPrintHref('write-offs', exportParams)}
          />
        </div>
      </div>

      {error ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">
            Write-off report could not load
          </h2>
          <p className="mt-1 text-sm text-red-200">
            Supabase returned an error while loading inventory_items: {error.message}
          </p>
        </section>
      ) : null}

      <form action="/app/reports/write-offs" method="get" className="space-y-3">
        <ReportDateFilters
          period={selectedPeriod}
          date={
            selectedPeriod === 'daily' || selectedPeriod === 'weekly'
              ? selectedDate || resolvedDateRange.date
              : ''
          }
          year={String(selectedYear)}
          month={String(selectedMonth)}
          quarter={String(selectedQuarter)}
          startDate={selectedPeriod === 'custom' ? startDate : ''}
          endDate={selectedPeriod === 'custom' ? endDate : ''}
          resetHref="/app/reports/write-offs"
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
                placeholder="Item, player, set, reason, notes..."
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
                <option value="all">Disposed + Junk</option>
                <option value="disposed">Disposed only</option>
                <option value="junk">Junk only</option>
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
              Save the current filters as a reusable write-off/disposal review preset.
            </p>
          </div>

          <form
            action={saveReportPresetAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="reportType" value="write-offs" />
            <input type="hidden" name="returnPath" value="/app/reports/write-offs" />

            <input type="hidden" name="q" value={search} />
            <input type="hidden" name="status" value={selectedStatus} />
            <input type="hidden" name="startDate" value={startDate} />
            <input type="hidden" name="endDate" value={endDate} />
            <input
              type="hidden"
              name="period"
              value={selectedPeriod}
            />
            <input
              type="hidden"
              name="year"
              value={String(selectedYear)}
            />
            <input
              type="hidden"
              name="month"
              value={String(selectedMonth)}
            />
            <input
              type="hidden"
              name="quarter"
              value={String(selectedQuarter)}
            />

            <label className="block min-w-[220px]">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Preset Name
              </span>

              <input
                type="text"
                name="name"
                required
                placeholder="Year-End Disposal Review"
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
              Write-Off / Disposal Presets
            </h2>

            <p className="text-sm text-zinc-400">
              Saved review filters for write-offs, junk, disposal records, and CPA support.
            </p>
          </div>

          <div className="rounded-full border border-amber-900 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-300">
            Review Presets
          </div>
        </div>

        <ReportUserPresetList
          presets={userWriteOffPresets.map((preset) => ({
            id: preset.id,
            name: preset.name,
            description: preset.description,
            is_favorite: Boolean(
              (preset as UserReportPresetRow & { is_favorite?: boolean | null }).is_favorite
            ),
            href: `/app/reports/write-offs?${new URLSearchParams(
              preset.params || {}
            ).toString()}`,
          }))}
          returnPath="/app/reports/write-offs"
          onDeleteAction={deleteReportPresetAction}
          onFavoriteAction={toggleFavoriteReportPresetAction}
        />
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Records In View',
            value: totalRecords.toLocaleString(),
            note: 'Filtered disposal/junk records',
          },
          {
            label: 'Quantity',
            value: totalQuantity.toLocaleString(),
            note: 'Total items represented',
          },
          {
            label: 'Disposed',
            value: disposedCount.toLocaleString(),
            note: 'Finalized disposal records',
          },
          {
            label: 'Junk',
            value: junkCount.toLocaleString(),
            note: 'Junk status records',
          },
          {
            label: 'Cost Basis',
            value: formatCurrency(totalCostBasis),
            note: 'Recorded inventory cost',
          },
          {
            label: 'Estimated Value',
            value: formatCurrency(totalEstimatedValue),
            note: 'Remaining estimated value',
          },
          {
            label: 'Gain / Loss',
            value: formatCurrency(estimatedDifference),
            note: 'Estimated value less cost',
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Write-Off / Disposal Table
            </h2>
            <p className="text-sm text-zinc-400">
              Report-only table. Open inventory to edit records, notes, status, or disposal details.
            </p>
          </div>

          <Link href={buildInventoryHref(search, selectedStatus)} className="app-button">
            Open Inventory
          </Link>
        </div>

        <ReportTable
          rows={writeOffItems}
          rowHref={(item) => `/app/inventory/${item.id}`}
          emptyMessage="No write-off or disposal records matched those filters."
          columns={[
            {
              key: 'item',
              label: 'Item',
              render: (item) => (
                <div className="min-w-[240px]">
                  <div className="font-medium text-zinc-100">
                    {getItemName(item)}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {getItemDetails(item)}
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
              key: 'qty',
              label: 'Qty',
              align: 'right',
              render: (item) => getQuantity(item).toLocaleString(),
            },
            {
              key: 'date',
              label: 'Review Date',
              render: (item) => formatDate(getReviewDate(item)),
            },
            {
              key: 'cost',
              label: 'Cost Basis',
              align: 'right',
              render: (item) => formatCurrency(getCostBasis(item) * getQuantity(item)),
            },
            {
              key: 'value',
              label: 'Est. Value',
              align: 'right',
              render: (item) => formatCurrency(getEstimatedValue(item) * getQuantity(item)),
            },
            {
              key: 'reason',
              label: 'Reason / Notes',
              className: 'max-w-[320px]',
              render: (item) => (
                <div className="line-clamp-2 text-zinc-300">{getReason(item)}</div>
              ),
            },
          ]}
        />
      </section>

      <section className="app-section space-y-3">
        <h2 className="text-base font-semibold text-zinc-100">
          CPA / Tax Review Notes
        </h2>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-black/30 p-4">
            <h3 className="font-semibold text-zinc-100">Do not double count</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Inventory cost should only be counted once. This page supports documentation and review.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-4">
            <h3 className="font-semibold text-zinc-100">Keep clear notes</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Notes should explain why the item was junked, disposed, donated, damaged, or used as a giveaway.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-4">
            <h3 className="font-semibold text-zinc-100">Use year-end reports</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Final tax totals should still be checked against the year-end tax center before sending records to a CPA.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
