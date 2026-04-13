import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

type BreakRow = {
  id: string
  total_cost: number | null
  reversed_at: string | null
  cards_received: number | null
}

type InventoryBreakRow = {
  source_break_id: string | null
  quantity: number | null
}

export default async function AppHomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [inventoryRes, breaksRes, salesRes, whatnotRes, breakInventoryRes] =
    await Promise.all([
      supabase
        .from('inventory_items')
        .select(
          'id, status, available_quantity, cost_basis_total, estimated_value_total, listed_price',
          { count: 'exact' }
        )
        .eq('user_id', user.id),

      supabase
        .from('breaks')
        .select('id, total_cost, reversed_at, cards_received', { count: 'exact' })
        .eq('user_id', user.id),

      supabase
        .from('sales')
        .select('id, gross_sale, net_proceeds, profit, reversed_at', {
          count: 'exact',
        })
        .eq('user_id', user.id),

      supabase
        .from('whatnot_orders')
        .select('id, break_id, total', { count: 'exact' })
        .eq('user_id', user.id),

      supabase
        .from('inventory_items')
        .select('source_break_id, quantity')
        .eq('user_id', user.id)
        .eq('source_type', 'break'),
    ])

  const inventory = inventoryRes.data ?? []
  const breaks = (breaksRes.data ?? []) as BreakRow[]
  const sales = salesRes.data ?? []
  const whatnotOrders = whatnotRes.data ?? []
  const breakInventoryRows = (breakInventoryRes.data ?? []) as InventoryBreakRow[]

  const activeBreaks = breaks.filter((b) => !b.reversed_at)
  const activeSales = sales.filter((s) => !s.reversed_at)
  const unassignedWhatnotOrders = whatnotOrders.filter((o) => !o.break_id)

  const breakEnteredMap = new Map<string, number>()
  for (const row of breakInventoryRows) {
    const breakId = row.source_break_id
    if (!breakId) continue
    breakEnteredMap.set(
      breakId,
      (breakEnteredMap.get(breakId) ?? 0) + Number(row.quantity ?? 0)
    )
  }

  const openBreaks = activeBreaks.filter((b) => {
    const received = Number(b.cards_received ?? 0)
    const entered = breakEnteredMap.get(b.id) ?? 0
    if (received <= 0) return true
    return entered < received
  })

  const openBreakCount = openBreaks.length
  const incompleteBreaks = activeBreaks.filter((b) => {
    const received = Number(b.cards_received ?? 0)
    if (received <= 0) return false
    const entered = breakEnteredMap.get(b.id) ?? 0
    return entered < received
  })
  const noCardsDeclaredBreaks = activeBreaks.filter(
    (b) => Number(b.cards_received ?? 0) <= 0
  )

  const inventoryCount = inventoryRes.count ?? inventory.length
  const breakCount = activeBreaks.length
  const saleCount = activeSales.length
  const whatnotCount = whatnotRes.count ?? whatnotOrders.length

  const availableUnits = inventory.reduce(
    (sum, item) => sum + Number(item.available_quantity ?? 0),
    0
  )

  const inventoryCost = inventory.reduce(
    (sum, item) => sum + Number(item.cost_basis_total ?? 0),
    0
  )

  const inventoryEstimatedValue = inventory.reduce(
    (sum, item) => sum + Number(item.estimated_value_total ?? 0),
    0
  )

  const breakSpend = activeBreaks.reduce(
    (sum, item) => sum + Number(item.total_cost ?? 0),
    0
  )

  const grossSales = activeSales.reduce(
    (sum, item) => sum + Number(item.gross_sale ?? 0),
    0
  )

  const netSales = activeSales.reduce(
    (sum, item) => sum + Number(item.net_proceeds ?? 0),
    0
  )

  const totalProfit = activeSales.reduce(
    (sum, item) => sum + Number(item.profit ?? 0),
    0
  )

  const whatnotUnassignedTotal = unassignedWhatnotOrders.reduce(
    (sum, item) => sum + Number(item.total ?? 0),
    0
  )

  const listedItems = inventory.filter(
    (item) => String(item.status ?? '').toLowerCase() === 'listed'
  )
  const listedItemCount = listedItems.length
  const listedItemTotal = listedItems.reduce(
    (sum, item) =>
      sum + Number(item.listed_price ?? item.estimated_value_total ?? 0),
    0
  )

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
            {unassignedWhatnotOrders.length} unassigned
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
                <div>{incompleteBreaks.length} incomplete</div>
                <div>{noCardsDeclaredBreaks.length} not started</div>
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
                {unassignedWhatnotOrders.length}
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