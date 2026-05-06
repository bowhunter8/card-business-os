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

function buildOrderSelectionHref(orderIds: string[]) {
  if (orderIds.length === 0) return '/app/breaks/new'
  return `/app/breaks/new?whatnot_order_ids=${encodeURIComponent(orderIds.join(','))}`
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

  const selectedOrderIdSet = new Set(selectedOrders.map((order) => order.id))
  const activeSelectedWhatnotOrderIds = selectedWhatnotOrderIds.filter((id) =>
    selectedOrderIdSet.has(id)
  )

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
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Add Order</h1>
          <p className="app-subtitle">
            Enter the total items received, then save this order.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="submit"
            form="break-form"
            className="app-button-primary whitespace-nowrap"
          >
            Save Order
          </button>

          <Link
            href="/app/breaks"
            className="app-button"
          >
            Back to Orders
          </Link>
        </div>
      </div>

      {error ? (
        <div className="app-alert-error mt-4">
          {error}
        </div>
      ) : null}

      {hasAlreadyLinkedSelection ? (
        <div className="app-alert-warning mt-4">
          One or more selected orders are already linked to a combined order. Saving will be blocked until you remove those from the selection.
        </div>
      ) : null}

      <form
        id="break-form"
        action={createBreakAction}
        className="app-section mt-6"
      >
        {activeSelectedWhatnotOrderIds.map((id) => (
          <input key={id} type="hidden" name="whatnot_order_ids" value={id} />
        ))}

        <div className="rounded-2xl border border-emerald-700/70 bg-emerald-950/20 p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-emerald-200">Next step</div>
              <label className="mt-2 block text-base font-semibold text-zinc-100">
                Items Received
              </label>
              <input
                name="cards_received"
                type="number"
                min={0}
                defaultValue={0}
                placeholder="Total items received in this order"
                autoFocus
                className="app-input mt-2 text-lg font-semibold"
              />
              <p className="mt-2 text-xs text-zinc-400">
                Enter the total number of items from this order. This auto-sets the row count on the Add Items screen.
              </p>
            </div>

            <button
              type="submit"
              className="app-button-primary whitespace-nowrap"
            >
              Save Order
            </button>
          </div>
        </div>

        <details className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-200">
            Review / edit prefilled order details
            <span className="ml-2 text-xs font-normal text-zinc-500">
              Date, seller, order number, costs, teams, allocation, and notes
            </span>
          </summary>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Order Date</label>
              <input
                name="break_date"
                type="date"
                required
                defaultValue={defaultBreakDate}
                className="app-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Source/Vendor/Breaker</label>
              <input
                name="source_name"
                type="text"
                required
                defaultValue={defaultSourceName}
                placeholder="Whatnot breaker, eBay seller, LCS, etc."
                className="app-input"
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
                className="app-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Order #</label>
              <input
                name="order_number"
                type="text"
                defaultValue={defaultOrderNumber}
                placeholder="Optional order / invoice / transaction number"
                className="app-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Format Type</label>
              <input
                name="format_type"
                type="text"
                defaultValue={prefillFromWhatnot ? 'Whatnot import group' : ''}
                placeholder="PYT, Random Team, Personal Box, etc."
                className="app-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Teams / Spots</label>
              <input
                name="teams"
                type="text"
                placeholder="Mariners, Dodgers, Orioles"
                className="app-input"
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
                className="app-input"
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
                className="app-input"
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
                className="app-input"
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
                className="app-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Allocation Method</label>
              <select
                name="allocation_method"
                defaultValue="equal_per_item"
                className="app-select"
              >
                <option value="equal_per_item">Equal Per Item</option>
                <option value="equal_per_sellable_item">Equal Per Sellable Item</option>
                <option value="manual">Manual</option>
                <option value="bulk_common_split">Bulk Common Split</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-zinc-300">Notes</label>
              <textarea
                name="notes"
                rows={4}
                defaultValue={defaultNotes}
                placeholder="Optional remarks about this purchase"
                className="app-textarea"
              />
            </div>
          </div>
        </details>

        <div className="mt-4 flex justify-end gap-3 pt-2">
          <Link
            href="/app/breaks"
            className="app-button"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="app-button-primary"
          >
            Save Order
          </button>
        </div>
      </form>

      {prefillFromWhatnot ? (
        <div className="app-section mt-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-200">Selected Orders</div>
              <p className="mt-1 text-sm text-zinc-400">
                Review the selected orders below. Remove any order that should not be included before saving.
              </p>
            </div>

            <div className="text-sm text-zinc-400">
              {selectedOrders.length} selected
            </div>
          </div>

          <div className="app-table-wrap mt-4">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th">Order #</th>
                    <th className="app-th">Date</th>
                    <th className="app-th">Seller</th>
                    <th className="app-th">Product</th>
                    <th className="app-th">Subtotal</th>
                    <th className="app-th">Shipping</th>
                    <th className="app-th">Taxes</th>
                    <th className="app-th">Total</th>
                    <th className="app-th">Status</th>
                    <th className="app-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrders.map((order) => {
                    const remainingOrderIds = activeSelectedWhatnotOrderIds.filter(
                      (id) => id !== order.id
                    )

                    return (
                      <tr key={order.id} className="app-tr">
                        <td className="app-td">
                          {order.order_numeric_id ? `#${order.order_numeric_id}` : order.order_id || '—'}
                        </td>
                        <td className="app-td">
                          {order.processed_date_display || order.processed_date || '—'}
                        </td>
                        <td className="app-td">{order.seller || '—'}</td>
                        <td className="app-td">{order.product_name || '—'}</td>
                        <td className="app-td">${safeNumber(order.subtotal).toFixed(2)}</td>
                        <td className="app-td">${safeNumber(order.shipping_price).toFixed(2)}</td>
                        <td className="app-td">${safeNumber(order.taxes).toFixed(2)}</td>
                        <td className="app-td">${safeNumber(order.total).toFixed(2)}</td>
                        <td className="app-td">
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
                        <td className="app-td">
                          <Link
                            href={buildOrderSelectionHref(remainingOrderIds)}
                            className="app-button-danger"
                          >
                            Remove
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
