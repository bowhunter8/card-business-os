import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

type DashboardInventoryAgg = {
  inventory_count: number | string | null
  available_units: number | string | null
  inventory_cost: number | string | null
  inventory_value: number | string | null
  listed_item_count: number | string | null
  listed_item_total: number | string | null
}

type DashboardBreaksAgg = {
  break_count: number | string | null
  break_spend: number | string | null
  open_break_count: number | string | null
  incomplete_breaks_count: number | string | null
  no_cards_declared_breaks_count: number | string | null
}

type DashboardSalesAgg = {
  sale_count: number | string | null
  gross_sales: number | string | null
  net_sales: number | string | null
  total_profit: number | string | null
}

type DashboardWhatnotAgg = {
  order_count: number | string | null
  unassigned_count: number | string | null
  unassigned_total: number | string | null
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export default async function AppHomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const dashboardSupabase = supabase as any

  const [inventoryRes, breaksRes, salesRes, whatnotRes] = await Promise.all([
    dashboardSupabase.rpc('dashboard_inventory_agg', { user_id_input: user.id }),
    dashboardSupabase.rpc('dashboard_breaks_agg', { user_id_input: user.id }),
    dashboardSupabase.rpc('dashboard_sales_agg', { user_id_input: user.id }),
    dashboardSupabase.rpc('dashboard_whatnot_agg', { user_id_input: user.id }),
  ])

  const inventoryAgg = ((inventoryRes.data ?? [])[0] ?? {}) as DashboardInventoryAgg
  const breaksAgg = ((breaksRes.data ?? [])[0] ?? {}) as DashboardBreaksAgg
  const salesAgg = ((salesRes.data ?? [])[0] ?? {}) as DashboardSalesAgg
  const whatnotAgg = ((whatnotRes.data ?? [])[0] ?? {}) as DashboardWhatnotAgg

  const availableUnits = numberValue(inventoryAgg.available_units)
  const inventoryCost = numberValue(inventoryAgg.inventory_cost)
  const inventoryEstimatedValue = numberValue(inventoryAgg.inventory_value)
  const listedItemCount = numberValue(inventoryAgg.listed_item_count)
  const listedItemTotal = numberValue(inventoryAgg.listed_item_total)
  const inventoryCount = numberValue(inventoryAgg.inventory_count)

  const breakCount = numberValue(breaksAgg.break_count)
  const breakSpend = numberValue(breaksAgg.break_spend)
  const openBreakCount = numberValue(breaksAgg.open_break_count)
  const incompleteBreaksCount = numberValue(breaksAgg.incomplete_breaks_count)
  const noCardsDeclaredBreaksCount = numberValue(breaksAgg.no_cards_declared_breaks_count)

  const saleCount = numberValue(salesAgg.sale_count)
  const grossSales = numberValue(salesAgg.gross_sales)
  const netSales = numberValue(salesAgg.net_sales)
  const totalProfit = numberValue(salesAgg.total_profit)

  const whatnotCount = numberValue(whatnotAgg.order_count)
  const unassignedWhatnotOrdersCount = numberValue(whatnotAgg.unassigned_count)
  const whatnotUnassignedTotal = numberValue(whatnotAgg.unassigned_total)

  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Dashboard</h1>
          <p className="app-subtitle">
            Overview of your breaks, inventory, sales, and imported orders.
          </p>
        </div>

        <div className="text-xs text-zinc-500">
          Signed in as <span className="text-zinc-300">{user.email}</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/app/inventory"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Inventory Items</div>
          <div className="mt-1.5 text-2xl font-semibold">{inventoryCount}</div>
          <div className="mt-1 text-xs text-zinc-500">
            {availableUnits} unit(s) available
          </div>
        </Link>

        <Link
          href="/app/breaks?q=active"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Active Breaks</div>
          <div className="mt-1.5 text-2xl font-semibold">{breakCount}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Total spend {money(breakSpend)}
          </div>
        </Link>

        <Link
          href="/app/sales?q=active"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Active Sales</div>
          <div className="mt-1.5 text-2xl font-semibold">{saleCount}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Gross sales {money(grossSales)}
          </div>
        </Link>

        <Link
          href="/app/whatnot-orders?q=unassigned"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Orders</div>
          <div className="mt-1.5 text-2xl font-semibold">{whatnotCount}</div>
          <div className="mt-1 text-xs text-zinc-500">
            {unassignedWhatnotOrdersCount} unassigned
          </div>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/app/inventory"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Inventory Cost Basis</div>
          <div className="mt-1.5 text-2xl font-semibold">{money(inventoryCost)}</div>
        </Link>

        <Link
          href="/app/inventory"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Estimated Inventory Value</div>
          <div className="mt-1.5 text-2xl font-semibold">
            {money(inventoryEstimatedValue)}
          </div>
        </Link>

        <Link
          href="/app/sales?q=active"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Net Sales</div>
          <div className="mt-1.5 text-2xl font-semibold">{money(netSales)}</div>
        </Link>

        <Link
          href="/app/sales?q=active"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Total Profit</div>
          <div className="mt-1.5 text-2xl font-semibold">{money(totalProfit)}</div>
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Link
          href="/app/breaks?q=open"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <h2 className="text-lg font-semibold">Open Breaks</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Open Break Count</div>
              <div className="mt-1.5 text-xl font-semibold">{openBreakCount}</div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Open Breakdown</div>
              <div className="mt-1.5 space-y-1 text-sm text-zinc-300">
                <div>{incompleteBreaksCount} incomplete</div>
                <div>{noCardsDeclaredBreaksCount} not started</div>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-zinc-400">
            Click to view breaks that still need card entry.
          </div>
        </Link>

        <Link
          href="/app/inventory?q=listed"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <h2 className="text-lg font-semibold">Listed Items</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Listed Count</div>
              <div className="mt-1.5 text-xl font-semibold">{listedItemCount}</div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Listed Total</div>
              <div className="mt-1.5 text-xl font-semibold">
                {money(listedItemTotal)}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-zinc-400">
            Click to view listed inventory.
          </div>
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-semibold">Workflow</h2>
          <div className="mt-3 space-y-2.5 text-sm text-zinc-400">
            <p>
              Use <span className="text-zinc-200">Orders</span> to create and manage purchases.
            </p>
            <p>
              Use <span className="text-zinc-200">Inventory</span> to view items, sell them, and reverse sales if needed.
            </p>
            <p>
              Use <span className="text-zinc-200">Utilities</span> for shipping profiles, imports, exports, order staging, and tax reports.
            </p>
          </div>
        </div>

        <Link
          href="/app/whatnot-orders?q=unassigned"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <h2 className="text-lg font-semibold">Imported Orders Waiting To Be Entered</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Unassigned Orders</div>
              <div className="mt-1.5 text-xl font-semibold">
                {unassignedWhatnotOrdersCount}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Unassigned Total</div>
              <div className="mt-1.5 text-xl font-semibold">
                {money(whatnotUnassignedTotal)}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-zinc-400">
            Click to view unassigned orders. Unassigned orders = breaks or inventory not entered into system yet
          </div>
        </Link>
      </div>
    </div>
  )
}