import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createBreakAction } from '@/app/actions/breaks'

type WhatnotOrderRow = {
  id: string
  order_id: string | null
  order_numeric_id: string | null
  seller: string | null
  product_name: string | null
  processed_date: string | null
  processed_date_display: string | null
  subtotal: number | null
  shipping_price: number | null
  taxes: number | null
  total: number | null
  break_id: string | null
}

function safeNumber(value: number | null | undefined) {
  return Number(value ?? 0)
}

function formatDateForInput(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )
}

export default async function NewBreakPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string
    whatnot_order_ids?: string | string[]
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const error = params?.error

  const rawSelected =
    typeof params?.whatnot_order_ids === 'string'
      ? params.whatnot_order_ids
      : Array.isArray(params?.whatnot_order_ids)
      ? params?.whatnot_order_ids.join(',')
      : ''

  const selectedWhatnotOrderIds = rawSelected
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let selectedOrders: WhatnotOrderRow[] = []

  if (selectedWhatnotOrderIds.length > 0) {
    const { data } = await supabase
      .from('whatnot_orders')
      .select(`
        id,
        order_id,
        order_numeric_id,
        seller,
        product_name,
        processed_date,
        processed_date_display,
        subtotal,
        shipping_price,
        taxes,
        total,
        break_id
      `)
      .eq('user_id', user.id)
      .in('id', selectedWhatnotOrderIds)
      .order('processed_date', { ascending: true })

    selectedOrders = (data ?? []) as WhatnotOrderRow[]
  }

  const prefillFromWhatnot = selectedOrders.length > 0

  const distinctSellers = uniqueStrings(selectedOrders.map((order) => order.seller))
  const distinctProducts = uniqueStrings(selectedOrders.map((order) => order.product_name))
  const displayOrderNumbers = selectedOrders.map(
    (order) => order.order_numeric_id || order.order_id || order.id
  )

  const defaultBreakDate =
    formatDateForInput(selectedOrders[0]?.processed_date) ||
    new Date().toISOString().slice(0, 10)

  const defaultSourceName =
    distinctSellers.length === 1 ? distinctSellers[0] : ''

  const defaultProductName =
    distinctProducts.length === 1
      ? distinctProducts[0]
      : prefillFromWhatnot
      ? `Combined Whatnot Orders (${selectedOrders.length} orders)`
      : ''

  const defaultOrderNumber =
    selectedOrders.length === 1
      ? String(displayOrderNumbers[0] ?? '')
      : prefillFromWhatnot
      ? `MULTI: ${displayOrderNumbers.join(', ')}`
      : ''

  const defaultPurchasePrice = selectedOrders
    .reduce((sum, order) => sum + safeNumber(order.subtotal), 0)
    .toFixed(2)

  const defaultSalesTax = selectedOrders
    .reduce((sum, order) => sum + safeNumber(order.taxes), 0)
    .toFixed(2)

  const defaultShippingCost = selectedOrders
    .reduce((sum, order) => sum + safeNumber(order.shipping_price), 0)
    .toFixed(2)

  const defaultNotes = prefillFromWhatnot
    ? [
        'Drafted from selected Whatnot orders',
        distinctSellers.length ? `Seller: ${distinctSellers.join(', ')}` : null,
        `Selected Whatnot row IDs: ${selectedOrders.map((order) => order.id).join(', ')}`,
        `Order Numbers: ${displayOrderNumbers.join(', ')}`,
        distinctProducts.length ? `Products: ${distinctProducts.join(' | ')}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const hasAlreadyLinkedSelection = selectedOrders.some((order) => !!order.break_id)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Add Break</h1>
          <p className="mt-2 text-zinc-400">
            Record a break purchase for inventory, cost basis, and tax tracking.
          </p>
        </div>

        <Link
          href="/app/breaks"
          className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          Back to Breaks
        </Link>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {prefillFromWhatnot ? (
        <div className="mt-6 rounded-2xl border border-blue-900 bg-blue-950/20 p-5">
          <div className="text-sm text-blue-300">Prefilled from selected Whatnot orders</div>
          <div className="mt-2 text-zinc-100">
            This is the normal break-entry form, but it has been prefilled from your selected Whatnot orders. You can still edit anything before saving.
          </div>
          <div className="mt-3 text-sm text-zinc-300">
            Selected orders: {selectedOrders.length}
          </div>

          {hasAlreadyLinkedSelection ? (
            <div className="mt-3 rounded-xl border border-yellow-800 bg-yellow-950/30 px-3 py-2 text-sm text-yellow-300">
              One or more selected Whatnot orders are already linked to a break. Saving will be blocked until you remove those from the selection.
            </div>
          ) : null}
        </div>
      ) : null}

      {prefillFromWhatnot ? (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm font-medium text-zinc-200">Selected Whatnot Orders</div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Order #</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Seller</th>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-left font-medium">Subtotal</th>
                  <th className="px-4 py-3 text-left font-medium">Shipping</th>
                  <th className="px-4 py-3 text-left font-medium">Taxes</th>
                  <th className="px-4 py-3 text-left font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrders.map((order) => (
                  <tr key={order.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3">
                      {order.order_numeric_id ? `#${order.order_numeric_id}` : order.order_id || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {order.processed_date_display || order.processed_date || '—'}
                    </td>
                    <td className="px-4 py-3">{order.seller || '—'}</td>
                    <td className="px-4 py-3">{order.product_name || '—'}</td>
                    <td className="px-4 py-3">${safeNumber(order.subtotal).toFixed(2)}</td>
                    <td className="px-4 py-3">${safeNumber(order.shipping_price).toFixed(2)}</td>
                    <td className="px-4 py-3">${safeNumber(order.taxes).toFixed(2)}</td>
                    <td className="px-4 py-3">${safeNumber(order.total).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {order.break_id ? (
                        <span className="rounded-full border border-yellow-800 bg-yellow-950/40 px-2 py-1 text-xs text-yellow-300">
                          Already linked
                        </span>
                      ) : (
                        <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-1 text-xs text-blue-300">
                          Staging
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <form
        action={createBreakAction}
        className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2"
      >
        {selectedWhatnotOrderIds.map((id) => (
          <input key={id} type="hidden" name="whatnot_order_ids" value={id} />
        ))}

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Break Date</label>
          <input
            name="break_date"
            type="date"
            required
            defaultValue={defaultBreakDate}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Source / Breaker</label>
          <input
            name="source_name"
            type="text"
            required
            defaultValue={defaultSourceName}
            placeholder="Whatnot seller, eBay breaker, LCS, etc."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Product Name</label>
          <input
            name="product_name"
            type="text"
            required
            defaultValue={defaultProductName}
            placeholder="2024 Topps Chrome Hobby"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Order #</label>
          <input
            name="order_number"
            type="text"
            defaultValue={defaultOrderNumber}
            placeholder="Optional order / invoice / transaction number"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Cards Received</label>
          <input
            name="cards_received"
            type="number"
            min={0}
            defaultValue={0}
            placeholder="Total cards received in this break"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
          <p className="mt-1 text-xs text-zinc-500">
            This will auto-set the row count on the Add Cards screen.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Format Type</label>
          <input
            name="format_type"
            type="text"
            defaultValue={prefillFromWhatnot ? 'Whatnot import group' : ''}
            placeholder="PYT, Random Team, Personal Box, etc."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Teams / Spots</label>
          <input
            name="teams"
            type="text"
            placeholder="Mariners, Dodgers, Orioles"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Optional. Separate multiple teams or spots with commas.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Purchase Price</label>
          <input
            name="purchase_price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={prefillFromWhatnot ? defaultPurchasePrice : '0.00'}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Sales Tax</label>
          <input
            name="sales_tax"
            type="number"
            min={0}
            step="0.01"
            defaultValue={prefillFromWhatnot ? defaultSalesTax : '0.00'}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Shipping Cost</label>
          <input
            name="shipping_cost"
            type="number"
            min={0}
            step="0.01"
            defaultValue={prefillFromWhatnot ? defaultShippingCost : '0.00'}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Other Fees</label>
          <input
            name="other_fees"
            type="number"
            min={0}
            step="0.01"
            defaultValue="0.00"
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Allocation Method</label>
          <select
            name="allocation_method"
            defaultValue="equal_per_item"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          >
            <option value="equal_per_item">Equal Per Item</option>
            <option value="equal_per_sellable_item">Equal Per Sellable Item</option>
            <option value="manual">Manual</option>
            <option value="bulk_common_split">Bulk Common Split</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-sm font-medium text-zinc-200">What this records</div>
          <div className="mt-2 space-y-1 text-sm text-zinc-400">
            <p>Purchase source and date</p>
            <p>Total break cost for basis allocation</p>
            <p>Optional order number for receipt matching</p>
            <p>Total cards received for faster entry later</p>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-zinc-300">Notes</label>
          <textarea
            name="notes"
            rows={4}
            defaultValue={defaultNotes}
            placeholder="Optional remarks about this break purchase"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2 flex justify-end gap-3 pt-2">
          <Link
            href="/app/breaks"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Save Break
          </button>
        </div>
      </form>
    </div>
  )
}