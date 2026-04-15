import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { rollbackBreakAction } from '@/app/actions/break-safety'
import {
  bulkDeleteInventoryItemsAction,
  deleteInventoryItemAction,
} from '@/app/actions/breaks'

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function percent(value: number) {
  return `${value.toFixed(1)}%`
}

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  purchase_price: number | null
  sales_tax: number | null
  shipping_cost: number | null
  other_fees: number | null
  total_cost: number | null
  allocation_method: string | null
  notes: string | null
  order_number?: string | null
  cards_received?: number | null
  created_at?: string
  reversed_at?: string | null
  reversal_reason?: string | null
}

type BreakCardRow = {
  id: string
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
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
  status: string | null
  item_type: string | null
  notes: string | null
  created_at?: string
}

type SaleRow = {
  id: string
  inventory_item_id: string
  quantity_sold: number | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  reversed_at?: string | null
}

type LinkedWhatnotOrderRow = {
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
}

type CardSortKey =
  | 'created_at'
  | 'status'
  | 'item_type'
  | 'card'
  | 'quantity'
  | 'available_quantity'
  | 'cost_basis_unit'
  | 'cost_basis_total'
  | 'estimated_value_total'

type SortDir = 'asc' | 'desc'

function getBreakStatus(projectedROI: number, reversedAt?: string | null) {
  if (reversedAt) return 'Reversed'
  if (projectedROI >= 100) return 'Smash'
  if (projectedROI > 0) return 'Profitable'
  if (projectedROI === 0) return 'Break-even'
  return 'Losing'
}

function buildDisplay(card: BreakCardRow) {
  const parts = [
    card.year,
    card.set_name,
    card.player_name,
    card.card_number ? `#${card.card_number}` : null,
    card.notes,
  ]

  return parts.filter(Boolean).join(' • ')
}

function getCardSortValue(card: BreakCardRow, key: CardSortKey) {
  switch (key) {
    case 'created_at':
      return card.created_at || ''
    case 'status':
      return card.status || ''
    case 'item_type':
      return card.item_type || ''
    case 'card':
      return buildDisplay(card) || card.title || ''
    case 'quantity':
      return Number(card.quantity ?? 0)
    case 'available_quantity':
      return Number(card.available_quantity ?? 0)
    case 'cost_basis_unit':
      return Number(card.cost_basis_unit ?? 0)
    case 'cost_basis_total':
      return Number(card.cost_basis_total ?? 0)
    case 'estimated_value_total':
      return Number(card.estimated_value_total ?? 0)
    default:
      return ''
  }
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function sortBreakCards(cards: BreakCardRow[], sortKey: CardSortKey, sortDir: SortDir) {
  return [...cards].sort((left, right) => {
    const result = compareValues(
      getCardSortValue(left, sortKey),
      getCardSortValue(right, sortKey)
    )

    return sortDir === 'asc' ? result : -result
  })
}

function getNextSortDir(currentKey: CardSortKey, currentDir: SortDir, nextKey: CardSortKey): SortDir {
  if (currentKey !== nextKey) return nextKey === 'created_at' ? 'desc' : 'asc'
  return currentDir === 'asc' ? 'desc' : 'asc'
}

function getSortIndicator(currentKey: CardSortKey, currentDir: SortDir, key: CardSortKey) {
  if (currentKey !== key) return '↕'
  return currentDir === 'asc' ? '↑' : '↓'
}

function buildBreakDetailQueryString(options: {
  cardsSortKey: CardSortKey
  cardsSortDir: SortDir
  confirmDelete?: string | null
  inventoryItemIds?: string[]
}) {
  const params = new URLSearchParams()
  params.set('cards_sort', options.cardsSortKey)
  params.set('cards_dir', options.cardsSortDir)

  if (options.confirmDelete) {
    params.set('confirm_delete', options.confirmDelete)
  }

  for (const id of options.inventoryItemIds ?? []) {
    params.append('inventory_item_ids', id)
  }

  return params.toString()
}

function SectionLoading({
  title,
  rows = 3,
}: {
  title: string
  rows?: number
}) {
  return (
    <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 animate-pulse">
      <div className="h-7 w-56 rounded bg-zinc-800" />
      <div className="mt-2 h-4 w-72 rounded bg-zinc-900" />

      <div className="mt-6 grid gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={`${title}-${i}`}
            className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
          >
            <div className="h-5 w-48 rounded bg-zinc-800" />
            <div className="mt-3 h-4 w-64 rounded bg-zinc-900" />
            <div className="mt-2 h-4 w-40 rounded bg-zinc-900" />
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`metrics-a-${i}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-28 rounded bg-zinc-800" />
            <div className="mt-4 h-8 w-20 rounded bg-zinc-800" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`metrics-b-${i}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-28 rounded bg-zinc-800" />
            <div className="mt-4 h-8 w-24 rounded bg-zinc-800" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`metrics-c-${i}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-28 rounded bg-zinc-800" />
            <div className="mt-4 h-8 w-24 rounded bg-zinc-800" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`metrics-d-${i}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-28 rounded bg-zinc-800" />
            <div className="mt-4 h-8 w-24 rounded bg-zinc-800" />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="h-4 w-40 rounded bg-zinc-800" />
        <div className="mt-4 h-6 w-72 rounded bg-zinc-800" />
      </div>
    </div>
  )
}

function BreakCardSortHeader({
  breakId,
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
}: {
  breakId: string
  label: string
  sortKey: CardSortKey
  currentSortKey: CardSortKey
  currentSortDir: SortDir
}) {
  const params = new URLSearchParams()
  params.set('cards_sort', sortKey)
  params.set('cards_dir', getNextSortDir(currentSortKey, currentSortDir, sortKey))

  return (
    <Link
      href={`/app/breaks/${breakId}?${params.toString()}`}
      scroll={false}
      className="inline-flex items-center gap-1 hover:text-zinc-100"
    >
      <span>{label}</span>
      <span className="text-xs">
        {getSortIndicator(currentSortKey, currentSortDir, sortKey)}
      </span>
    </Link>
  )
}

async function LinkedWhatnotOrdersSection({
  breakId,
  userId,
}: {
  breakId: string
  userId: string
}) {
  const supabase = await createClient()

  const linkedWhatnotResponse = await supabase
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
      total
    `)
    .eq('user_id', userId)
    .eq('break_id', breakId)
    .order('processed_date', { ascending: false })

  const linkedWhatnotOrders =
    (linkedWhatnotResponse.data ?? []) as LinkedWhatnotOrderRow[]

  const linkedWhatnotTotal = linkedWhatnotOrders.reduce(
    (sum, order) => sum + Number(order.total ?? 0),
    0
  )

  return (
    <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Linked Whatnot Orders</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Orders grouped into this break from Whatnot imports.
          </p>
        </div>

        <div className="text-sm text-zinc-400">
          {linkedWhatnotOrders.length} linked • {money(linkedWhatnotTotal)}
        </div>
      </div>

      {linkedWhatnotOrders.length === 0 ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
          No Whatnot orders linked to this break.
        </div>
      ) : (
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
              </tr>
            </thead>
            <tbody>
              {linkedWhatnotOrders.map((order) => (
                <tr key={order.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">
                    {order.order_numeric_id ? `#${order.order_numeric_id}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {order.processed_date_display ||
                      (order.processed_date
                        ? new Date(order.processed_date).toLocaleDateString('en-US')
                        : '—')}
                  </td>
                  <td className="px-4 py-3">{order.seller || '—'}</td>
                  <td className="px-4 py-3">{order.product_name || '—'}</td>
                  <td className="px-4 py-3">{money(order.subtotal)}</td>
                  <td className="px-4 py-3">{money(order.shipping_price)}</td>
                  <td className="px-4 py-3">{money(order.taxes)}</td>
                  <td className="px-4 py-3">{money(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

async function BreakCardsAndMetricsSection({
  breakId,
  userId,
  breakCost,
  declaredCardsReceived,
  reversedAt,
  cardsSortKey,
  cardsSortDir,
  confirmDelete,
  selectedInventoryItemIds,
}: {
  breakId: string
  userId: string
  breakCost: number
  declaredCardsReceived: number
  reversedAt?: string | null
  cardsSortKey: CardSortKey
  cardsSortDir: SortDir
  confirmDelete?: string
  selectedInventoryItemIds: string[]
}) {
  const supabase = await createClient()

  const cardsResponse = await supabase
    .from('inventory_items')
    .select(`
      id,
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
      cost_basis_unit,
      cost_basis_total,
      estimated_value_total,
      status,
      item_type,
      notes,
      created_at
    `)
    .eq('user_id', userId)
    .eq('source_type', 'break')
    .eq('source_break_id', breakId)
    .order('created_at', { ascending: false })

  const rawBreakCards = (cardsResponse.data ?? []) as BreakCardRow[]
  const breakCards = sortBreakCards(rawBreakCards, cardsSortKey, cardsSortDir)
  const cardsError = cardsResponse.error
  const breakCardIds = rawBreakCards.map((card) => card.id)

  let breakSales: SaleRow[] = []

  if (breakCardIds.length > 0) {
    const salesResponse = await supabase
      .from('sales')
      .select(`
        id,
        inventory_item_id,
        quantity_sold,
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        net_proceeds,
        cost_of_goods_sold,
        profit,
        reversed_at
      `)
      .eq('user_id', userId)
      .in('inventory_item_id', breakCardIds)

    breakSales = (salesResponse.data ?? []) as SaleRow[]
  }

  const activeSaleItemIds = new Set(
    breakSales
      .filter((sale) => !sale.reversed_at)
      .map((sale) => String(sale.inventory_item_id))
  )

  let cardsEntered = 0
  let availableCards = 0
  let totalAllocatedCost = 0
  let totalEstimatedValue = 0
  let remainingEstimatedValue = 0

  for (const card of rawBreakCards) {
    const qty = Number(card.quantity ?? 0)
    const avail = Number(card.available_quantity ?? 0)
    const costTotal = Number(card.cost_basis_total ?? 0)
    const estTotal = Number(card.estimated_value_total ?? 0)

    cardsEntered += qty
    availableCards += avail
    totalAllocatedCost += costTotal
    totalEstimatedValue += estTotal

    if (qty > 0 && avail > 0 && estTotal > 0) {
      const estPerUnit = estTotal / qty
      remainingEstimatedValue += estPerUnit * avail
    }
  }

  const remainingToEnter = Math.max(0, declaredCardsReceived - cardsEntered)

  let totalSales = 0
  let totalFees = 0
  let totalNetProceeds = 0
  let realizedCOGS = 0
  let realizedProfit = 0

  for (const sale of breakSales) {
    if (sale.reversed_at) continue

    totalSales += Number(sale.gross_sale ?? 0)
    totalFees +=
      Number(sale.platform_fees ?? 0) +
      Number(sale.shipping_cost ?? 0) +
      Number(sale.other_costs ?? 0)
    totalNetProceeds += Number(sale.net_proceeds ?? 0)
    realizedCOGS += Number(sale.cost_of_goods_sold ?? 0)
    realizedProfit += Number(sale.profit ?? 0)
  }

  const breakROI = breakCost > 0 ? (realizedProfit / breakCost) * 100 : 0
  const cardsSold = cardsEntered - availableCards
  const projectedProfit = realizedProfit + remainingEstimatedValue
  const projectedROI = breakCost > 0 ? (projectedProfit / breakCost) * 100 : 0
  const breakStatus = getBreakStatus(projectedROI, reversedAt)
  const bulkSelectionFormId = `bulk-select-break-cards-${breakId}`

  const deletableSelectedCards = rawBreakCards.filter(
    (card) =>
      selectedInventoryItemIds.includes(card.id) && !activeSaleItemIds.has(card.id)
  )

  const singleDeleteCard =
    confirmDelete && confirmDelete !== 'bulk'
      ? rawBreakCards.find((card) => card.id === confirmDelete) ?? null
      : null

  const showBulkConfirm = confirmDelete === 'bulk'
  const showSingleConfirm =
    Boolean(singleDeleteCard) &&
    !activeSaleItemIds.has(String(singleDeleteCard?.id ?? ''))

  const cancelConfirmHref = `/app/breaks/${breakId}?${buildBreakDetailQueryString({
    cardsSortKey,
    cardsSortDir,
  })}`

  return (
    <>
      {cardsError ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading break cards: {cardsError.message}
        </div>
      ) : null}

      {showBulkConfirm ? (
        <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/30 p-5">
          <div className="text-sm text-red-300">Confirm Bulk Delete</div>
          <div className="mt-2 text-lg font-semibold text-red-100">
            Are you sure you want to delete these selected items?
          </div>

          {deletableSelectedCards.length === 0 ? (
            <div className="mt-3 text-sm text-red-200">
              No deletable items were selected. Select one or more cards, then click Delete Selected again.
            </div>
          ) : (
            <>
              <div className="mt-3 text-sm text-red-200">
                {deletableSelectedCards.length} item(s) will be deleted from this break.
              </div>

              <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-red-900/60 bg-zinc-950 p-3">
                <div className="space-y-2 text-sm text-zinc-200">
                  {deletableSelectedCards.map((card) => (
                    <div key={card.id}>
                      {buildDisplay(card) || card.title || 'Untitled item'}
                    </div>
                  ))}
                </div>
              </div>

              <form action={bulkDeleteInventoryItemsAction} className="mt-4 flex flex-wrap gap-3">
                <input type="hidden" name="return_to" value="break" />
                <input type="hidden" name="break_id" value={breakId} />
                {deletableSelectedCards.map((card) => (
                  <input
                    key={card.id}
                    type="hidden"
                    name="inventory_item_ids"
                    value={card.id}
                  />
                ))}

                <button
                  type="submit"
                  className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-200 hover:bg-red-950"
                >
                  Yes, Delete Selected
                </button>

                <Link
                  href={cancelConfirmHref}
                  scroll={false}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
                >
                  Cancel
                </Link>
              </form>
            </>
          )}
        </div>
      ) : null}

      {showSingleConfirm && singleDeleteCard ? (
        <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/30 p-5">
          <div className="text-sm text-red-300">Confirm Delete</div>
          <div className="mt-2 text-lg font-semibold text-red-100">
            Are you sure you want to delete this item?
          </div>
          <div className="mt-3 rounded-xl border border-red-900/60 bg-zinc-950 p-3 text-sm text-zinc-200">
            {buildDisplay(singleDeleteCard) || singleDeleteCard.title || 'Untitled item'}
          </div>

          <form action={deleteInventoryItemAction} className="mt-4 flex flex-wrap gap-3">
            <input type="hidden" name="inventory_item_id" value={singleDeleteCard.id} />
            <input type="hidden" name="return_to" value="break" />
            <input type="hidden" name="break_id" value={breakId} />
            <button
              type="submit"
              className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-200 hover:bg-red-950"
            >
              Yes, Delete Item
            </button>

            <Link
              href={cancelConfirmHref}
              scroll={false}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
            >
              Cancel
            </Link>
          </form>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Cards Received</div>
          <div className="mt-2 text-2xl font-semibold">{declaredCardsReceived}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Cards Entered</div>
          <div className="mt-2 text-2xl font-semibold">{cardsEntered}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Remaining To Enter</div>
          <div className="mt-2 text-2xl font-semibold">{remainingToEnter}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Cards Available</div>
          <div className="mt-2 text-2xl font-semibold">{availableCards}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Allocated Cost</div>
          <div className="mt-2 text-2xl font-semibold">
            {money(totalAllocatedCost)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Estimated Value</div>
          <div className="mt-2 text-2xl font-semibold">
            {money(totalEstimatedValue)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Cards Sold</div>
          <div className="mt-2 text-2xl font-semibold">{cardsSold}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">ROI</div>
          <div className="mt-2 text-2xl font-semibold">{percent(breakROI)}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Total Sales</div>
          <div className="mt-2 text-2xl font-semibold">{money(totalSales)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Total Fees</div>
          <div className="mt-2 text-2xl font-semibold">{money(totalFees)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Net Proceeds</div>
          <div className="mt-2 text-2xl font-semibold">{money(totalNetProceeds)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Realized COGS</div>
          <div className="mt-2 text-2xl font-semibold">{money(realizedCOGS)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Net Profit</div>
          <div className="mt-2 text-2xl font-semibold">{money(realizedProfit)}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Remaining Value</div>
          <div className="mt-2 text-2xl font-semibold">{money(remainingEstimatedValue)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Projected Profit</div>
          <div className="mt-2 text-2xl font-semibold">{money(projectedProfit)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Projected ROI</div>
          <div className="mt-2 text-2xl font-semibold">{percent(projectedROI)}</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="text-sm text-zinc-400">Break Status</div>
        <div className="mt-2 text-lg font-semibold">{breakStatus}</div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="text-sm text-zinc-400">Unsold Cards Outlook</div>
        <div className="mt-2 text-lg font-semibold">
          {availableCards > 0
            ? `${availableCards} card(s) still contribute upside`
            : 'No remaining cards from this break'}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex flex-col gap-4 border-b border-zinc-800 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Cards From This Break</h2>
            {!reversedAt ? (
              <div className="mt-1 text-sm text-zinc-400">
                Select multiple cards with the checkboxes, then bulk delete the selected rows.
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            {!reversedAt ? (
              <>
                <button
                  type="submit"
                  form={bulkSelectionFormId}
                  className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950"
                >
                  Delete Selected
                </button>

                <Link
                  href={`/app/breaks/${breakId}/add-cards`}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                >
                  Add More Cards
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {!reversedAt ? (
          <form
            id={bulkSelectionFormId}
            method="get"
            action={`/app/breaks/${breakId}`}
          >
            <input type="hidden" name="cards_sort" value={cardsSortKey} />
            <input type="hidden" name="cards_dir" value={cardsSortDir} />
            <input type="hidden" name="confirm_delete" value="bulk" />
          </form>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                {!reversedAt ? (
                  <th className="px-4 py-3 text-left font-medium">Select</th>
                ) : null}
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Status"
                    sortKey="status"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Type"
                    sortKey="item_type"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Card / Lot"
                    sortKey="card"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Qty"
                    sortKey="quantity"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Avail"
                    sortKey="available_quantity"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Unit Cost"
                    sortKey="cost_basis_unit"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Total Cost"
                    sortKey="cost_basis_total"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <BreakCardSortHeader
                    breakId={breakId}
                    label="Est. Value"
                    sortKey="estimated_value_total"
                    currentSortKey={cardsSortKey}
                    currentSortDir={cardsSortDir}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {breakCards.map((card) => {
                const canDelete = !activeSaleItemIds.has(card.id)

                const singleDeleteHref = `/app/breaks/${breakId}?${buildBreakDetailQueryString({
                  cardsSortKey,
                  cardsSortDir,
                  confirmDelete: card.id,
                })}`

                return (
                  <tr key={card.id} className="border-t border-zinc-800">
                    {!reversedAt ? (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          name="inventory_item_ids"
                          value={card.id}
                          form={bulkSelectionFormId}
                          defaultChecked={selectedInventoryItemIds.includes(card.id)}
                          disabled={!canDelete}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-white disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3 capitalize">
                      {(card.status || '—').replaceAll('_', ' ')}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {(card.item_type || '—').replaceAll('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/inventory/${card.id}`}
                        className="font-medium hover:underline"
                      >
                        {buildDisplay(card) || card.title || 'Untitled item'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{card.quantity ?? 0}</td>
                    <td className="px-4 py-3">{card.available_quantity ?? 0}</td>
                    <td className="px-4 py-3">{money(card.cost_basis_unit)}</td>
                    <td className="px-4 py-3">{money(card.cost_basis_total)}</td>
                    <td className="px-4 py-3">{money(card.estimated_value_total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/app/inventory/${card.id}`}
                          className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                        >
                          Quick Edit
                        </Link>
                        {!reversedAt ? (
                          <>
                            <Link
                              href={`/app/inventory/${card.id}/edit?from=break&break_id=${breakId}`}
                              className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                            >
                              Full Edit
                            </Link>

                            {canDelete ? (
                              <Link
                                href={singleDeleteHref}
                                scroll={false}
                                className="inline-flex rounded-lg border border-red-800 bg-red-950/40 px-3 py-1.5 text-red-200 hover:bg-red-950"
                              >
                                Delete
                              </Link>
                            ) : (
                              <span className="inline-flex rounded-lg border border-yellow-800 bg-yellow-950/30 px-3 py-1.5 text-yellow-200">
                                Has Sale
                              </span>
                            )}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {breakCards.length === 0 && (
                <tr>
                  <td colSpan={reversedAt ? 9 : 10} className="px-4 py-10 text-center text-zinc-400">
                    No cards have been added from this break yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!reversedAt ? (
          <div className="border-t border-zinc-800 px-5 py-4">
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="submit"
                form={bulkSelectionFormId}
                className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950"
              >
                Delete Selected
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

export default async function BreakDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    error?: string
    success?: string
    cards_sort?: string
    cards_dir?: string
    confirm_delete?: string
    inventory_item_ids?: string | string[]
  }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : undefined
  const errorMessage = query?.error
  const successMessage = query?.success
  const confirmDelete = String(query?.confirm_delete ?? '').trim() || undefined

  const requestedCardsSort = String(query?.cards_sort ?? 'created_at').trim() as CardSortKey
  const requestedCardsDir = String(query?.cards_dir ?? 'desc').trim() as SortDir

  const cardsSortKey: CardSortKey = [
    'created_at',
    'status',
    'item_type',
    'card',
    'quantity',
    'available_quantity',
    'cost_basis_unit',
    'cost_basis_total',
    'estimated_value_total',
  ].includes(requestedCardsSort)
    ? requestedCardsSort
    : 'created_at'

  const cardsSortDir: SortDir = requestedCardsDir === 'asc' ? 'asc' : 'desc'

  const selectedInventoryItemIds = Array.isArray(query?.inventory_item_ids)
    ? query?.inventory_item_ids.map((value) => String(value))
    : query?.inventory_item_ids
      ? [String(query.inventory_item_ids)]
      : []

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const response = await supabase
    .from('breaks')
    .select(`
      id,
      break_date,
      source_name,
      product_name,
      format_type,
      teams,
      purchase_price,
      sales_tax,
      shipping_cost,
      other_fees,
      total_cost,
      allocation_method,
      notes,
      order_number,
      cards_received,
      created_at,
      reversed_at,
      reversal_reason
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (response.error || !response.data) {
    notFound()
  }

  const item = response.data as BreakRow

  const breakCost = Number(item.total_cost ?? 0)
  const declaredCardsReceived = Number(item.cards_received ?? 0)

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Break Details</h1>
          <p className="mt-2 text-zinc-400">
            {item.product_name || 'Untitled break'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/app/breaks"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            All Breaks
          </Link>

          {!item.reversed_at ? (
            <>
              <Link
                href={`/app/breaks/${item.id}/edit`}
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Edit Break
              </Link>
              <Link
                href={`/app/breaks/${item.id}/add-cards`}
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Add Cards
              </Link>
              <Link
                href="/app/breaks/new"
                className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
              >
                Add Another Break
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      {item.reversed_at ? (
        <div className="mt-6 rounded-2xl border border-yellow-900 bg-yellow-950/30 p-5">
          <div className="text-sm text-yellow-300">Break Reversed</div>
          <div className="mt-2 text-lg font-semibold text-yellow-100">
            This break has been rolled back and should be treated as inactive.
          </div>
          <div className="mt-2 text-sm text-yellow-200">
            Reversed at: {new Date(item.reversed_at).toLocaleString()}
          </div>
          {item.reversal_reason ? (
            <div className="mt-2 whitespace-pre-wrap text-sm text-yellow-200">
              Reason: {item.reversal_reason}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm text-zinc-400">Safety</div>
              <div className="mt-2 text-lg font-semibold">Roll back this break</div>
              <div className="mt-2 max-w-2xl text-sm text-zinc-400">
                This removes inventory created from this break, unlinks related Whatnot orders, and marks the break as reversed.
                Rollback is blocked if any active sale exists from an item in this break.
              </div>
            </div>

            <form action={rollbackBreakAction} className="w-full max-w-md space-y-3">
              <input type="hidden" name="break_id" value={item.id} />
              <textarea
                name="reversal_reason"
                rows={3}
                placeholder="Optional rollback reason"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
              <button
                type="submit"
                disabled={!!item.reversed_at}
                className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-2 text-red-200 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Roll Back Break
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Break Date</div>
          <div className="mt-2 text-xl font-semibold">{item.break_date}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Source / Breaker</div>
          <div className="mt-2 text-xl font-semibold">
            {item.source_name || '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Order #</div>
          <div className="mt-2 text-xl font-semibold">
            {item.order_number || '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Format</div>
          <div className="mt-2 text-xl font-semibold">
            {item.format_type || '—'}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Purchase Price</div>
          <div className="mt-2 text-2xl font-semibold">
            {money(item.purchase_price)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Sales Tax</div>
          <div className="mt-2 text-2xl font-semibold">
            {money(item.sales_tax)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Shipping</div>
          <div className="mt-2 text-2xl font-semibold">
            {money(item.shipping_cost)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Other Fees</div>
          <div className="mt-2 text-2xl font-semibold">
            {money(item.other_fees)}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Total Cost</div>
          <div className="mt-2 text-3xl font-semibold">{money(item.total_cost)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Allocation Method</div>
          <div className="mt-2 text-xl font-semibold capitalize">
            {(item.allocation_method || '—').replaceAll('_', ' ')}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Teams / Spots</div>
          <div className="mt-2 text-xl font-semibold">
            {item.teams && item.teams.length ? item.teams.join(', ') : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Created</div>
          <div className="mt-2 text-xl font-semibold">
            {item.created_at
              ? new Date(item.created_at).toLocaleDateString('en-US')
              : '—'}
          </div>
        </div>
      </div>

      {item.notes ? (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Notes</div>
          <div className="mt-2 whitespace-pre-wrap">{item.notes}</div>
        </div>
      ) : null}

      <Suspense fallback={<SectionLoading title="Linked Whatnot Orders" rows={2} />}>
        <LinkedWhatnotOrdersSection breakId={item.id} userId={user.id} />
      </Suspense>

      <Suspense fallback={<MetricsLoading />}>
        <BreakCardsAndMetricsSection
          breakId={item.id}
          userId={user.id}
          breakCost={breakCost}
          declaredCardsReceived={declaredCardsReceived}
          reversedAt={item.reversed_at}
          cardsSortKey={cardsSortKey}
          cardsSortDir={cardsSortDir}
          confirmDelete={confirmDelete}
          selectedInventoryItemIds={selectedInventoryItemIds}
        />
      </Suspense>
    </div>
  )
}