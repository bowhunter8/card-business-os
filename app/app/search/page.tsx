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

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  order_number: string | null
  product_name: string | null
  format_type: string | null
  notes: string | null
  total_cost: number | null
  reversed_at: string | null
}

type InventoryItemRow = {
  id: string
  source_break_id: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number | null
  available_quantity: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
  status: string | null
  item_type: string | null
  notes: string | null
  source_type: string | null
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

function escapeLike(value: string) {
  return value.replace(/[%_]/g, '')
}

function extractOrderNumbers(input: string): string[] {
  if (!input) return []
  return Array.from(new Set(input.match(/\d{6,}/g) || []))
}

function buildInventoryDisplay(item: InventoryItemRow) {
  const parts = [
    item.year,
    item.set_name,
    item.player_name || item.title,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]

  return parts.filter(Boolean).join(' • ')
}

function buildBreakDisplay(breakRow: BreakRow) {
  return breakRow.product_name || breakRow.source_name || breakRow.order_number || 'Untitled break'
}

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim()
  const q = escapeLike(qRaw)
  const extractedNumbers = extractOrderNumbers(qRaw)
  const isMultiOrderSearch = extractedNumbers.length > 0

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let matchingOrders: WhatnotOrderRow[] = []
  let matchingBreaks: BreakRow[] = []
  let matchingInventory: InventoryItemRow[] = []
  let ordersError: string | null = null
  let breaksError: string | null = null
  let inventoryError: string | null = null

  if (qRaw) {
    if (isMultiOrderSearch) {
      const ordersResponse = await supabase
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
        .in('order_numeric_id', extractedNumbers)
        .order('processed_date', { ascending: false })

      matchingOrders = (ordersResponse.data ?? []) as WhatnotOrderRow[]
      ordersError = ordersResponse.error?.message ?? null
    } else {
      const orderQuery = `%${q}%`
      const breakQuery = `%${q}%`
      const inventoryQuery = `%${q}%`

      const [ordersResponse, breaksResponse, inventoryResponse] = await Promise.all([
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
            source_file_name
          `)
          .eq('user_id', user.id)
          .or(
            [
              `order_id.ilike.${orderQuery}`,
              `order_numeric_id.ilike.${orderQuery}`,
              `buyer.ilike.${orderQuery}`,
              `seller.ilike.${orderQuery}`,
              `product_name.ilike.${orderQuery}`,
              `order_status.ilike.${orderQuery}`,
              `source_file_name.ilike.${orderQuery}`,
            ].join(',')
          )
          .order('processed_date', { ascending: false }),

        supabase
          .from('breaks')
          .select(`
            id,
            break_date,
            source_name,
            order_number,
            product_name,
            format_type,
            notes,
            total_cost,
            reversed_at
          `)
          .eq('user_id', user.id)
          .or(
            [
              `order_number.ilike.${breakQuery}`,
              `source_name.ilike.${breakQuery}`,
              `product_name.ilike.${breakQuery}`,
              `format_type.ilike.${breakQuery}`,
              `notes.ilike.${breakQuery}`,
            ].join(',')
          )
          .order('break_date', { ascending: false }),

        supabase
          .from('inventory_items')
          .select(`
            id,
            source_break_id,
            title,
            player_name,
            year,
            brand,
            set_name,
            card_number,
            parallel_name,
            team,
            quantity,
            available_quantity,
            cost_basis_total,
            estimated_value_total,
            status,
            item_type,
            notes,
            source_type
          `)
          .eq('user_id', user.id)
          .or(
            [
              `title.ilike.${inventoryQuery}`,
              `player_name.ilike.${inventoryQuery}`,
              `brand.ilike.${inventoryQuery}`,
              `set_name.ilike.${inventoryQuery}`,
              `card_number.ilike.${inventoryQuery}`,
              `parallel_name.ilike.${inventoryQuery}`,
              `team.ilike.${inventoryQuery}`,
              `status.ilike.${inventoryQuery}`,
              `item_type.ilike.${inventoryQuery}`,
              `notes.ilike.${inventoryQuery}`,
            ].join(',')
          )
          .limit(100),
      ])

      matchingOrders = (ordersResponse.data ?? []) as WhatnotOrderRow[]
      matchingBreaks = (breaksResponse.data ?? []) as BreakRow[]
      matchingInventory = (inventoryResponse.data ?? []) as InventoryItemRow[]

      if (/^\d{4}$/.test(qRaw)) {
        matchingInventory = matchingInventory.filter(
          (item) => String(item.year ?? '') === qRaw
        )
      }

      ordersError = ordersResponse.error?.message ?? null
      breaksError = breaksResponse.error?.message ?? null
      inventoryError = inventoryResponse.error?.message ?? null
    }
  }

  const totalHits =
    matchingOrders.length + matchingBreaks.length + matchingInventory.length

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Search</h1>
          <p className="mt-2 text-zinc-400">
            Paste order numbers, copied email text, or search normally across orders, breaks, and inventory.
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
          <Link
            href="/app/inventory"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Inventory
          </Link>
        </div>
      </div>

      <form
        method="get"
        action="/app/search"
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={qRaw}
            placeholder="Paste order numbers, copied email text, or search breaker, player, set, item #, notes..."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>
            {qRaw ? (
              <Link
                href="/app/search"
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>

        {qRaw ? (
          <div className="mt-3 text-sm text-zinc-400">
            {ordersError || breaksError || inventoryError
              ? 'Search ran with an error.'
              : `Found ${totalHits} result(s) for "${qRaw}"`}
          </div>
        ) : (
          <div className="mt-3 text-sm text-zinc-500">
            Paste order numbers or email text, or type a normal search term and press Search.
          </div>
        )}
      </form>

      {ordersError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Order search error: {ordersError}
        </div>
      ) : null}

      {breaksError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Break search error: {breaksError}
        </div>
      ) : null}

      {inventoryError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Inventory search error: {inventoryError}
        </div>
      ) : null}

      {qRaw &&
      !ordersError &&
      !breaksError &&
      !inventoryError &&
      totalHits === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-sm text-zinc-400">
          No matching results found.
        </div>
      ) : null}

      {matchingOrders.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Matching Whatnot Orders</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {isMultiOrderSearch
                  ? 'Exact order-number matches from pasted order text.'
                  : 'Matching staging and linked Whatnot orders.'}
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              {matchingOrders.length} hit(s)
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {matchingOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {order.break_id ? (
                        <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300">
                          Linked
                        </span>
                      ) : (
                        <span className="rounded-full border border-yellow-800 bg-yellow-950/40 px-2 py-1 text-xs text-yellow-300">
                          Staging
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-lg font-semibold">
                      {order.product_name || 'Untitled order'}
                    </div>

                    <div className="mt-2 text-sm text-zinc-300">
                      Seller: {order.seller || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Buyer: {order.buyer || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Order #: {order.order_numeric_id || order.order_id || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Date: {order.processed_date_display || order.processed_date || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Status: {order.order_status || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Qty: {order.quantity ?? '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Total: {money(order.total)}
                    </div>

                    {order.source_file_name ? (
                      <div className="mt-1 text-xs text-zinc-500">
                        Source file: {order.source_file_name}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildFocusHref(order)}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                    >
                      Open Order
                    </Link>

                    {order.break_id ? (
                      <>
                        <Link
                          href={`/app/breaks/${order.break_id}`}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                        >
                          Break Details
                        </Link>
                        <Link
                          href={`/app/breaks/${order.break_id}/edit`}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                        >
                          Edit Break
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isMultiOrderSearch && matchingBreaks.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Matching Breaks</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Search hits from order number, breaker/source, product, format, and notes.
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              {matchingBreaks.length} hit(s)
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {matchingBreaks.map((breakRow) => (
              <div
                key={breakRow.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {breakRow.reversed_at ? (
                        <span className="rounded-full border border-red-800 bg-red-950/40 px-2 py-1 text-xs text-red-300">
                          Reversed
                        </span>
                      ) : (
                        <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-1 text-xs text-blue-300">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-lg font-semibold">
                      {buildBreakDisplay(breakRow)}
                    </div>

                    <div className="mt-2 text-sm text-zinc-300">
                      Breaker / Source: {breakRow.source_name || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Order #: {breakRow.order_number || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Format: {breakRow.format_type || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Break date: {breakRow.break_date || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Cost: {money(breakRow.total_cost)}
                    </div>

                    {breakRow.notes ? (
                      <div className="mt-2 text-sm text-zinc-400">
                        Notes: {breakRow.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/app/breaks/${breakRow.id}`}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                    >
                      Break Details
                    </Link>
                    <Link
                      href={`/app/breaks/${breakRow.id}/edit`}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                    >
                      Edit Break
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isMultiOrderSearch && matchingInventory.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Matching Inventory Items</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Search hits from item title, player name, set, item number, team, notes, and related inventory fields.
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              {matchingInventory.length} hit(s)
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {matchingInventory.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mt-0 text-lg font-semibold">
                      {buildInventoryDisplay(item) || item.title || 'Untitled inventory item'}
                    </div>

                    <div className="mt-2 text-sm text-zinc-300">
                      Type: {item.item_type || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Status: {item.status || '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Qty: {item.quantity ?? '—'} / Available: {item.available_quantity ?? '—'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Cost basis: {money(item.cost_basis_total)}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Est. value: {money(item.estimated_value_total)}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Source type: {item.source_type || '—'}
                    </div>

                    {item.notes ? (
                      <div className="mt-2 text-sm text-zinc-400">
                        Notes: {item.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/app/inventory"
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                    >
                      Open Inventory
                    </Link>

                    {item.source_break_id ? (
                      <Link
                        href={`/app/breaks/${item.source_break_id}`}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                      >
                        Source Break
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}