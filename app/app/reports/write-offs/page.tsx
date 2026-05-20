import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
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

export default async function WriteOffDisposalReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedStatus = resolvedSearchParams.status || 'all'
  const startDate =
    resolvedSearchParams.startDate ||
    resolvedSearchParams.dateFrom ||
    resolvedSearchParams.from ||
    ''
  const endDate =
    resolvedSearchParams.endDate ||
    resolvedSearchParams.dateTo ||
    resolvedSearchParams.to ||
    ''

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

          <ReportExportButtons />
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
          period={resolvedSearchParams.period || 'monthly'}
          date={resolvedSearchParams.date || ''}
          year={resolvedSearchParams.year || ''}
          month={resolvedSearchParams.month || ''}
          quarter={resolvedSearchParams.quarter || ''}
          startDate={startDate}
          endDate={endDate}
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
          emptyMessage="No write-off or disposal records matched those filters."
          columns={[
            {
              key: 'item',
              label: 'Item',
              render: (item) => (
                <div className="min-w-[240px]">
                  <Link
                    href={`/app/inventory/${item.id}`}
                    className="font-medium text-zinc-100 hover:underline"
                  >
                    {getItemName(item)}
                  </Link>
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
