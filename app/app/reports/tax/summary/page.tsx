import { createClient } from '@/lib/supabase/server'

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

export default async function TaxSummaryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [salesRes, inventoryRes] = await Promise.all([
    supabase
      .from('sales')
      .select(`
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        cost_of_goods_sold,
        profit,
        reversed_at
      `)
      .eq('user_id', user.id),

    supabase
      .from('inventory_items')
      .select(`
        cost_basis_total,
        available_quantity,
        quantity
      `)
      .eq('user_id', user.id),
  ])

  const sales = (salesRes.data ?? []).filter((s) => !s.reversed_at)
  const inventory = inventoryRes.data ?? []

  // ===== SALES =====
  const grossRevenue = sales.reduce(
    (sum, s) => sum + Number(s.gross_sale ?? 0),
    0
  )

  const platformFees = sales.reduce(
    (sum, s) => sum + Number(s.platform_fees ?? 0),
    0
  )

  const shippingExpense = sales.reduce(
    (sum, s) => sum + Number(s.shipping_cost ?? 0),
    0
  )

  const otherExpenses = sales.reduce(
    (sum, s) => sum + Number(s.other_costs ?? 0),
    0
  )

  const totalCOGS = sales.reduce(
    (sum, s) => sum + Number(s.cost_of_goods_sold ?? 0),
    0
  )

  const netProfit = sales.reduce(
    (sum, s) => sum + Number(s.profit ?? 0),
    0
  )

  // ===== INVENTORY (Ending Inventory) =====
  const endingInventory = inventory.reduce((sum, item) => {
    const qty = Number(item.quantity ?? 0)
    const avail = Number(item.available_quantity ?? 0)
    const totalCost = Number(item.cost_basis_total ?? 0)

    if (qty <= 0 || avail <= 0) return sum

    const unitCost = totalCost / qty
    return sum + unitCost * avail
  }, 0)

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Tax Summary</h1>
        <p className="mt-2 text-zinc-400">
          Use this summary to file your taxes or provide to your accountant.
        </p>
      </div>

      {/* INCOME */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Income</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Stat label="Gross Revenue" value={money(grossRevenue)} />
        </div>
      </div>

      {/* EXPENSES */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Expenses</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Stat label="Cost of Goods Sold (COGS)" value={money(totalCOGS)} />
          <Stat label="Platform Fees" value={money(platformFees)} />
          <Stat label="Shipping Expense" value={money(shippingExpense)} />
          <Stat label="Other Expenses / Supplies" value={money(otherExpenses)} />
        </div>
      </div>

      {/* PROFIT */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Net Profit</h2>

        <div className="mt-4">
          <div className="text-4xl font-semibold">
            {money(netProfit)}
          </div>
        </div>
      </div>

      {/* INVENTORY */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Ending Inventory</h2>

        <div className="mt-4">
          <Stat
            label="Inventory Value (End of Year)"
            value={money(endingInventory)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
        This report is based on recorded sales and inventory. Keep receipts and
        confirm totals before filing.
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  )
}