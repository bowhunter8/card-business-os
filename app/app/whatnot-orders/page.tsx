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
  created_at: string | null
}

type WhatnotOrderSummaryRow = {
  break_id: string | null
  subtotal: number | null
  shipping_price: number | null
  total: number | null
}

type SuggestedGroup = {
  id: string
  seller: string
  date_key: string
  date_label: string
  order_count: number
  total_paid: number
}

type PageLimit = 10 | 25 | 100

const DEFAULT_LIMIT: PageLimit = 10
const LIMIT_OPTIONS: PageLimit[] = [10, 25, 100]

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).format(parsed)
}

function cleanText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeCandidate(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeCandidate(value: string | null | undefined) {
  return cleanText(decodeCandidate(String(value ?? '')))
}

function looksLikeOrderNumber(value: string) {
  const cleaned = normalizeCandidate(value)

  if (!cleaned) return false
  if (cleaned.includes(',')) return false
  if (/\s/.test(cleaned)) return false
  if (/UTC|USD|direct_order|completed|imported|subtotal|shipping|tax/i.test(cleaned)) {
    return false
  }

  return /^[A-Za-z0-9_-]+$/.test(cleaned)
}

function getOrderNumberDisplay(order: WhatnotOrderRow) {
  const numericId = normalizeCandidate(order.order_numeric_id)
  const orderId = normalizeCandidate(order.order_id)

  if (looksLikeOrderNumber(numericId)) return numericId
  if (looksLikeOrderNumber(orderId)) return orderId

  return '—'
}

function getDescriptionDisplay(order: WhatnotOrderRow) {
  const cleanedProductName = cleanText(order.product_name)

  if (cleanedProductName) {
    return cleanedProductName
  }

  return 'Imported order'
}

function buildFocusHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams()

  if (order.id) params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)

  return `/app/whatnot-orders/focus?${params.toString()}`
}

function buildOrdersHref({
  q,
  page,
  limit,
}: {
  q?: string
  page: number
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('page', String(page))
  params.set('limit', String(limit))

  const query = params.toString()
  return query ? `/app/whatnot-orders?${query}` : '/app/whatnot-orders'
}

export default async function WhatnotOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; page?: string; limit?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim().toLowerCase()

  const requestedPage = Number(String(params?.page ?? '1'))
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1

  const requestedLimit = Number(String(params?.limit ?? String(DEFAULT_LIMIT)))
  const limit: PageLimit = LIMIT_OPTIONS.includes(requestedLimit as PageLimit)
    ? (requestedLimit as PageLimit)
    : DEFAULT_LIMIT

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let filteredQuery = supabase
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
      source_file_name,
      created_at
    `)
    .eq('user_id', user.id)

  if (qRaw === 'unassigned') {
    filteredQuery = filteredQuery.is('break_id', null)
  } else if (qRaw === 'assigned') {
    filteredQuery = filteredQuery.not('break_id', 'is', null)
  }

  const summaryQuery = supabase
    .from('whatnot_orders')
    .select(`
      break_id,
      subtotal,
      shipping_price,
      total
    `)
    .eq('user_id', user.id)

  const suggestionsQuery =
    qRaw === 'assigned'
      ? null
      : supabase
          .from('whatnot_order_group_suggestions')
          .select(`
            id,
            seller,
            date_key,
            date_label,
            order_count,
            total_paid
          `)
          .eq('user_id', user.id)
          .order('order_count', { ascending: false })
          .order('total_paid', { ascending: false })
          .limit(20)

  const from = (page - 1) * limit
  const to = from + limit - 1

  const [filteredRes, summaryRes, suggestionsRes] = await Promise.all([
    filteredQuery.order('processed_date', { ascending: false }).range(from, to),
    summaryQuery,
    suggestionsQuery,
  ])

  const filteredOrders = (filteredRes.data ?? []) as WhatnotOrderRow[]
  const summaryRows = (summaryRes.data ?? []) as WhatnotOrderSummaryRow[]
  const suggestedGroups = (suggestionsRes?.data ?? []) as SuggestedGroup[]

  let totalOrders = 0
  let subtotalTotal = 0
  let shippingTotal = 0
  let totalPaid = 0
  let unassignedCount = 0
  let assignedCount = 0

  for (const order of summaryRows) {
    totalOrders += 1
    subtotalTotal += Number(order.subtotal ?? 0)
    shippingTotal += Number(order.shipping_price ?? 0)
    totalPaid += Number(order.total ?? 0)

    if (!order.break_id) {
      unassignedCount += 1
    } else {
      assignedCount += 1
    }
  }

  const pageTitle =
    qRaw === 'unassigned'
      ? 'Orders — Unassigned'
      : qRaw === 'assigned'
        ? 'Orders — Assigned'
        : 'Orders'

  const pageDescription =
    qRaw === 'unassigned'
      ? 'Showing only orders that have not yet been grouped into a break.'
      : qRaw === 'assigned'
        ? 'Showing only orders that are already linked to a break.'
        : 'Orders are shown here as a staging area before grouping them into breaks or other purchase batches.'

  const hasPreviousPage = page > 1
  const hasNextPage = filteredOrders.length === limit

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
          href={buildOrdersHref({ q: '', page: 1, limit })}
          className={`app-chip ${qRaw === '' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          All Orders
        </Link>
        <Link
          href={buildOrdersHref({ q: 'unassigned', page: 1, limit })}
          className={`app-chip ${qRaw === 'unassigned' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Unassigned
        </Link>
        <Link
          href={buildOrdersHref({ q: 'assigned', page: 1, limit })}
          className={`app-chip ${qRaw === 'assigned' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Assigned
        </Link>
      </div>

      {filteredRes.error ? (
        <div className="app-alert-error">
          Order load error: {filteredRes.error.message}
        </div>
      ) : null}

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Total Orders</div>
          <div className="mt-1 text-2xl font-semibold">{totalOrders}</div>
        </div>

        <Link
          href={buildOrdersHref({ q: 'unassigned', page: 1, limit })}
          className="app-metric-card transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Unassigned</div>
          <div className="mt-1 text-2xl font-semibold">{unassignedCount}</div>
        </Link>

        <Link
          href={buildOrdersHref({ q: 'assigned', page: 1, limit })}
          className="app-metric-card transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Assigned to Break</div>
          <div className="mt-1 text-2xl font-semibold">{assignedCount}</div>
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

      <div className="app-section p-4 mt-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-zinc-500">
            Page {page} • Suggested groups are loaded from cached database records.
          </div>

          <div className="flex flex-wrap gap-2">
            {LIMIT_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildOrdersHref({ q: qRaw, page: 1, limit: option })}
                className={`app-chip ${limit === option ? 'app-chip-active' : 'app-chip-idle'}`}
              >
                {option} rows
              </Link>
            ))}
          </div>
        </div>
      </div>

      {suggestedGroups.length > 0 ? (
        <div className="app-section">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Suggested Groups</h2>
              <p className="mt-0.5 text-sm text-zinc-400">
                Auto-grouped by seller and date. These are cached suggestions.
              </p>
            </div>

            <div className="text-xs text-zinc-500">
              Showing groups with 2+ unassigned orders
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {suggestedGroups.map((group) => (
              <div key={group.id} className="app-card-tight">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold leading-snug">
                      {group.seller} — {group.date_label}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {group.order_count} orders suggested for one break
                    </div>
                    <div className="mt-0.5 text-sm text-zinc-500">
                      Total paid {money(group.total_paid)}
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
                  : 'Showing all orders.'}
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
          <div className="mt-4 app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Order #</th>
                  <th className="app-th">Date Added</th>
                  <th className="app-th">Order Date</th>
                  <th className="app-th">Purchased From</th>
                  <th className="app-th">Description</th>
                  <th className="app-th">Status</th>
                  <th className="app-th text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const importedDate = formatDate(order.created_at)
                  const orderDate = formatDate(
                    order.processed_date_display || order.processed_date
                  )
                  const orderNumber = getOrderNumberDisplay(order)
                  const seller = cleanText(order.seller || 'Unknown Seller')
                  const productName = getDescriptionDisplay(order)

                  return (
                    <tr key={order.id} className="app-tr">
                      <td className="app-td whitespace-nowrap">
                        <Link
                          href={buildFocusHref(order)}
                          className="hover:text-zinc-100"
                        >
                          {orderNumber}
                        </Link>
                      </td>
                      <td className="app-td whitespace-nowrap">{importedDate}</td>
                      <td className="app-td whitespace-nowrap">{orderDate}</td>
                      <td className="app-td">
                        <div className="max-w-[180px] truncate" title={seller}>
                          {seller}
                        </div>
                      </td>
                      <td className="app-td">
                        <div className="max-w-[520px] truncate" title={productName}>
                          {productName}
                        </div>
                      </td>
                      <td className="app-td">
                        {order.break_id ? (
                          <span className="app-badge app-badge-success">Linked</span>
                        ) : (
                          <span className="app-badge app-badge-warning">Unassigned</span>
                        )}
                      </td>
                      <td className="app-td text-right whitespace-nowrap">
                        {money(order.total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-section p-4 mt-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            Showing page {page} with up to {limit} orders.
          </div>

          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildOrdersHref({
                  q: qRaw,
                  page: page - 1,
                  limit,
                })}
                className="app-button"
              >
                Previous
              </Link>
            ) : (
              <span className="app-button opacity-50 pointer-events-none">Previous</span>
            )}

            {hasNextPage ? (
              <Link
                href={buildOrdersHref({
                  q: qRaw,
                  page: page + 1,
                  limit,
                })}
                className="app-button-primary"
              >
                Next
              </Link>
            ) : (
              <span className="app-button-primary opacity-50 pointer-events-none">Next</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}