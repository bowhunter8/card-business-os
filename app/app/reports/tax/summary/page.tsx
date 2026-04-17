import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type TaxSaleRow = {
  sale_date: string | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  reversed_at: string | null
  platform?: string | null
  notes?: string | null
  quantity_sold?: number | null
  inventory_items?: {
    title?: string | null
    player_name?: string | null
    year?: number | null
    brand?: string | null
    set_name?: string | null
    card_number?: string | null
    team?: string | null
  } | null
}

type TaxInventoryRow = {
  title?: string | null
  player_name?: string | null
  year?: number | null
  brand?: string | null
  set_name?: string | null
  card_number?: string | null
  team?: string | null
  cost_basis_total: number | null
  available_quantity: number | null
  quantity: number | null
  status?: string | null
  created_at?: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().slice(0, 10)
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function buildCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return 'No data\n'
  }

  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ]

  return lines.join('\n')
}

function makeDownloadHref(csv: string) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
}

function itemLabel(input: {
  title?: string | null
  player_name?: string | null
  year?: number | null
  brand?: string | null
  set_name?: string | null
  card_number?: string | null
  team?: string | null
}) {
  return [
    input.title || input.player_name || 'Untitled item',
    input.year,
    input.brand,
    input.set_name,
    input.card_number ? `#${input.card_number}` : null,
    input.team,
  ]
    .filter(Boolean)
    .join(' • ')
}

function getYearBounds(year: number) {
  return {
    start: `${year}-01-01`,
    end: `${year + 1}-01-01`,
  }
}

export default async function TaxSummaryPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const currentYear = new Date().getFullYear()
  const parsedYear = Number(String(params?.year ?? currentYear))
  const selectedYear =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= currentYear + 1
      ? parsedYear
      : currentYear

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { start, end } = getYearBounds(selectedYear)

  const [salesRes, inventoryRes] = await Promise.all([
    supabase
      .from('sales')
      .select(`
        sale_date,
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        cost_of_goods_sold,
        profit,
        reversed_at,
        platform,
        notes,
        quantity_sold,
        inventory_items (
          title,
          player_name,
          year,
          brand,
          set_name,
          card_number,
          team
        )
      `)
      .eq('user_id', user.id)
      .gte('sale_date', start)
      .lt('sale_date', end)
      .order('sale_date', { ascending: true }),

    supabase
      .from('inventory_items')
      .select(`
        title,
        player_name,
        year,
        brand,
        set_name,
        card_number,
        team,
        cost_basis_total,
        available_quantity,
        quantity,
        status,
        created_at
      `)
      .eq('user_id', user.id),
  ])

  const sales = ((salesRes.data ?? []) as TaxSaleRow[]).filter((s) => !s.reversed_at)
  const inventory = (inventoryRes.data ?? []) as TaxInventoryRow[]

  const grossRevenue = sales.reduce((sum, s) => sum + Number(s.gross_sale ?? 0), 0)
  const platformFees = sales.reduce((sum, s) => sum + Number(s.platform_fees ?? 0), 0)
  const shippingExpense = sales.reduce((sum, s) => sum + Number(s.shipping_cost ?? 0), 0)
  const otherExpenses = sales.reduce((sum, s) => sum + Number(s.other_costs ?? 0), 0)
  const totalCOGS = sales.reduce((sum, s) => sum + Number(s.cost_of_goods_sold ?? 0), 0)
  const netProfit = sales.reduce((sum, s) => sum + Number(s.profit ?? 0), 0)

  const endingInventory = inventory.reduce((sum, item) => {
    const qty = Number(item.quantity ?? 0)
    const avail = Number(item.available_quantity ?? 0)
    const totalCost = Number(item.cost_basis_total ?? 0)

    if (qty <= 0 || avail <= 0) return sum

    const unitCost = totalCost / qty
    return sum + unitCost * avail
  }, 0)

  const summaryRows = [
    {
      year: selectedYear,
      gross_revenue: grossRevenue.toFixed(2),
      cost_of_goods_sold: totalCOGS.toFixed(2),
      platform_fees: platformFees.toFixed(2),
      shipping_expense: shippingExpense.toFixed(2),
      other_expenses: otherExpenses.toFixed(2),
      net_profit: netProfit.toFixed(2),
      current_inventory_snapshot_value: endingInventory.toFixed(2),
      note:
        'Inventory value is a current live snapshot, not a locked historical year-end snapshot.',
    },
  ]

  const salesDetailRows = sales.map((sale) => ({
    sale_date: formatDate(sale.sale_date),
    item: itemLabel(sale.inventory_items ?? {}),
    quantity_sold: Number(sale.quantity_sold ?? 0),
    gross_sale: Number(sale.gross_sale ?? 0).toFixed(2),
    platform_fees: Number(sale.platform_fees ?? 0).toFixed(2),
    shipping_expense: Number(sale.shipping_cost ?? 0).toFixed(2),
    other_expenses: Number(sale.other_costs ?? 0).toFixed(2),
    cost_of_goods_sold: Number(sale.cost_of_goods_sold ?? 0).toFixed(2),
    profit: Number(sale.profit ?? 0).toFixed(2),
    platform: sale.platform ?? '',
    notes: sale.notes ?? '',
  }))

  const inventoryDetailRows = inventory
    .filter((item) => Number(item.available_quantity ?? 0) > 0)
    .map((item) => {
      const qty = Number(item.quantity ?? 0)
      const avail = Number(item.available_quantity ?? 0)
      const totalCost = Number(item.cost_basis_total ?? 0)
      const unitCost = qty > 0 ? totalCost / qty : 0
      const remainingValue = unitCost * avail

      return {
        item: itemLabel(item),
        status: item.status ?? '',
        total_quantity: qty,
        available_quantity: avail,
        total_cost_basis: totalCost.toFixed(2),
        estimated_remaining_cost_basis: remainingValue.toFixed(2),
        created_at: formatDate(item.created_at),
      }
    })

  const summaryCsvHref = makeDownloadHref(buildCsv(summaryRows))
  const salesCsvHref = makeDownloadHref(buildCsv(salesDetailRows))
  const inventoryCsvHref = makeDownloadHref(buildCsv(inventoryDetailRows))

  const yearOptions = Array.from({ length: Math.max(currentYear - 2023 + 1, 1) }, (_, index) => {
    return currentYear - index
  })

  return (
    <div className="app-page-wide max-w-5xl space-y-3">
      <div className="app-page-header gap-3">
        <div>
          <h1 className="app-title">Tax Summary</h1>
          <p className="app-subtitle">
            Year-based summary plus export files for your records or accountant.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={summaryCsvHref}
            download={`tax-summary-${selectedYear}.csv`}
            className="app-button"
          >
            Export Summary CSV
          </a>
          <a
            href={salesCsvHref}
            download={`tax-sales-detail-${selectedYear}.csv`}
            className="app-button"
          >
            Export Sales Detail CSV
          </a>
          <a
            href={inventoryCsvHref}
            download={`tax-inventory-snapshot-${selectedYear}.csv`}
            className="app-button"
          >
            Export Inventory CSV
          </a>
        </div>
      </div>

      <form method="get" className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="w-full max-w-[180px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Tax Year
            </label>
            <select name="year" defaultValue={String(selectedYear)} className="app-select">
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="app-button-primary">
              Update
            </button>
            <Link href="/app/utilities" className="app-button">
              Back to Utilities
            </Link>
          </div>
        </div>

        <div className="mt-2 text-xs text-zinc-400">
          Sales are filtered to the selected year. Inventory is a current live snapshot based on
          available quantity and cost basis still on hand.
        </div>
      </form>

      <div className="app-section p-4">
        <h2 className="text-xl font-semibold">Income</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Stat label="Gross Revenue" value={money(grossRevenue)} />
        </div>
      </div>

      <div className="app-section p-4">
        <h2 className="text-xl font-semibold">Expenses</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Stat label="Cost of Goods Sold (COGS)" value={money(totalCOGS)} />
          <Stat label="Platform Fees" value={money(platformFees)} />
          <Stat label="Shipping Expense" value={money(shippingExpense)} />
          <Stat label="Other Expenses / Supplies" value={money(otherExpenses)} />
        </div>
      </div>

      <div className="app-section p-4">
        <h2 className="text-xl font-semibold">Net Profit</h2>

        <div className="mt-3">
          <div className="text-4xl font-semibold">{money(netProfit)}</div>
        </div>
      </div>

      <div className="app-section p-4">
        <h2 className="text-xl font-semibold">Inventory Snapshot</h2>

        <div className="mt-3">
          <Stat
            label="Current Inventory Value"
            value={money(endingInventory)}
          />
        </div>

        <div className="mt-2 text-xs text-zinc-400">
          This is a current snapshot based on remaining available quantity. It is useful for records,
          but it is not a locked historical year-end inventory valuation unless captured at year end.
        </div>
      </div>

      <div className="app-section p-4">
        <h2 className="text-xl font-semibold">How To Use This For Taxes</h2>

        <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
          <p>
            1. Use <span className="font-semibold text-zinc-100">Gross Revenue</span> as your total
            sales for the selected year.
          </p>
          <p>
            2. Use <span className="font-semibold text-zinc-100">COGS</span>, platform fees,
            shipping expense, and other expenses as support for your deductions and business records.
          </p>
          <p>
            3. Export the summary CSV for your year totals and export the detailed sales CSV as
            line-by-line backup.
          </p>
          <p>
            4. Export the inventory CSV as support for what is still on hand, but remember this page
            currently shows a live inventory snapshot rather than a locked historical year-end
            snapshot.
          </p>
          <p>
            5. Keep receipts, purchase records, and platform statements with these exports before
            filing.
          </p>
        </div>
      </div>

      <div className="app-alert-warning">
        This report is based on recorded sales and current inventory data. Confirm totals before
        filing. For a fully historical year-end inventory number, you will want a locked beginning
        inventory and ending inventory workflow.
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card-tight p-4">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  )
}