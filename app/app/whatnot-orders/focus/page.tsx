import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { combineWhatnotOrdersIntoBreakAction } from '@/app/actions/whatnot'

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
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Focused Whatnot Order</h1>
          <p className="mt-2 text-zinc-400">Single-order view for scanner matches.</p>
        </div>

        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Failed to load Whatnot orders: {error.message}
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
      <div className="max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Focused Whatnot Order</h1>
            <p className="mt-2 text-zinc-400">Single-order view for scanner matches.</p>
          </div>

          <Link
            href="/app/whatnot-orders"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to All Orders
          </Link>
        </div>

        <div className="rounded-xl border border-yellow-900 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-300">
          No matching Whatnot order was found for this focus request.
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

  const sameSellerSameDate = sortOrders(
    safeOrders.filter((order) => {
      if (relatedOrders.some((related) => related.id === order.id)) return false
      return (
        order.seller === primaryOrder.seller &&
        order.processed_date === primaryOrder.processed_date
      )
    })
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
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Focused Whatnot Order</h1>
          <p className="mt-2 text-zinc-400">
            Clean scanner view for one matched order and everything directly tied to it.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/app/whatnot-orders"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to All Orders
          </Link>

          {primaryOrder.break_id ? (
            <Link
              href={`/app/breaks/${primaryOrder.break_id}`}
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Open Linked Break
            </Link>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-blue-900 bg-blue-950/20 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Matched Order
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {primaryOrder.order_numeric_id
                  ? `#${primaryOrder.order_numeric_id}`
                  : 'No order number'}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs text-zinc-500">Seller</div>
                <div className="mt-1 font-medium">{primaryOrder.seller || '—'}</div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs text-zinc-500">Buyer</div>
                <div className="mt-1 font-medium">{primaryOrder.buyer || '—'}</div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs text-zinc-500">Processed Date</div>
                <div className="mt-1 font-medium">
                  {primaryOrder.processed_date_display ||
                    dateDisplay(primaryOrder.processed_date)}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs text-zinc-500">Status</div>
                <div className="mt-1 font-medium">{primaryOrder.order_status || '—'}</div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs text-zinc-500">Quantity</div>
                <div className="mt-1 font-medium">{primaryOrder.quantity ?? 0}</div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs text-zinc-500">Source File</div>
                <div className="mt-1 font-medium">{primaryOrder.source_file_name || '—'}</div>
              </div>
            </div>
          </div>

          <div className="min-w-[260px] rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="text-sm font-medium text-zinc-300">Link Status</div>

            {primaryOrder.break_id ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
                  This order is linked to a break.
                </div>

                <Link
                  href={`/app/breaks/${primaryOrder.break_id}`}
                  className="inline-flex rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
                >
                  Open Linked Break
                </Link>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-yellow-800 bg-yellow-950/30 px-3 py-2 text-sm text-yellow-300">
                Still in staging / not linked yet
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs text-zinc-500">Product</div>
          <div className="mt-1 text-base">{primaryOrder.product_name || '—'}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Matched Rows</div>
          <div className="mt-1 text-2xl font-semibold">{relatedOrders.length}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Subtotal</div>
          <div className="mt-1 text-2xl font-semibold">{money(relatedTotals.subtotal)}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Shipping</div>
          <div className="mt-1 text-2xl font-semibold">{money(relatedTotals.shipping)}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Total Paid</div>
          <div className="mt-1 text-2xl font-semibold">{money(relatedTotals.total)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Every Matching Place This Order Appears</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Exact matches based on row id, Whatnot order id, or Whatnot numeric order number.
            </p>
          </div>

          {!primaryOrder.break_id && relatedOrders.length > 1 ? (
            <form action={combineWhatnotOrdersIntoBreakAction}>
              {relatedOrders
                .filter((order) => !order.break_id)
                .map((order) => (
                  <input
                    key={order.id}
                    type="hidden"
                    name="whatnot_order_ids"
                    value={order.id}
                  />
                ))}

              <button
                type="submit"
                className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
              >
                Combine Matching Rows Into Break
              </button>
            </form>
          ) : null}
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">Row</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Seller</th>
                <th className="px-3 py-2 text-left">Order #</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Break</th>
              </tr>
            </thead>
            <tbody>
              {relatedOrders.map((order, index) => (
                <tr
                  key={order.id}
                  className={`border-t ${
                    order.id === primaryOrder.id
                      ? 'border-blue-500 bg-blue-950/20'
                      : 'border-zinc-800'
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">#{index + 1}</div>
                    <div className="text-xs text-zinc-500">{order.id}</div>
                  </td>

                  <td className="px-3 py-2">
                    {order.break_id ? (
                      <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300">
                        Linked
                      </span>
                    ) : (
                      <span className="rounded-full border border-yellow-800 bg-yellow-950/40 px-2 py-1 text-xs text-yellow-300">
                        Staging
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">
                    {order.processed_date_display || dateDisplay(order.processed_date)}
                  </td>

                  <td className="px-3 py-2">{order.seller || '—'}</td>

                  <td className="px-3 py-2 whitespace-nowrap">
                    {order.order_numeric_id ? `#${order.order_numeric_id}` : '—'}
                  </td>

                  <td className="px-3 py-2 min-w-[320px]">
                    <div>{order.product_name || '—'}</div>
                    <div className="text-xs text-zinc-500">
                      {order.source_file_name || 'No source file'}
                    </div>
                  </td>

                  <td className="px-3 py-2 text-right">{order.quantity ?? 0}</td>
                  <td className="px-3 py-2 text-right">{money(order.total)}</td>

                  <td className="px-3 py-2">
                    {order.break_id ? (
                      <Link
                        href={`/app/breaks/${order.break_id}`}
                        className="text-emerald-300 hover:text-emerald-200"
                      >
                        Open Linked Break
                      </Link>
                    ) : (
                      <span className="text-zinc-500">Not linked yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sameSellerSameDate.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div>
            <h2 className="text-xl font-semibold">Same Seller / Same Date Nearby Orders</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Helpful when the scanner matched one order and you want to see likely neighboring orders from the same break session.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Seller</th>
                  <th className="px-3 py-2 text-left">Order #</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Focus</th>
                </tr>
              </thead>
              <tbody>
                {sameSellerSameDate.map((order) => {
                  const params = new URLSearchParams()
                  params.set('row_id', order.id)
                  if (order.order_numeric_id) {
                    params.set('order_numeric_id', order.order_numeric_id)
                  }
                  if (order.order_id) {
                    params.set('order_id', order.order_id)
                  }

                  return (
                    <tr key={order.id} className="border-t border-zinc-800">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {order.processed_date_display || dateDisplay(order.processed_date)}
                      </td>
                      <td className="px-3 py-2">{order.seller || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {order.order_numeric_id ? `#${order.order_numeric_id}` : '—'}
                      </td>
                      <td className="px-3 py-2 min-w-[320px]">{order.product_name || '—'}</td>
                      <td className="px-3 py-2 text-right">{money(order.total)}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/app/whatnot-orders/focus?${params.toString()}`}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                        >
                          Open Focus
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