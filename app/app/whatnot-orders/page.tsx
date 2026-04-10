import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { combineWhatnotOrdersIntoBreakAction } from '@/app/actions/whatnot'

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
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

type SuggestedGroup = {
  key: string
  seller: string
  processedDate: string | null
  processedDateDisplay: string
  orders: WhatnotOrderRow[]
  subtotal: number
  shipping: number
  taxes: number
  total: number
}

function buildSuggestedGroups(orders: WhatnotOrderRow[]) {
  const map = new Map<string, SuggestedGroup>()

  for (const order of orders) {
    if (order.break_id) continue

    const seller = String(order.seller ?? '').trim()
    const processedDate = order.processed_date ?? null

    if (!seller || !processedDate) continue

    const key = `${processedDate}__${seller.toLowerCase()}`

    if (!map.has(key)) {
      map.set(key, {
        key,
        seller,
        processedDate,
        processedDateDisplay:
          order.processed_date_display ||
          new Date(processedDate).toLocaleDateString('en-US'),
        orders: [],
        subtotal: 0,
        shipping: 0,
        taxes: 0,
        total: 0,
      })
    }

    const group = map.get(key)!
    group.orders.push(order)
    group.subtotal += Number(order.subtotal ?? 0)
    group.shipping += Number(order.shipping_price ?? 0)
    group.taxes += Number(order.taxes ?? 0)
    group.total += Number(order.total ?? 0)
  }

  return Array.from(map.values())
    .filter((group) => group.orders.length > 1)
    .sort((a, b) => {
      const aDate = a.processedDate ?? ''
      const bDate = b.processedDate ?? ''
      if (aDate > bDate) return -1
      if (aDate < bDate) return 1
      return a.seller.localeCompare(b.seller)
    })
}

function buildFocusHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams()

  if (order.id) params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)

  return `/app/whatnot-orders/focus?${params.toString()}`
}

function cleanSearchTerm(value: string) {
  return value.trim().toLowerCase()
}

export default async function WhatnotOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string
    focus?: string
    matched?: string
    order_numeric_id?: string
    order_id?: string
    row_id?: string
    q?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const errorMessage = params?.error
  const focus = params?.focus ?? ''
  const matched = params?.matched === '1'
  const focusOrderNumericId = params?.order_numeric_id ?? ''
  const focusOrderId = params?.order_id ?? ''
  const focusRowId = params?.row_id ?? ''
  const q = params?.q ?? ''
  const normalizedQ = cleanSearchTerm(q)

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
    .order('seller', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Whatnot Orders</h1>
          <p className="mt-2 text-zinc-400">
            Imported Whatnot buyer orders waiting to be reviewed or grouped into breaks later.
          </p>
        </div>

        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Failed to load Whatnot orders: {error.message}
        </div>
      </div>
    )
  }

  const allOrders = (orders ?? []) as WhatnotOrderRow[]

  const safeOrders = allOrders.filter((order) => {
    if (!normalizedQ) return true

    const haystack = [
      order.id,
      order.break_id,
      order.order_id,
      order.order_numeric_id,
      order.buyer,
      order.seller,
      order.product_name,
      order.processed_date,
      order.processed_date_display,
      order.order_status,
      order.source_file_name,
      order.break_id ? 'linked assigned' : 'staging unassigned not linked',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (normalizedQ === 'linked' || normalizedQ === 'assigned') {
      return !!order.break_id
    }

    if (
      normalizedQ === 'staging' ||
      normalizedQ === 'unlinked' ||
      normalizedQ === 'unassigned'
    ) {
      return !order.break_id
    }

    return haystack.includes(normalizedQ)
  })

  const unassignedOrders = safeOrders.filter((order) => !order.break_id)
  const assignedOrders = safeOrders.filter((order) => !!order.break_id)

  const totals = safeOrders.reduce(
    (acc, order) => {
      acc.subtotal += Number(order.subtotal ?? 0)
      acc.shipping += Number(order.shipping_price ?? 0)
      acc.taxes += Number(order.taxes ?? 0)
      acc.total += Number(order.total ?? 0)
      return acc
    },
    {
      subtotal: 0,
      shipping: 0,
      taxes: 0,
      total: 0,
    }
  )

  const suggestedGroups = buildSuggestedGroups(safeOrders)

  function isFocusedOrder(order: WhatnotOrderRow) {
    if (focusRowId && order.id === focusRowId) return true
    if (focusOrderNumericId && order.order_numeric_id === focusOrderNumericId) return true
    if (focusOrderId && order.order_id === focusOrderId) return true
    if (focus) {
      return (
        order.id === focus ||
        order.order_numeric_id === focus ||
        order.order_id === focus
      )
    }
    return false
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Whatnot Orders</h1>
          <p className="mt-2 text-zinc-400">
            Imported Whatnot buyer orders. This is your staging area before grouping orders into breaks.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/app/imports/whatnot"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Import More
          </Link>
          <Link
            href="/app/utilities"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to Utilities
          </Link>
        </div>
      </div>

      {matched && (focus || focusOrderNumericId || focusOrderId || focusRowId) ? (
        <div className="rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-300">
          Matched order found. You can also open the dedicated focus page for a cleaner view.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <form method="get" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder='Search seller, order #, product, file name, break id... or use "linked" / "staging"'
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>
            {q ? (
              <Link
                href="/app/whatnot-orders"
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>

        {q ? (
          <div className="mt-3 text-sm text-zinc-400">
            Showing results for <span className="text-zinc-200">"{q}"</span>
          </div>
        ) : null}
      </form>

      <div className="grid gap-3 md:grid-cols-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Shown Orders</div>
          <div className="mt-1 text-2xl font-semibold">{safeOrders.length}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Unassigned</div>
          <div className="mt-1 text-2xl font-semibold">{unassignedOrders.length}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Assigned to Break</div>
          <div className="mt-1 text-2xl font-semibold">{assignedOrders.length}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Subtotal</div>
          <div className="mt-1 text-2xl font-semibold">{money(totals.subtotal)}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Shipping</div>
          <div className="mt-1 text-2xl font-semibold">{money(totals.shipping)}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Total Paid</div>
          <div className="mt-1 text-2xl font-semibold">{money(totals.total)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Suggested Groups</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Auto-grouped by seller and date. These are suggestions only.
            </p>
          </div>

          <div className="text-sm text-zinc-500">
            Showing groups with 2+ unassigned orders
          </div>
        </div>

        {suggestedGroups.length === 0 ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
            No suggested groups found yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {suggestedGroups.map((group) => (
              <div
                key={group.key}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold">
                      {group.seller} — {group.processedDateDisplay}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {group.orders.length} orders suggested for one break
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
                        Subtotal {money(group.subtotal)}
                      </span>
                      <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
                        Shipping {money(group.shipping)}
                      </span>
                      <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
                        Taxes {money(group.taxes)}
                      </span>
                      <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
                        Total {money(group.total)}
                      </span>
                    </div>
                  </div>

                  <form action={combineWhatnotOrdersIntoBreakAction}>
                    {group.orders.map((order) => (
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
                      Combine This Group Into Break
                    </button>
                  </form>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-900 text-zinc-300">
                      <tr>
                        <th className="px-3 py-2 text-left">Order #</th>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                        <th className="px-3 py-2 text-right">Shipping</th>
                        <th className="px-3 py-2 text-right">Taxes</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-left">Focus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.orders.map((order) => (
                        <tr key={order.id} className="border-t border-zinc-800">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {order.order_numeric_id ? (
                              <div>#{order.order_numeric_id}</div>
                            ) : (
                              <div className="text-zinc-500">—</div>
                            )}
                          </td>
                          <td className="px-3 py-2 min-w-[320px]">
                            <div>{order.product_name || '—'}</div>
                            {order.order_status ? (
                              <div className="text-xs text-zinc-500">
                                {order.order_status}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right">{order.quantity ?? 0}</td>
                          <td className="px-3 py-2 text-right">{money(order.subtotal)}</td>
                          <td className="px-3 py-2 text-right">{money(order.shipping_price)}</td>
                          <td className="px-3 py-2 text-right">{money(order.taxes)}</td>
                          <td className="px-3 py-2 text-right">{money(order.total)}</td>
                          <td className="px-3 py-2">
                            <Link
                              href={buildFocusHref(order)}
                              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                            >
                              Open Focus
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        action={combineWhatnotOrdersIntoBreakAction}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">All Orders</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Orders are sorted by date first, then seller. Select unassigned orders from the same seller and combine them into one break.
            </p>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Combine Selected Into Break
          </button>
        </div>

        {safeOrders.length === 0 ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
            {q ? 'No Whatnot orders match your search.' : 'No Whatnot orders found yet. Import a CSV first.'}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Select</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Seller</th>
                  <th className="px-3 py-2 text-left">Order #</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Shipping</th>
                  <th className="px-3 py-2 text-right">Taxes</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Break Link</th>
                  <th className="px-3 py-2 text-left">Focus</th>
                </tr>
              </thead>
              <tbody>
                {safeOrders.map((order) => {
                  const assigned = !!order.break_id
                  const focused = isFocusedOrder(order)

                  return (
                    <tr
                      key={order.id}
                      id={`order-row-${order.id}`}
                      className={`border-t ${
                        focused
                          ? 'border-blue-500 bg-blue-950/30 ring-1 ring-inset ring-blue-500'
                          : 'border-zinc-800'
                      }`}
                    >
                      <td className="px-3 py-2">
                        {assigned ? (
                          <span className="text-zinc-500">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            name="whatnot_order_ids"
                            value={order.id}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                          />
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {assigned ? (
                          <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300">
                            Assigned
                          </span>
                        ) : (
                          <span className="rounded-full border border-yellow-800 bg-yellow-950/40 px-2 py-1 text-xs text-yellow-300">
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        {order.processed_date_display ||
                          (order.processed_date
                            ? new Date(order.processed_date).toLocaleDateString('en-US')
                            : '—')}
                      </td>

                      <td className="px-3 py-2">{order.seller || '—'}</td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        {order.order_numeric_id ? (
                          <div>#{order.order_numeric_id}</div>
                        ) : (
                          <div className="text-zinc-500">—</div>
                        )}
                        {focused ? (
                          <div className="mt-1 text-xs text-blue-300">Matched order</div>
                        ) : null}
                      </td>

                      <td className="px-3 py-2 min-w-[320px]">
                        <div>{order.product_name || '—'}</div>
                        {order.order_status ? (
                          <div className="text-xs text-zinc-500">
                            {order.order_status}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-3 py-2 text-right">{order.quantity ?? 0}</td>
                      <td className="px-3 py-2 text-right">{money(order.subtotal)}</td>
                      <td className="px-3 py-2 text-right">{money(order.shipping_price)}</td>
                      <td className="px-3 py-2 text-right">{money(order.taxes)}</td>
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

                      <td className="px-3 py-2">
                        <Link
                          href={buildFocusHref(order)}
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
        )}
      </form>
    </div>
  )
}