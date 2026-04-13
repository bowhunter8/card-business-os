import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

type InventoryRow = {
  id: string
  status: string | null
  available_quantity: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
  listed_price: number | null
  source_break_id: string | null
  quantity: number | null
  source_type: string | null
}

type BreakRow = {
  id: string
  total_cost: number | null
  reversed_at: string | null
  cards_received: number | null
}

type SaleRow = {
  gross_sale: number | null
  net_proceeds: number | null
  profit: number | null
  reversed_at: string | null
}

type WhatnotOrderRow = {
  break_id: string | null
  total: number | null
}

export default async function AppHomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [inventoryRes, breaksRes, salesRes, whatnotRes] = await Promise.all([
    supabase
      .from('inventory_items')
      .select(
        'id, status, available_quantity, cost_basis_total, estimated_value_total, listed_price, source_break_id, quantity, source_type',
        { count: 'exact' }
      )
      .eq('user_id', user.id),

    supabase
      .from('breaks')
      .select('id, total_cost, reversed_at, cards_received', { count: 'exact' })
      .eq('user_id', user.id),

    supabase
      .from('sales')
      .select('gross_sale, net_proceeds, profit, reversed_at', { count: 'exact' })
      .eq('user_id', user.id),

    supabase
      .from('whatnot_orders')
      .select('break_id, total', { count: 'exact' })
      .eq('user_id', user.id),
  ])

  const inventory = (inventoryRes.data ?? []) as InventoryRow[]
  const breaks = (breaksRes.data ?? []) as BreakRow[]
  const sales = (salesRes.data ?? []) as SaleRow[]
  const whatnotOrders = (whatnotRes.data ?? []) as WhatnotOrderRow[]

  let availableUnits = 0
  let inventoryCost = 0
  let inventoryEstimatedValue = 0
  let listedItemCount = 0
  let listedItemTotal = 0

  const breakEnteredMap = new Map<string, number>()

  for (const item of inventory) {
    availableUnits += Number(item.available_quantity ?? 0)
    inventoryCost += Number(item.cost_basis_total ?? 0)
    inventoryEstimatedValue += Number(item.estimated_value_total ?? 0)

    const normalizedStatus = String(item.status ?? '').toLowerCase()
    if (normalizedStatus === 'listed') {
      listedItemCount += 1
      listedItemTotal += Number(
        item.listed_price ?? item.estimated_value_total ?? 0
      )
    }

    if (item.source_type === 'break' && item.source_break_id) {
      breakEnteredMap.set(
        item.source_break_id,
        (breakEnteredMap.get(item.source_break_id) ?? 0) +
          Number(item.quantity ?? 0)
      )
    }
  }

  let breakCount = 0
  let breakSpend = 0
  let openBreakCount = 0
  let incompleteBreaksCount = 0
  let noCardsDeclaredBreaksCount = 0

  for (const breakRow of breaks) {
    if (breakRow.reversed_at) continue

    breakCount += 1
    breakSpend += Number(breakRow.total_cost ?? 0)

    const received = Number(breakRow.cards_received ?? 0)
    const entered = breakEnteredMap.get(breakRow.id) ?? 0

    if (received <= 0) {
      openBreakCount += 1
      noCardsDeclaredBreaksCount += 1
      continue
    }

    if (entered < received) {
      openBreakCount += 1
      incompleteBreaksCount += 1
    }
  }

  let saleCount = 0
  let grossSales = 0
  let netSales = 0
  let totalProfit = 0

  for (const sale of sales) {
    if (sale.reversed_at) continue

    saleCount += 1
    grossSales += Number(sale.gross_sale ?? 0)
    netSales += Number(sale.net_proceeds ?? 0)
    totalProfit += Number(sale.profit ?? 0)
  }

  let unassignedWhatnotOrdersCount = 0
  let whatnotUnassignedTotal = 0

  for (const order of whatnotOrders) {
    if (!order.break_id) {
      unassignedWhatnotOrdersCount += 1
      whatnotUnassignedTotal += Number(order.total ?? 0)
    }
  }

  const inventoryCount = inventoryRes.count ?? inventory.length
  const whatnotCount = whatnotRes.count ?? whatnotOrders.length

  return (
    <div className="max-w-7xl space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-zinc-400">
            Overview of your breaks, inventory, sales, and imported Whatnot orders.
          </p>
        </div>

        <div className="text-sm text-zinc-500">
          Signed in as <span className="text-zinc-300">{user.email}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/app/inventory"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Inventory Items</div>
          <div className="mt-2 text-3xl font-semibold">{inventoryCount}</div>
          <div className="mt-2 text-sm text-zinc-500">
            {availableUnits} unit(s) available
          </div>
        </Link>

        <Link
          href="/app/breaks?q=active"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Active Breaks</div>
          <div className="mt-2 text-3xl font-semibold">{breakCount}</div>
          <div className="mt-2 text-sm text-zinc-500">
            Total spend {money(breakSpend)}
          </div>
        </Link>

        <Link
          href="/app/sales?q=active"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Active Sales</div>
          <div className="mt-2 text-3xl font-semibold">{saleCount}</div>
          <div className="mt-2 text-sm text-zinc-500">
            Gross sales {money(grossSales)}
          </div>
        </Link>

        <Link
          href="/app/whatnot-orders?q=unassigned"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Whatnot Orders</div>
          <div className="mt-2 text-3xl font-semibold">{whatnotCount}</div>
          <div className="mt-2 text-sm text-zinc-500">
            {unassignedWhatnotOrdersCount} unassigned
          </div>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/app/inventory"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Inventory Cost Basis</div>
          <div className="mt-2 text-3xl font-semibold">{money(inventoryCost)}</div>
        </Link>

        <Link
          href="/app/inventory"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Estimated Inventory Value</div>
          <div className="mt-2 text-3xl font-semibold">
            {money(inventoryEstimatedValue)}
          </div>
        </Link>

        <Link
          href="/app/sales?q=active"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Net Sales</div>
          <div className="mt-2 text-3xl font-semibold">{money(netSales)}</div>
        </Link>

        <Link
          href="/app/sales?q=active"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Total Profit</div>
          <div className="mt-2 text-3xl font-semibold">{money(totalProfit)}</div>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Link
          href="/app/breaks?q=open"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:bg-zinc-800"
        >
          <h2 className="text-xl font-semibold">Open Breaks</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">Open Break Count</div>
              <div className="mt-2 text-2xl font-semibold">{openBreakCount}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">Open Breakdown</div>
              <div className="mt-2 space-y-1 text-sm text-zinc-300">
                <div>{incompleteBreaksCount} incomplete</div>
                <div>{noCardsDeclaredBreaksCount} not started</div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-zinc-400">
            Click to view breaks that still need card entry.
          </div>
        </Link>

        <Link
          href="/app/inventory?q=listed"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:bg-zinc-800"
        >
          <h2 className="text-xl font-semibold">Listed Items</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">Listed Count</div>
              <div className="mt-2 text-2xl font-semibold">{listedItemCount}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">Listed Total</div>
              <div className="mt-2 text-2xl font-semibold">
                {money(listedItemTotal)}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-zinc-400">
            Click to view listed inventory.
          </div>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Workflow</h2>
          <div className="mt-4 space-y-3 text-sm text-zinc-400">
            <p>
              Use <span className="text-zinc-200">Breaks</span> to create and manage break purchases.
            </p>
            <p>
              Use <span className="text-zinc-200">Inventory</span> to view items, sell them, and reverse sales if needed.
            </p>
            <p>
              Use <span className="text-zinc-200">Utilities</span> for shipping profiles, imports, exports, Whatnot order staging, and tax reports.
            </p>
          </div>
        </div>

        <Link
          href="/app/whatnot-orders?q=unassigned"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:bg-zinc-800"
        >
          <h2 className="text-xl font-semibold">Whatnot Staging</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">Unassigned Orders</div>
              <div className="mt-2 text-2xl font-semibold">
                {unassignedWhatnotOrdersCount}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm text-zinc-400">Unassigned Total</div>
              <div className="mt-2 text-2xl font-semibold">
                {money(whatnotUnassignedTotal)}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-zinc-400">
            Click to view unassigned Whatnot orders.
          </div>
        </Link>
      </div>
    </div>
  )
}