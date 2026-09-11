import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type SealedInventoryRow = {
  id: string
  product_name: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  sport: string | null
  category: string | null
  configuration: string | null
  purchase_package_type: string
  purchase_package_quantity: number
  units_per_package: number
  inventory_unit_type: string
  quantity_received: number
  quantity_remaining: number
  purchase_price: number
  inbound_shipping_cost: number
  purchase_sales_tax: number
  other_acquisition_cost: number
  total_acquisition_cost: number | null
  original_unit_cost_basis: number | null
  purchase_date: string
  purchased_from: string | null
  platform: string | null
  order_number: string | null
  location: string | null
  notes: string | null
  status: string
  created_at: string
  updated_at: string
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function wholeNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function titleCase(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateDisplay(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function productMeta(item: SealedInventoryRow) {
  return [
    item.year,
    item.manufacturer || item.brand,
    item.configuration,
    item.sport,
  ]
    .filter(Boolean)
    .join(' • ')
}

function statusBadge(status: string) {
  if (status === 'available') {
    return <span className="app-badge app-badge-success">Available</span>
  }

  if (status === 'depleted') {
    return <span className="app-badge app-badge-neutral">Depleted</span>
  }

  if (status === 'returned') {
    return <span className="app-badge app-badge-warning">Returned</span>
  }

  if (status === 'closed') {
    return <span className="app-badge app-badge-neutral">Closed</span>
  }

  return <span className="app-badge">{titleCase(status)}</span>
}

export default async function SealedInventoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data, error } = await supabase
    .from('sealed_inventory_items')
    .select(
      [
        'id',
        'product_name',
        'year',
        'manufacturer',
        'brand',
        'sport',
        'category',
        'configuration',
        'purchase_package_type',
        'purchase_package_quantity',
        'units_per_package',
        'inventory_unit_type',
        'quantity_received',
        'quantity_remaining',
        'purchase_price',
        'inbound_shipping_cost',
        'purchase_sales_tax',
        'other_acquisition_cost',
        'total_acquisition_cost',
        'original_unit_cost_basis',
        'purchase_date',
        'purchased_from',
        'platform',
        'order_number',
        'location',
        'notes',
        'status',
        'created_at',
        'updated_at',
      ].join(', ')
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })

  const items = (data ?? []) as unknown as SealedInventoryRow[]

  const activeItems = items.filter(
    (item) => item.status === 'available' && Number(item.quantity_remaining ?? 0) > 0
  )

  const totalUnitsRemaining = activeItems.reduce(
    (sum, item) => sum + Number(item.quantity_remaining ?? 0),
    0
  )

  const remainingInventoryValue = activeItems.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity_remaining ?? 0) *
        Number(item.original_unit_cost_basis ?? 0),
    0
  )

  const totalAcquisitionCost = items.reduce(
    (sum, item) => sum + Number(item.total_acquisition_cost ?? 0),
    0
  )

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="app-badge app-badge-info">Breaker Tools</span>
            <span className="app-badge">Tax-Tracked Inventory</span>
          </div>

          <h1 className="app-title">Sealed Inventory</h1>

          <p className="app-subtitle">
            Track unopened cases, boxes, and packs before they are sold sealed or
            consumed in a break. Acquisition cost stays attached to the exact
            inventory lot for tax and profitability reporting.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/breaker-tools/breaks/new"
            className="app-button"
          >
            Create Break
          </Link>

          <Link
            href="/app/breaker-tools/sealed-inventory/new"
            className="app-button-primary"
          >
            Add Sealed Product
          </Link>
        </div>
      </div>

      {error ? (
        <div className="app-alert-error">
          Unable to load sealed inventory: {error.message}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Active Lots
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-100">
            {wholeNumber(activeItems.length)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Lots with sealed inventory remaining
          </div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Units Remaining
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-100">
            {wholeNumber(totalUnitsRemaining)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Cases, boxes, packs, or other tracked units
          </div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Remaining Cost Basis
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-100">
            {money(remainingInventoryValue)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Current sealed inventory at original cost
          </div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Lifetime Acquisition Cost
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-100">
            {money(totalAcquisitionCost)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Original cost of sealed lots shown here
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
        <span className="font-semibold">Accounting rule:</span>{' '}
        purchasing sealed product establishes inventory cost basis. HITS will
        recognize that cost when product is sold sealed, consumed by a break, or
        removed through another documented disposition. Break pricing and markup
        remain separate from tax cost basis.
      </div>

      <section className="app-section overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Sealed Product Lots
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Each row preserves the original purchase lot and its remaining
              cost basis.
            </p>
          </div>

          <div className="text-xs text-zinc-500">
            {wholeNumber(items.length)} lot{items.length === 1 ? '' : 's'}
          </div>
        </div>

        {items.length === 0 && !error ? (
          <div className="px-5 py-12 text-center">
            <div className="text-base font-semibold text-zinc-200">
              No sealed inventory yet
            </div>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Add a sealed case, box, pack, or other unopened product to begin
              tracking its quantity and original acquisition cost. Nothing from
              your regular card inventory is being moved or changed.
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-950">
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Product</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Purchased</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Original Qty</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Remaining</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Unit Cost</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Remaining Cost</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Source</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Location</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => {
                  const remainingCost =
                    Number(item.quantity_remaining ?? 0) *
                    Number(item.original_unit_cost_basis ?? 0)

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-zinc-900 align-top last:border-b-0 hover:bg-zinc-900/40"
                    >
                      <td className="px-4 py-3">
                        <div className="min-w-0 font-medium text-zinc-100">
                          {item.product_name}
                        </div>

                        {productMeta(item) ? (
                          <div className="mt-1 text-xs text-zinc-500">
                            {productMeta(item)}
                          </div>
                        ) : null}

                        {item.notes ? (
                          <div className="mt-1 max-w-xl text-xs text-zinc-600">
                            {item.notes}
                          </div>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                        <div>{dateDisplay(item.purchase_date)}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {wholeNumber(item.purchase_package_quantity)}{' '}
                          {titleCase(item.purchase_package_type)}
                          {item.purchase_package_quantity === 1 ? '' : 's'}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                        {wholeNumber(item.quantity_received)}{' '}
                        <span className="text-xs text-zinc-500">
                          {titleCase(item.inventory_unit_type)}
                          {item.quantity_received === 1 ? '' : 's'}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">
                        {wholeNumber(item.quantity_remaining)}{' '}
                        <span className="text-xs font-normal text-zinc-500">
                          {titleCase(item.inventory_unit_type)}
                          {item.quantity_remaining === 1 ? '' : 's'}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                        {money(item.original_unit_cost_basis)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">
                        {money(remainingCost)}
                      </td>

                      <td className="px-4 py-3 text-zinc-300">
                        <div className="whitespace-nowrap">
                          {item.purchased_from || item.platform || '—'}
                        </div>

                        {item.order_number ? (
                          <div className="mt-1 whitespace-nowrap text-xs text-zinc-500">
                            Order {item.order_number}
                          </div>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                        {item.location || '—'}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {statusBadge(item.status)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {item.status === 'available' &&
                        Number(item.quantity_remaining ?? 0) > 0 ? (
                          <Link
                            href={`/app/breaker-tools/sealed-inventory/${item.id}/sell`}
                            className="app-button-primary px-3 py-1.5 text-xs"
                          >
                            Sell
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <div className="text-xs leading-relaxed text-zinc-600">
        Sealed sales are recorded through ledger-backed actions rather than
        direct quantity edits. Break consumption, write-offs, personal use,
        returns, and corrections will follow the same accounting-safe pattern.
      </div>
    </div>
  )
}
