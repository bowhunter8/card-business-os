import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DraftBreakBuilder from './DraftBreakBuilder'

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function dateDisplay(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US')
}

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

function matchesFocus(
  order: WhatnotOrderRow,
  rowId: string,
  orderNumericId: string,
  orderId: string,
  focus: string
) {
  if (rowId && order.id === rowId) return true
  if (orderNumericId && order.order_numeric_id === orderNumericId) return true
  if (orderId && order.order_id === orderId) return true
  if (focus) {
    return (
      order.id === focus ||
      order.order_numeric_id === focus ||
      order.order_id === focus
    )
  }
  return false
}

function sortOrders(orders: WhatnotOrderRow[]) {
  return [...orders].sort((a, b) => {
    const aDate = a.processed_date ?? ''
    const bDate = b.processed_date ?? ''
    if (aDate > bDate) return -1
    if (aDate < bDate) return 1

    const aCreated = a.created_at ?? ''
    const bCreated = b.created_at ?? ''
    if (aCreated > bCreated) return -1
    if (aCreated < bCreated) return 1

    return a.id.localeCompare(b.id)
  })
}

function buildAllOrdersHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams()
  params.set('matched', '1')
  params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)
  return `/app/whatnot-orders?${params.toString()}`
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeProduct(value: string | null | undefined) {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'only',
    'from',
    'into',
    'mega',
    'hobby',
    'break',
    'cards',
    'card',
    'x',
  ])

  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopWords.has(token))
}

function productOverlapScore(a: string | null | undefined, b: string | null | undefined) {
  const aTokens = tokenizeProduct(a)
  const bTokens = tokenizeProduct(b)

  if (aTokens.length === 0 || bTokens.length === 0) return 0

  const bSet = new Set(bTokens)
  let matches = 0

  for (const token of aTokens) {
    if (bSet.has(token)) matches += 1
  }

  return matches
}

function buildRecommendedAssociatedOrders(
  allOrders: WhatnotOrderRow[],
  primaryOrder: WhatnotOrderRow,
  relatedOrders: WhatnotOrderRow[]
) {
  const relatedIds = new Set(relatedOrders.map((order) => order.id))
  const results: Array<
    WhatnotOrderRow & {
      recommendation_reason: string
      recommendation_score: number
    }
  > = []

  const primarySeller = normalizeText(primaryOrder.seller)
  const primaryProcessedDate = primaryOrder.processed_date ?? ''
  const primarySourceFile = normalizeText(primaryOrder.source_file_name)

  for (const order of allOrders) {
    if (relatedIds.has(order.id)) continue
    if (order.break_id) continue

    const sameSeller = normalizeText(order.seller) === primarySeller
    if (!sameSeller) continue

    const sameSourceFile =
      primarySourceFile.length > 0 &&
      normalizeText(order.source_file_name) === primarySourceFile

    const sameProcessedDate =
      primaryProcessedDate.length > 0 &&
      order.processed_date === primaryProcessedDate

    const overlap = productOverlapScore(primaryOrder.product_name, order.product_name)

    let score = 0
    const reasons: string[] = []

    if (sameSourceFile && sameProcessedDate) {
      score += 100
      reasons.push('same seller + same source file + same date')
    }

    if (sameSourceFile && overlap >= 2) {
      score += 80
      reasons.push('same seller + same source file + similar product')
    }

    if (!sameSourceFile && sameProcessedDate && overlap >= 2) {
      score += 40
      reasons.push('same seller + same date + similar product')
    }

    // Tight filter: require a meaningful score to include
    if (score < 80) continue

    results.push({
      ...order,
      recommendation_reason: reasons.join(' • '),
      recommendation_score: score,
    })
  }

  return [...results].sort((a, b) => {
    if (b.recommendation_score !== a.recommendation_score) {
      return b.recommendation_score - a.recommendation_score
    }

    const aDate = a.processed_date ?? ''
    const bDate = b.processed_date ?? ''
    if (aDate > bDate) return -1
    if (aDate < bDate) return 1

    const aCreated = a.created_at ?? ''
    const bCreated = b.created_at ?? ''
    if (aCreated > bCreated) return -1
    if (aCreated < bCreated) return 1

    return a.id.localeCompare(b.id)
  })
}

export default async function WhatnotOrderFocusPage({
  searchParams,
}: {
  searchParams?: Promise<{
    focus?: string
    order_numeric_id?: string
    order_id?: string
    row_id?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined

  const focus = params?.focus ?? ''
  const rowId = params?.row_id ?? ''
  const orderNumericId = params?.order_numeric_id ?? ''
  const orderId = params?.order_id ?? ''

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: orders, error } = await supabase
    .from('whatnot_orders')
    .select(
      `
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
    `
    )
    .eq('user_id', user.id)
    .order('processed_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="app-page-wide space-y-3">
        <div>
          <h1 className="app-title">Focused Order</h1>
          <p className="app-subtitle">Single-order view for scanner matches.</p>
        </div>

        <div className="app-alert-error">
          Failed to load orders: {error.message}
        </div>
      </div>
    )
  }

  const safeOrders = (orders ?? []) as WhatnotOrderRow[]

  const directMatches = sortOrders(
    safeOrders.filter((order) =>
      matchesFocus(order, rowId, orderNumericId, orderId, focus)
    )
  )

  const primaryOrder =
    directMatches.find((order) => rowId && order.id === rowId) ||
    directMatches.find(
      (order) => orderNumericId && order.order_numeric_id === orderNumericId
    ) ||
    directMatches.find((order) => orderId && order.order_id === orderId) ||
    directMatches[0] ||
    null

  if (!primaryOrder) {
    return (
      <div className="app-page-wide space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="app-title">Focused Order</h1>
            <p className="app-subtitle">Single-order view for scanner matches.</p>
          </div>

          <Link
            href="/app/whatnot-orders"
            className="app-button"
          >
            Back to All Orders
          </Link>
        </div>

        <div className="app-alert-warning">
          No matching order was found for this focus request.
        </div>
      </div>
    )
  }

  const relatedOrders = sortOrders(
    safeOrders.filter((order) => {
      if (order.id === primaryOrder.id) return true

      const sameNumeric =
        primaryOrder.order_numeric_id &&
        order.order_numeric_id === primaryOrder.order_numeric_id

      const sameOrderId =
        primaryOrder.order_id &&
        order.order_id === primaryOrder.order_id

      return Boolean(sameNumeric || sameOrderId)
    })
  )

  const recommendedAssociatedOrders = buildRecommendedAssociatedOrders(
    safeOrders,
    primaryOrder,
    relatedOrders
  )

  const relatedTotals = relatedOrders.reduce(
    (acc, order) => {
      acc.subtotal += Number(order.subtotal ?? 0)
      acc.shipping += Number(order.shipping_price ?? 0)
      acc.taxes += Number(order.taxes ?? 0)
      acc.total += Number(order.total ?? 0)
      return acc
    },
    { subtotal: 0, shipping: 0, taxes: 0, total: 0 }
  )

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">Focused Order</h1>
          <p className="app-subtitle">
            Scanner match, linked record status, and related rows in one compact view.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/whatnot-orders" className="app-button whitespace-nowrap">
            Back to Orders
          </Link>

          <Link href={buildAllOrdersHref(primaryOrder)} className="app-button whitespace-nowrap">
            Open in Orders
          </Link>

          {primaryOrder.break_id ? (
            <Link
              href={`/app/breaks/${primaryOrder.break_id}`}
              className="app-button-primary whitespace-nowrap"
            >
              Open Linked Purchase
            </Link>
          ) : null}
        </div>
      </div>

      <div className="app-section border-blue-900/50 bg-blue-950/15 p-3">
        <div className="grid gap-3 xl:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Matched Order</div>
                <div className="mt-0.5 truncate text-xl font-semibold">
                  {primaryOrder.order_numeric_id
                    ? `#${primaryOrder.order_numeric_id}`
                    : 'No order number'}
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                {primaryOrder.processed_date_display || dateDisplay(primaryOrder.processed_date)}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              <div className="app-card-tight p-2.5 xl:col-span-2">
                <div className="text-[11px] text-zinc-500">Seller</div>
                <div className="mt-0.5 truncate text-sm font-medium">{primaryOrder.seller || '—'}</div>
              </div>

              <div className="app-card-tight p-2.5 xl:col-span-2">
                <div className="text-[11px] text-zinc-500">Buyer</div>
                <div className="mt-0.5 truncate text-sm font-medium">{primaryOrder.buyer || '—'}</div>
              </div>

              <div className="app-card-tight p-2.5">
                <div className="text-[11px] text-zinc-500">Status</div>
                <div className="mt-0.5 truncate text-sm font-medium">{primaryOrder.order_status || '—'}</div>
              </div>

              <div className="app-card-tight p-2.5">
                <div className="text-[11px] text-zinc-500">Qty</div>
                <div className="mt-0.5 text-sm font-medium">{primaryOrder.quantity ?? 0}</div>
              </div>
            </div>

            <div className="grid gap-2 lg:grid-cols-[1fr_280px]">
              <div className="app-card-tight p-2.5">
                <div className="text-[11px] text-zinc-500">Product</div>
                <div className="mt-0.5 line-clamp-2 text-sm font-medium">
                  {primaryOrder.product_name || '—'}
                </div>
              </div>

              <div className="app-card-tight p-2.5">
                <div className="text-[11px] text-zinc-500">Source File</div>
                <div className="mt-0.5 truncate text-sm font-medium">
                  {primaryOrder.source_file_name || '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="app-card-tight h-fit p-3">
            <div className="text-sm font-semibold text-zinc-200">Link Status</div>

            {primaryOrder.break_id ? (
              <div className="mt-2 space-y-2">
                <div className="app-alert-success py-2 text-xs">
                  Linked to a purchase.
                </div>

                <Link href={`/app/breaks/${primaryOrder.break_id}`} className="app-button-primary w-full justify-center">
                  Open Linked Purchase
                </Link>
              </div>
            ) : (
              <div className="app-alert-warning mt-2 py-2 text-xs">
                Still in staging / not linked yet
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="app-card-tight p-2.5">
          <div className="text-[11px] text-zinc-400">Matched Rows</div>
          <div className="mt-0.5 text-lg font-semibold">{relatedOrders.length}</div>
        </div>

        <div className="app-card-tight p-2.5">
          <div className="text-[11px] text-zinc-400">Subtotal</div>
          <div className="mt-0.5 text-lg font-semibold">{money(relatedTotals.subtotal)}</div>
        </div>

        <div className="app-card-tight p-2.5">
          <div className="text-[11px] text-zinc-400">Shipping</div>
          <div className="mt-0.5 text-lg font-semibold">{money(relatedTotals.shipping)}</div>
        </div>

        <div className="app-card-tight p-2.5">
          <div className="text-[11px] text-zinc-400">Total Paid</div>
          <div className="mt-0.5 text-lg font-semibold">{money(relatedTotals.total)}</div>
        </div>
      </div>

      <div className="app-section p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Matching Records</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Exact matches based on row id, order id, or numeric order number.
            </p>
          </div>
        </div>

        <div className="mt-3 app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th">Row</th>
                <th className="app-th">Status</th>
                <th className="app-th">Date</th>
                <th className="app-th">Seller</th>
                <th className="app-th">Order #</th>
                <th className="app-th">Product</th>
                <th className="app-th text-right">Qty</th>
                <th className="app-th text-right">Total</th>
                <th className="app-th">Purchase</th>
              </tr>
            </thead>
            <tbody>
              {relatedOrders.map((order, index) => (
                <tr
                  key={order.id}
                  className={`app-tr ${order.id === primaryOrder.id ? 'bg-blue-950/20' : ''}`}
                >
                  <td className="app-td">
                    <div className="font-medium">#{index + 1}</div>
                    <div className="max-w-36 truncate text-xs text-zinc-500">{order.id}</div>
                  </td>

                  <td className="app-td">
                    {order.break_id ? (
                      <span className="app-badge app-badge-success">Linked</span>
                    ) : (
                      <span className="app-badge app-badge-warning">Staging</span>
                    )}
                  </td>

                  <td className="app-td whitespace-nowrap">
                    {order.processed_date_display || dateDisplay(order.processed_date)}
                  </td>

                  <td className="app-td">{order.seller || '—'}</td>

                  <td className="app-td whitespace-nowrap">
                    {order.order_numeric_id ? `#${order.order_numeric_id}` : '—'}
                  </td>

                  <td className="app-td min-w-[320px]">
                    <div className="line-clamp-1">{order.product_name || '—'}</div>
                    <div className="text-xs text-zinc-500">
                      {order.source_file_name || 'No source file'}
                    </div>
                  </td>

                  <td className="app-td text-right">{order.quantity ?? 0}</td>
                  <td className="app-td text-right">{money(order.total)}</td>

                  <td className="app-td">
                    {order.break_id ? (
                      <Link href={`/app/breaks/${order.break_id}`} className="text-emerald-300 hover:text-emerald-200">
                        Open
                      </Link>
                    ) : (
                      <span className="text-zinc-500">Not linked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!primaryOrder.break_id ? (
        <DraftBreakBuilder
          primaryOrder={{
            id: primaryOrder.id,
            order_numeric_id: primaryOrder.order_numeric_id,
            product_name: primaryOrder.product_name,
            seller: primaryOrder.seller,
            processed_date: primaryOrder.processed_date,
            processed_date_display: primaryOrder.processed_date_display,
            total: primaryOrder.total,
          }}
          recommendedOrders={recommendedAssociatedOrders.map((order) => ({
            id: order.id,
            order_numeric_id: order.order_numeric_id,
            product_name: order.product_name,
            seller: order.seller,
            processed_date: order.processed_date,
            processed_date_display: order.processed_date_display,
            total: order.total,
          }))}
        />
      ) : null}

      {recommendedAssociatedOrders.length > 0 ? (
        <div className="app-section p-3">
          <div>
            <h2 className="text-lg font-semibold">Suggested Associated Orders</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Likely companion orders based on seller, source file, product, and date similarity.
            </p>
          </div>

          <div className="mt-3 app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Date</th>
                  <th className="app-th">Seller</th>
                  <th className="app-th">Order #</th>
                  <th className="app-th">Product</th>
                  <th className="app-th">Why Suggested</th>
                  <th className="app-th text-right">Total</th>
                  <th className="app-th">Focus</th>
                </tr>
              </thead>
              <tbody>
                {recommendedAssociatedOrders.map((order) => {
                  const focusParams = new URLSearchParams()
                  focusParams.set('row_id', order.id)
                  if (order.order_numeric_id) {
                    focusParams.set('order_numeric_id', order.order_numeric_id)
                  }
                  if (order.order_id) {
                    focusParams.set('order_id', order.order_id)
                  }

                  return (
                    <tr key={order.id} className="app-tr">
                      <td className="app-td whitespace-nowrap">
                        {order.processed_date_display || dateDisplay(order.processed_date)}
                      </td>
                      <td className="app-td">{order.seller || '—'}</td>
                      <td className="app-td whitespace-nowrap">
                        {order.order_numeric_id ? `#${order.order_numeric_id}` : '—'}
                      </td>
                      <td className="app-td min-w-[320px]">
                        <div className="line-clamp-1">{order.product_name || '—'}</div>
                        <div className="text-xs text-zinc-500">
                          {order.source_file_name || 'No source file'}
                        </div>
                      </td>
                      <td className="app-td">
                        <span className="text-zinc-300">{order.recommendation_reason}</span>
                      </td>
                      <td className="app-td text-right">{money(order.total)}</td>
                      <td className="app-td">
                        <Link
                          href={`/app/whatnot-orders/focus?${focusParams.toString()}`}
                          className="app-button whitespace-nowrap text-xs"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
