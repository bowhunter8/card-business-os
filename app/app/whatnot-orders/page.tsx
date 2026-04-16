import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type WhatnotOrderRow = {
  id: string
  break_id: string | null
  order_id: string | null
  order_numeric_id: string | null
  buyer: string | null
  seller: string | null
  product_name: string | null
  processed_date: string | null
  processed_date_display: string | null
  order_status: string | null
  quantity: number | null
  subtotal: number | null
  shipping_price: number | null
  taxes: number | null
  total: number | null
  source_file_name: string | null
}

type SuggestedGroup = {
  key: string
  seller: string
  dateLabel: string
  orderCount: number
  total: number
  orders: WhatnotOrderRow[]
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function buildFocusHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams()

  if (order.id) params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)

  return `/app/whatnot-orders/focus?${params.toString()}`
}

function buildDateLabel(order: WhatnotOrderRow) {
  const raw = order.processed_date_display || order.processed_date || ''
  if (!raw) return 'No date'
  return raw
}

function normalizeDateKey(order: WhatnotOrderRow) {
  const raw = order.processed_date || order.processed_date_display || ''
  if (!raw) return 'no-date'
  return raw.slice(0, 10)
}

function buildSuggestedGroups(orders: WhatnotOrderRow[]): SuggestedGroup[] {
  const map = new Map<string, SuggestedGroup>()

  for (const order of orders) {
    const seller = (order.seller || 'Unknown seller').trim()
    const dateKey = normalizeDateKey(order)
    const dateLabel = buildDateLabel(order)
    const key = `${seller}__${dateKey}`

    const existing = map.get(key)
    if (existing) {
      existing.orderCount += 1
      existing.total += Number(order.total ?? 0)
      existing.orders.push(order)
    } else {
      map.set(key, {
        key,
        seller,
        dateLabel,
        orderCount: 1,
        total: Number(order.total ?? 0),
        orders: [order],
      })
    }
  }

  return Array.from(map.values())
    .filter((group) => group.orderCount >= 2)
    .sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount
      return b.total - a.total
    })
}

export default async function WhatnotOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim().toLowerCase()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('whatnot_orders')
    .select(`
      id,
      break_id,
      order_id,
      order_numeric_id,
      buyer,
      seller,
      product_name,
      processed_date,
      processed_date_display,
      order_status,
      quantity,
      subtotal,
      shipping_price,
      taxes,
      total,
      source_file_name
    `)
    .eq('user_id', user.id)
    .order('processed_date', { ascending: false })

  const allOrders = (data ?? []) as WhatnotOrderRow[]

  let totalOrders = 0
  let subtotalTotal = 0
  let shippingTotal = 0
  let totalPaid = 0

  const unassignedOrders: WhatnotOrderRow[] = []
  const assignedOrders: WhatnotOrderRow[] = []

  for (const order of allOrders) {
    totalOrders += 1
    subtotalTotal += Number(order.subtotal ?? 0)
    shippingTotal += Number(order.shipping_price ?? 0)
    totalPaid += Number(order.total ?? 0)

    if (!order.break_id) {
      unassignedOrders.push(order)
    } else {
      assignedOrders.push(order)
    }
  }

  const filteredOrders =
    qRaw === 'unassigned'
      ? unassignedOrders
      : qRaw === 'assigned'
        ? assignedOrders
        : allOrders

  const suggestedGroups = buildSuggestedGroups(unassignedOrders)

  const pageTitle =
    qRaw === 'unassigned'
      ? 'Whatnot Orders — Unassigned'
      : qRaw === 'assigned'
        ? 'Whatnot Orders — Assigned'
        : 'Whatnot Orders'

  const pageDescription =
    qRaw === 'unassigned'
      ? 'Showing only Whatnot orders that have not yet been grouped into a break.'
      : qRaw === 'assigned'
        ? 'Showing only Whatnot orders that are already linked to a break.'
        : 'Imported Whatnot buyer orders. This is your staging area before grouping orders into breaks.'

  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">{pageTitle}</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/imports/whatnot" className="app-button">
            Import More
          </Link>
          <Link href="/app/utilities" className="app-button">
            Back to Utilities
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/whatnot-orders"
          className={`app-chip ${qRaw === '' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          All Orders
        </Link>
        <Link
          href="/app/whatnot-orders?q=unassigned"
          className={`app-chip ${qRaw === 'unassigned' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Unassigned
        </Link>
        <Link
          href="/app/whatnot-orders?q=assigned"
          className={`app-chip ${qRaw === 'assigned' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Assigned
        </Link>
      </div>

      {error ? (
        <div className="app-alert-error">
          Order load error: {error.message}
        </div>
      ) : null}

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Total Orders</div>
          <div className="mt-1 text-2xl font-semibold">{totalOrders}</div>
        </div>

        <Link
          href="/app/whatnot-orders?q=unassigned"
          className="app-metric-card transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Unassigned</div>
          <div className="mt-1 text-2xl font-semibold">{unassignedOrders.length}</div>
        </Link>

        <Link
          href="/app/whatnot-orders?q=assigned"
          className="app-metric-card transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Assigned to Break</div>
          <div className="mt-1 text-2xl font-semibold">{assignedOrders.length}</div>
        </Link>

        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Subtotal</div>
          <div className="mt-1 text-2xl font-semibold">{money(subtotalTotal)}</div>
        </div>

        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Shipping</div>
          <div className="mt-1 text-2xl font-semibold">{money(shippingTotal)}</div>
        </div>

        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Total Paid</div>
          <div className="mt-1 text-2xl font-semibold">{money(totalPaid)}</div>
        </div>
      </div>

      {suggestedGroups.length > 0 ? (
        <div className="app-section">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Suggested Groups</h2>
              <p className="mt-0.5 text-sm text-zinc-400">
                Auto-grouped by seller and date. These are suggestions only.
              </p>
            </div>

            <div className="text-xs text-zinc-500">
              Showing groups with 2+ unassigned orders
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {suggestedGroups.map((group) => (
              <div key={group.key} className="app-card-tight">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold leading-snug">
                      {group.seller} — {group.dateLabel}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {group.orderCount} orders suggested for one break
                    </div>
                    <div className="mt-0.5 text-sm text-zinc-500">
                      Total paid {money(group.total)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/app/search?q=${encodeURIComponent(group.seller)}`}
                      className="app-button"
                    >
                      Search Seller
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="app-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Orders</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {qRaw === 'unassigned'
                ? 'Showing only unassigned orders.'
                : qRaw === 'assigned'
                  ? 'Showing only assigned orders.'
                  : 'Showing all imported Whatnot orders.'}
            </p>
          </div>

          <div className="text-xs text-zinc-500">
            {filteredOrders.length} shown
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="app-empty mt-4">
            No orders found for this view.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {filteredOrders.map((order) => (
              <div key={order.id} className="app-card-tight">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {order.break_id ? (
                        <span className="app-badge app-badge-success">Linked</span>
                      ) : (
                        <span className="app-badge app-badge-warning">Unassigned</span>
                      )}

                      {order.order_status ? (
                        <span className="app-badge app-badge-neutral">
                          {order.order_status}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 text-base font-semibold leading-snug">
                      {order.product_name || 'Untitled order'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Seller: {order.seller || '—'}
                    </div>

                    <div className="mt-0.5 text-sm text-zinc-300">
                      Buyer: {order.buyer || '—'}
                    </div>

                    <div className="mt-0.5 text-sm text-zinc-300 break-words">
                      Order #: {order.order_numeric_id || order.order_id || '—'}
                    </div>

                    <div className="mt-0.5 text-sm text-zinc-300">
                      Date: {order.processed_date_display || order.processed_date || '—'}
                    </div>

                    <div className="mt-0.5 text-sm text-zinc-300">
                      Qty: {order.quantity ?? '—'}
                    </div>

                    <div className="mt-0.5 text-sm text-zinc-300">
                      Total: {money(order.total)}
                    </div>

                    {order.source_file_name ? (
                      <div className="mt-0.5 text-xs text-zinc-500 break-words">
                        Source file: {order.source_file_name}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Link href={buildFocusHref(order)} className="app-button">
                      Open Order
                    </Link>

                    {order.break_id ? (
                      <>
                        <Link href={`/app/breaks/${order.break_id}`} className="app-button">
                          Break Details
                        </Link>

                        <Link href={`/app/breaks/${order.break_id}/edit`} className="app-button">
                          Edit Break
                        </Link>
                      </>
                    ) : (
                      <Link
                        href={`/app/search?q=${encodeURIComponent(
                          order.order_numeric_id || order.order_id || order.seller || ''
                        )}`}
                        className="app-button"
                      >
                        Search Related
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}