import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'

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
  current_value?: number | string | null
  estimated_value?: number | string | null
  sale_price?: number | string | null
  sold_price?: number | string | null
  created_at?: string | null
  acquired_at?: string | null
  purchase_date?: string | null
  date_added?: string | null
  notes?: string | null
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

function normalizeStatus(status: string | null | undefined) {
  const clean = asString(status).trim()
  return clean || 'unknown'
}

function prettyStatus(status: string | null | undefined) {
  return normalizeStatus(status)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
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
  return asNumber(item.allocated_cost ?? item.purchase_price ?? item.cost ?? 0)
}

function getItemValue(item: InventoryItemRow) {
  return asNumber(item.current_value ?? item.estimated_value ?? item.sale_price ?? item.sold_price ?? 0)
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

function matchesActionNeededFilter(item: InventoryItemRow, actionFilter: string) {
  if (!actionFilter || actionFilter === 'all') return true

  const status = normalizeStatus(item.status).toLowerCase()
  const value = getItemValue(item)
  const cost = getItemCost(item)
  const daysHeld = getDaysHeld(item)
  const notes = asString(item.notes).toLowerCase()
  const action = getWorkflowAction(item)

  if (actionFilter === 'ready-to-list') return action === 'Ready To List'
  if (actionFilter === 'missing-cost') return (status === 'available' || status === 'listed') && cost <= 0
  if (actionFilter === 'missing-value') return value <= 0
  if (actionFilter === 'needs-photos') return notes.includes('photo') || notes.includes('scan')
  if (actionFilter === 'available-30') return status === 'available' && daysHeld !== null && daysHeld >= 30
  if (actionFilter === 'available-90') return status === 'available' && daysHeld !== null && daysHeld >= 90
  if (actionFilter === 'listed-30') return status === 'listed' && daysHeld !== null && daysHeld >= 30
  if (actionFilter === 'listed-90') return status === 'listed' && daysHeld !== null && daysHeld >= 90
  if (actionFilter === 'pc-review') return status === 'personal'
  if (actionFilter === 'notes-review') return Boolean(asString(item.notes).trim())
  if (actionFilter === 'disposal-candidate') return status === 'junk' || action === 'Disposal Candidate'

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

function statusBadgeClass(status: string | null | undefined) {
  const clean = normalizeStatus(status).toLowerCase()

  if (clean === 'listed') return 'inline-flex items-center rounded-full border border-blue-800 bg-blue-950/40 px-2 py-0.5 text-xs font-medium text-blue-200'
  if (clean === 'available') return 'inline-flex items-center rounded-full border border-cyan-800 bg-cyan-950/40 px-2 py-0.5 text-xs font-medium text-cyan-200'
  if (clean === 'junk' || clean === 'disposed') return 'inline-flex items-center rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200'

  return 'inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-200'
}

function OperationCard({
  href,
  title,
  description,
}: {
  href: string
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-800 bg-black/30 p-3 transition hover:bg-zinc-900"
    >
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-400">{description}</div>
    </Link>
  )
}

export default async function OperationsReportPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('created_at', { ascending: false })

  const inventoryItems = (data ?? []) as InventoryItemRow[]
  const availableItems = inventoryItems.filter(
    (item) => normalizeStatus(item.status).toLowerCase() === 'available'
  )
  const listedItems = inventoryItems.filter(
    (item) => normalizeStatus(item.status).toLowerCase() === 'listed'
  )
  const aging30Items = inventoryItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return daysHeld !== null && daysHeld >= 30
  })
  const aging90Items = inventoryItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return daysHeld !== null && daysHeld >= 90
  })
  const aging180Items = inventoryItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return daysHeld !== null && daysHeld >= 180
  })
  const listed30Items = listedItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return daysHeld !== null && daysHeld >= 30
  })
  const listed90Items = listedItems.filter((item) => {
    const daysHeld = getDaysHeld(item)
    return daysHeld !== null && daysHeld >= 90
  })
  const actionNeededItems = inventoryItems.filter((item) => matchesActionNeededFilter(item, 'needed'))
  const listingPriorityItems = availableItems.filter(
    (item) => getWorkflowAction(item) === '90+ Days Available'
  )
  const totalAvailableCost = availableItems.reduce((sum, item) => sum + getItemCost(item), 0)
  const totalAvailableValue = availableItems.reduce((sum, item) => sum + getItemValue(item), 0)

  const operationsRows = Array.from(
    new Map(
      [
        ...actionNeededItems,
        ...availableItems,
        ...listed30Items,
      ].map((item) => [item.id, item])
    ).values()
  ).slice(0, 250)

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Daily Operations Report</h1>
          <p className="app-subtitle">
            Read-only workflow review for unlisted inventory, aging inventory, action-needed items, and listing priorities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>
          <Link href="/app/reports/inventory" className="app-button-primary">
            Inventory Reports
          </Link>
        </div>
      </div>

      {error ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">Operations report could not load</h2>
          <p className="mt-1 text-sm text-red-200">
            Supabase returned an error while loading inventory_items: {error.message}
          </p>
        </section>
      ) : null}

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Quick Operations Views</h2>
            <p className="text-sm text-zinc-400">
              These shortcuts open filtered read-only inventory reports without changing tax, sales, or COGS records.
            </p>
          </div>
          <div className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-300">
            IRS-safe read-only mode
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <OperationCard
            href="/app/reports/inventory?action=ready-to-list"
            title="Ready To List"
            description="Available inventory ready for listing review."
          />
          <OperationCard
            href="/app/reports/inventory?action=missing-cost"
            title="Missing Cost Basis"
            description="IRS-critical cleanup before selling or year-end review."
          />
          <OperationCard
            href="/app/reports/inventory?action=available-30"
            title="30+ Days Available"
            description="Available inventory that may need listing, pricing, or bundling."
          />
          <OperationCard
            href="/app/reports/inventory?action=available-90"
            title="90+ Days Available"
            description="Stale available inventory for repricing, bundling, promotion, or disposal review."
          />
          <OperationCard
            href="/app/reports/inventory?action=listed-30"
            title="Listed 30+ Days"
            description="Listed inventory that should be checked for price, title, or photos."
          />
          <OperationCard
            href="/app/reports/inventory?action=listed-90"
            title="Listed 90+ Days"
            description="Stale listings that may need relisting, markdowns, or bundling."
          />
          <OperationCard
            href="/app/reports/inventory?action=notes-review"
            title="Notes / Flagged Review"
            description="Items with notes that may need manual follow-up."
          />
          <OperationCard
            href="/app/reports/inventory?action=disposal-candidate"
            title="Disposal Candidates"
            description="Junk or stale inventory that may need write-off/disposal support."
          />
        </div>
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Available Items',
            value: availableItems.length.toLocaleString(),
            note: 'Potential listing queue',
          },
          {
            label: 'Listing Priority',
            value: listingPriorityItems.length.toLocaleString(),
            note: 'Available and 90+ days held',
          },
          {
            label: 'Action Needed',
            value: actionNeededItems.length.toLocaleString(),
            note: 'Needs workflow review',
          },
          {
            label: '30+ Days Available',
            value: aging30Items.length.toLocaleString(),
            note: 'Aging inventory',
          },
          {
            label: '90+ Days Available',
            value: aging90Items.length.toLocaleString(),
            note: 'Aging inventory',
          },
          {
            label: '180+ Days Held',
            value: aging180Items.length.toLocaleString(),
            note: 'Stale inventory review',
          },
          {
            label: 'Listed 30+ Days',
            value: listed30Items.length.toLocaleString(),
            note: 'Listing review queue',
          },
          {
            label: 'Listed 90+ Days',
            value: listed90Items.length.toLocaleString(),
            note: 'Stale listing review',
          },
          {
            label: 'Available Cost',
            value: formatCurrency(totalAvailableCost),
            note: 'Cash tied in available items',
          },
          {
            label: 'Available Value',
            value: formatCurrency(totalAvailableValue),
            note: 'Estimated value',
          },
          {
            label: 'Unrealized Spread',
            value: formatCurrency(totalAvailableValue - totalAvailableCost),
            note: 'Available value less cost',
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Operations Table</h2>
            <p className="text-sm text-zinc-400">
              Shows action-needed items, available inventory, and listed aging review items. This is report-only and does not alter tax records.
            </p>
          </div>

          <Link href="/app/inventory" className="app-button">
            Open Inventory
          </Link>
        </div>

        <ReportTable
          rows={operationsRows}
          emptyMessage="No operational inventory items need review right now."
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
                <span className={statusBadgeClass(item.status)}>{prettyStatus(item.status)}</span>
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
              render: (item) => getWorkflowAction(item),
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
