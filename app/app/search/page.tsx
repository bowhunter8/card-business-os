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

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  order_number: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  total_cost: number | null
  allocation_method: string | null
  notes?: string | null
  reversed_at?: string | null
  cards_received?: number | null
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanSearchTerm(value: string) {
  return value.trim().toLowerCase()
}

function buildFocusHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams()

  if (order.id) params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)

  return `/app/whatnot-orders/focus?${params.toString()}`
}

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const q = params?.q ?? ''
  const normalizedQ = cleanSearchTerm(q)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [ordersResponse, breaksResponse] = await Promise.all([
    supabase
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
      .order('processed_date', { ascending: false })
      .order('created_at', { ascending: false }),

    supabase
      .from('breaks')
      .select(`
        id,
        break_date,
        source_name,
        order_number,
        product_name,
        format_type,
        teams,
        total_cost,
        allocation_method,
        notes,
        reversed_at,
        cards_received
      `)
      .eq('user_id', user.id)
      .order('break_date', { ascending: false }),
  ])

  const ordersError = ordersResponse.error
  const breaksError = breaksResponse.error

  const allOrders = (ordersResponse.data ?? []) as WhatnotOrderRow[]
  const allBreaks = (breaksResponse.data ?? []) as BreakRow[]

  const matchingOrders = allOrders.filter((order) => {
    if (!normalizedQ) return false

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
      order.break_id ? 'linked assigned' : 'staging unlinked unassigned',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQ)
  })

  const matchingBreaks = allBreaks.filter((item) => {
    if (!normalizedQ) return false

    const haystack = [
      item.id,
      item.break_date,
      item.source_name,
      item.order_number,
      item.product_name,
      item.format_type,
      item.notes,
      item.allocation_method,
      item.reversed_at ? 'reversed' : 'active',
      item.teams?.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQ)
  })

  const totalHits = matchingOrders.length + matchingBreaks.length

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Global Search</h1>
          <p className="mt-2 text-zinc-400">
            Search across Whatnot staging orders and breaks in one place.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/app/whatnot-orders"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Whatnot Orders
          </Link>
          <Link
            href="/app/breaks"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Breaks
          </Link>
        </div>
      </div>

      <form method="get" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search order #, seller, product, break id, order id, notes..."
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
                href="/app/search"
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>

        {q ? (
          <div className="mt-3 text-sm text-zinc-400">
            Found <span className="text-zinc-200">{totalHits}</span> result(s) for{' '}
            <span className="text-zinc-200">"{q}"</span>
          </div>
        ) : (
          <div className="mt-3 text-sm text-zinc-500">
            Try an order number, seller name, product, file name, break id, or note text.
          </div>
        )}
      </form>

      {ordersError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading Whatnot orders: {ordersError.message}
        </div>
      ) : null}

      {breaksError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading breaks: {breaksError.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Total Hits</div>
          <div className="mt-1 text-2xl font-semibold">{q ? totalHits : 0}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Whatnot Order Hits</div>
          <div className="mt-1 text-2xl font-semibold">{q ? matchingOrders.length : 0}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-400">Break Hits</div>
          <div className="mt-1 text-2xl font-semibold">{q ? matchingBreaks.length : 0}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Matching Whatnot Orders</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Includes staging and linked orders.
            </p>
          </div>

          <div className="text-sm text-zinc-500">
            {q ? `${matchingOrders.length} hit(s)` : 'Search to see results'}
          </div>
        </div>

        {!q ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
            Enter a search term above to search all imported Whatnot orders.
          </div>
        ) : matchingOrders.length === 0 ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
            No Whatnot order matches found.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Seller</th>
                  <th className="px-3 py-2 text-left">Order #</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matchingOrders.map((order) => (
                  <tr key={order.id} className="border-t border-zinc-800">
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
                      {order.processed_date_display ||
                        (order.processed_date
                          ? new Date(order.processed_date).toLocaleDateString('en-US')
                          : '—')}
                    </td>
                    <td className="px-3 py-2">{order.seller || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {order.order_numeric_id ? `#${order.order_numeric_id}` : order.order_id || '—'}
                    </td>
                    <td className="px-3 py-2 min-w-[320px]">
                      <div>{order.product_name || '—'}</div>
                      {order.source_file_name ? (
                        <div className="text-xs text-zinc-500">{order.source_file_name}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">{money(order.total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={buildFocusHref(order)}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                        >
                          Open Focus
                        </Link>
                        {order.break_id ? (
                          <Link
                            href={`/app/breaks/${order.break_id}`}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                          >
                            Open Break
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Matching Breaks</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Searches break order number, source, product, format, and notes.
            </p>
          </div>

          <div className="text-sm text-zinc-500">
            {q ? `${matchingBreaks.length} hit(s)` : 'Search to see results'}
          </div>
        </div>

        {!q ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
            Enter a search term above to search all recorded breaks.
          </div>
        ) : matchingBreaks.length === 0 ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
            No break matches found.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Order #</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Total Cost</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matchingBreaks.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      {item.reversed_at ? (
                        <span className="rounded-full border border-yellow-800 bg-yellow-950/40 px-2 py-1 text-xs text-yellow-300">
                          Reversed
                        </span>
                      ) : (
                        <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-1 text-xs text-blue-300">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.break_date}</td>
                    <td className="px-3 py-2">{item.source_name || '—'}</td>
                    <td className="px-3 py-2">{item.order_number || '—'}</td>
                    <td className="px-3 py-2 min-w-[320px]">
                      <div>{item.product_name || 'Untitled break'}</div>
                      <div className="text-xs text-zinc-500">{item.format_type || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{money(item.total_cost)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/app/breaks/${item.id}`}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                        >
                          Details
                        </Link>
                        {!item.reversed_at ? (
                          <Link
                            href={`/app/breaks/${item.id}/edit`}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                          >
                            Edit
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}