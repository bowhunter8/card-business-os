import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import TaxExportButton from './TaxExportButton'
import TaxPdfExportButton from './TaxPdfExportButton'

type SearchParams = Promise<{
  year?: string
}>

type BreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  total_cost: number | null
}

type SaleRow = {
  id: string
  sale_date: string | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  platform: string | null
  notes: string | null
  inventory_item_id: string | null
}

type InventoryRow = {
  id: string
  title: string | null
  player_name: string | null
  year: number | null
  set_name: string | null
  card_number: string | null
  notes: string | null
  status: string | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
}

type ExpenseRow = {
  id: string
  expense_date: string | null
  category: string | null
  vendor: string | null
  amount: number | null
  notes: string | null
  created_at: string | null
}

type TaxYearSettingsRow = {
  beginning_inventory: number | null
  ending_inventory_snapshot: number | null
  ending_inventory_locked_at: string | null
  business_use_of_home: number | null
  vehicle_expense: number | null
  depreciation_expense: number | null
  legal_professional: number | null
  insurance: number | null
  utilities: number | null
  taxes_licenses: number | null
  repairs_maintenance: number | null
  notes: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function buildItemName(item: InventoryRow) {
  const parts = [
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
    item.notes,
  ]
  return parts.filter(Boolean).join(' • ') || item.title || 'Untitled item'
}

function clampYear(raw?: string) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }
  return parsed
}

function mapExpenseCategoryToScheduleCArea(category: string) {
  const normalized = category.trim().toLowerCase()

  if (normalized.includes('advertising') || normalized.includes('marketing')) {
    return 'Advertising'
  }

  if (normalized.includes('platform') || normalized.includes('fee')) {
    return 'Commissions and fees'
  }

  if (normalized.includes('postage') || normalized.includes('shipping')) {
    return 'Other expenses / Postage and shipping'
  }

  if (normalized.includes('supplies')) {
    return 'Supplies'
  }

  if (normalized.includes('software') || normalized.includes('subscription')) {
    return 'Other expenses / Software and subscriptions'
  }

  if (normalized.includes('equipment')) {
    return 'Other expenses / Equipment review'
  }

  if (normalized.includes('office')) {
    return 'Office expense'
  }

  if (normalized.includes('grading') || normalized.includes('authentication')) {
    return 'Other expenses / Grading and authentication'
  }

  if (normalized.includes('travel')) {
    return 'Travel'
  }

  if (normalized.includes('education')) {
    return 'Other expenses / Education'
  }

  return 'Other expenses'
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not locked yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const selectedYear = clampYear(params?.year)

  const startDate = `${selectedYear}-01-01`
  const endDate = `${selectedYear}-12-31`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [breaksRes, salesRes, inventoryRes, expensesRes, taxSettingsRes] =
    await Promise.all([
      supabase
        .from('breaks')
        .select('id, break_date, source_name, product_name, order_number, total_cost')
        .eq('user_id', user.id)
        .is('reversed_at', null)
        .gte('break_date', startDate)
        .lte('break_date', endDate)
        .order('break_date', { ascending: false }),

      supabase
        .from('sales')
        .select(`
          id,
          sale_date,
          gross_sale,
          platform_fees,
          shipping_cost,
          other_costs,
          net_proceeds,
          cost_of_goods_sold,
          profit,
          platform,
          notes,
          inventory_item_id
        `)
        .eq('user_id', user.id)
        .is('reversed_at', null)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .order('sale_date', { ascending: false }),

      supabase
        .from('inventory_items')
        .select(`
          id,
          title,
          player_name,
          year,
          set_name,
          card_number,
          notes,
          status,
          available_quantity,
          cost_basis_unit,
          cost_basis_total,
          estimated_value_total
        `)
        .eq('user_id', user.id)
        .gt('available_quantity', 0)
        .order('year', { ascending: false }),

      supabase
        .from('expenses')
        .select(`
          id,
          expense_date,
          category,
          vendor,
          amount,
          notes,
          created_at
        `)
        .eq('user_id', user.id)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),

      supabase
        .from('tax_year_settings')
        .select(`
          beginning_inventory,
          ending_inventory_snapshot,
          ending_inventory_locked_at,
          business_use_of_home,
          vehicle_expense,
          depreciation_expense,
          legal_professional,
          insurance,
          utilities,
          taxes_licenses,
          repairs_maintenance,
          notes
        `)
        .eq('user_id', user.id)
        .eq('tax_year', selectedYear)
        .maybeSingle(),
    ])

  const breaks: BreakRow[] = (breaksRes.data ?? []) as BreakRow[]
  const sales: SaleRow[] = (salesRes.data ?? []) as SaleRow[]
  const endingInventory: InventoryRow[] = (inventoryRes.data ?? []) as InventoryRow[]
  const expenses: ExpenseRow[] = (expensesRes.data ?? []) as ExpenseRow[]
  const taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null

  const beginningInventory = roundMoney(Number(taxSettings?.beginning_inventory ?? 0))
  const liveEndingInventoryCost = roundMoney(
    endingInventory.reduce((sum, row) => {
      const availableQty = Number(row.available_quantity ?? 0)
      const unitCost = Number(row.cost_basis_unit ?? 0)
      const fallbackTotal = Number(row.cost_basis_total ?? 0)

      if (availableQty > 0 && unitCost > 0) {
        return sum + availableQty * unitCost
      }

      return sum + fallbackTotal
    }, 0)
  )

  const lockedEndingInventory =
    taxSettings?.ending_inventory_snapshot != null
      ? roundMoney(Number(taxSettings.ending_inventory_snapshot ?? 0))
      : null

  const endingInventoryCost = lockedEndingInventory ?? liveEndingInventoryCost

  const totalBreakPurchases = roundMoney(
    breaks.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0)
  )

  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  )

  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.platform_fees ?? 0), 0)
  )

  const totalShippingAndSupplies = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.shipping_cost ?? 0), 0)
  )

  const totalOtherCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.other_costs ?? 0), 0)
  )

  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingAndSupplies + totalOtherCosts
  )

  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0)
  )

  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.cost_of_goods_sold ?? 0), 0)
  )

  const totalProfit = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)
  )

  const endingInventoryEstimatedValue = roundMoney(
    endingInventory.reduce(
      (sum, row) => sum + Number(row.estimated_value_total ?? 0),
      0
    )
  )

  const expenseByCategory = new Map<string, { amount: number; count: number }>()

  for (const expense of expenses) {
    const category = String(expense.category || 'Uncategorized').trim() || 'Uncategorized'
    const current = expenseByCategory.get(category) ?? { amount: 0, count: 0 }

    expenseByCategory.set(category, {
      amount: current.amount + Number(expense.amount ?? 0),
      count: current.count + 1,
    })
  }

  const expenseCategoryRows = Array.from(expenseByCategory.entries())
    .map(([category, values]) => ({
      category,
      amount: roundMoney(values.amount),
      count: values.count,
      scheduleCArea: mapExpenseCategoryToScheduleCArea(category),
    }))
    .sort((left, right) =>
      left.category.localeCompare(right.category, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    )

  const totalManualExpenses = roundMoney(
    expenseCategoryRows.reduce((sum, row) => sum + row.amount, 0)
  )

  const purchasesForCogsSupport = roundMoney(
    totalCOGS + endingInventoryCost - beginningInventory
  )

  const grossIncomeAfterCOGS = roundMoney(totalGrossSales - totalCOGS)

  const scheduleCExtraExpenses = roundMoney(
    Number(taxSettings?.business_use_of_home ?? 0) +
      Number(taxSettings?.vehicle_expense ?? 0) +
      Number(taxSettings?.depreciation_expense ?? 0) +
      Number(taxSettings?.legal_professional ?? 0) +
      Number(taxSettings?.insurance ?? 0) +
      Number(taxSettings?.utilities ?? 0) +
      Number(taxSettings?.taxes_licenses ?? 0) +
      Number(taxSettings?.repairs_maintenance ?? 0)
  )

  const totalBusinessExpensesExcludingCOGS = roundMoney(
    totalSellingCosts + totalManualExpenses + scheduleCExtraExpenses
  )

  const netBusinessProfitAfterTrackedExpenses = roundMoney(
    totalGrossSales - totalCOGS - totalBusinessExpensesExcludingCOGS
  )

  const warnings: string[] = []

  if (!taxSettings) {
    warnings.push(
      'No tax year settings record exists yet. Beginning inventory and extra Schedule C fields are using zero defaults.'
    )
  }

  if (beginningInventory === 0 && (totalCOGS > 0 || endingInventoryCost > 0)) {
    warnings.push(
      'Beginning inventory is zero. Confirm this is correct before filing, especially if inventory carried over from a prior year.'
    )
  }

  if (lockedEndingInventory == null) {
    warnings.push(
      'Ending inventory is using the current live inventory value. For filed taxes, lock a year-end snapshot so later inventory edits do not change this year.'
    )
  }

  if (purchasesForCogsSupport < 0) {
    warnings.push(
      'COGS support produced negative purchases. Review beginning inventory, ending inventory, and sales COGS before filing.'
    )
  }

  if (totalShippingAndSupplies > 0) {
    warnings.push(
      'Sale-level shipping_cost currently combines postage and/or shipping supplies. Review categories to avoid double counting supplies entered separately as manual expenses.'
    )
  }

  if (
    expenseCategoryRows.some(
      (row) => row.scheduleCArea === 'Other expenses' || row.category.toLowerCase().includes('uncategorized')
    )
  ) {
    warnings.push(
      'Other / uncategorized manual expenses exist. Review and rename categories before filing if possible.'
    )
  }

  if (warnings.length === 0) {
    warnings.push('No major tax-readiness warnings were detected from this summary.')
  }

  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Tax Report</h1>
          <p className="app-subtitle">
            Year-end summary, Schedule C support, COGS support, and export tools for your business records.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app" className="app-button">
            Back to Dashboard
          </Link>

          <TaxExportButton year={selectedYear} />

          <TaxPdfExportButton year={selectedYear} />
        </div>
      </div>

      <div className="app-section mt-4">
        <form method="get" className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tax Year</label>
            <select
              name="year"
              defaultValue={String(selectedYear)}
              className="app-select max-w-40"
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const year = new Date().getFullYear() - i
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="app-button">
              Load Year
            </button>

            <TaxExportButton year={selectedYear} />

            <TaxPdfExportButton year={selectedYear} />
          </div>
        </form>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <StatCard label="Gross Sales" value={money(totalGrossSales)} />
        <StatCard label="Realized COGS" value={money(totalCOGS)} />
        <StatCard label="Gross Income After COGS" value={money(grossIncomeAfterCOGS)} />
        <StatCard label="Net Profit After Tracked Expenses" value={money(netBusinessProfitAfterTrackedExpenses)} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <StatCard label="Selling Costs" value={money(totalSellingCosts)} />
        <StatCard label="Manual Expenses" value={money(totalManualExpenses)} />
        <StatCard label="Extra Schedule C Settings" value={money(scheduleCExtraExpenses)} />
        <StatCard label="Net Proceeds" value={money(totalNetProceeds)} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <StatCard label="Beginning Inventory" value={money(beginningInventory)} />
        <StatCard label="Purchases Support" value={money(purchasesForCogsSupport)} />
        <StatCard label={lockedEndingInventory == null ? 'Ending Inventory Cost (Live)' : 'Ending Inventory Cost (Locked)'} value={money(endingInventoryCost)} />
        <StatCard label="Ending Inventory Est. Value" value={money(endingInventoryEstimatedValue)} />
      </div>

      <div className="app-section mt-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">COGS Tie-Out</h2>
            <p className="mt-1 text-sm text-zinc-400">
              IRS-style support: beginning inventory + purchases support - ending inventory = realized COGS.
            </p>
          </div>

          <div className="text-sm text-zinc-400">
            Ending inventory snapshot: {formatDateTime(taxSettings?.ending_inventory_locked_at)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <StatCard label="Beginning Inventory" value={money(beginningInventory)} />
          <StatCard label="+ Purchases Support" value={money(purchasesForCogsSupport)} />
          <StatCard label="- Ending Inventory" value={money(endingInventoryCost)} />
          <StatCard label="= COGS" value={money(totalCOGS)} />
          <StatCard label="Break Purchases Reference" value={money(totalBreakPurchases)} />
        </div>

        <div className="mt-3 text-sm text-zinc-400">
          Break purchases are reference support only. The IRS COGS tie-out uses the inventory formula and may include beginning inventory, non-break inventory, sold items, and current or locked ending inventory.
        </div>
      </div>

      <div className="app-section mt-4">
        <h2 className="text-lg font-semibold">Tax Readiness Warnings</h2>
        <div className="mt-3 space-y-2">
          {warnings.map((warning) => (
            <div key={warning} className="app-alert-warning">
              {warning}
            </div>
          ))}
        </div>
      </div>

      <div className="app-section mt-4">
        <div className="border-b border-zinc-800 pb-3">
          <h2 className="text-xl font-semibold">Manual Expense Summary ({expenses.length})</h2>
          <p className="mt-1 text-sm text-zinc-400">
            These expenses are included separately from sale-level platform fees, shipping, and other sale costs.
          </p>
        </div>

        <div className="app-table-wrap mt-4">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Category</th>
                  <th className="app-th">Schedule C Area</th>
                  <th className="app-th text-right">Count</th>
                  <th className="app-th text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenseCategoryRows.map((row) => (
                  <tr key={row.category} className="app-tr">
                    <td className="app-td">{row.category}</td>
                    <td className="app-td">{row.scheduleCArea}</td>
                    <td className="app-td text-right">{row.count}</td>
                    <td className="app-td text-right">{money(row.amount)}</td>
                  </tr>
                ))}

                {expenseCategoryRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-zinc-400">
                      No manual expenses found for {selectedYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="app-section mt-4">
        <div className="border-b border-zinc-800 pb-3">
          <h2 className="text-xl font-semibold">Break Purchases ({breaks.length})</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Reference support for acquisitions recorded as breaks during this tax year.
          </p>
        </div>

        <div className="app-table-wrap mt-4">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Date</th>
                  <th className="app-th">Product</th>
                  <th className="app-th">Source</th>
                  <th className="app-th">Order #</th>
                  <th className="app-th text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {breaks.map((row) => (
                  <tr key={row.id} className="app-tr">
                    <td className="app-td">{row.break_date || '—'}</td>
                    <td className="app-td">{row.product_name || '—'}</td>
                    <td className="app-td">{row.source_name || '—'}</td>
                    <td className="app-td">{row.order_number || '—'}</td>
                    <td className="app-td text-right">{money(row.total_cost)}</td>
                  </tr>
                ))}

                {breaks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                      No break purchases found for {selectedYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="app-section mt-4">
        <div className="border-b border-zinc-800 pb-3">
          <h2 className="text-xl font-semibold">Sales ({sales.length})</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Sales drive realized COGS. Reversed sales are excluded.
          </p>
        </div>

        <div className="app-table-wrap mt-4">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Date</th>
                  <th className="app-th text-right">Gross</th>
                  <th className="app-th text-right">Fees/Costs</th>
                  <th className="app-th text-right">Net</th>
                  <th className="app-th text-right">COGS</th>
                  <th className="app-th text-right">Profit</th>
                  <th className="app-th">Platform</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((row) => {
                  const sellingCosts =
                    Number(row.platform_fees ?? 0) +
                    Number(row.shipping_cost ?? 0) +
                    Number(row.other_costs ?? 0)

                  return (
                    <tr key={row.id} className="app-tr">
                      <td className="app-td">{row.sale_date || '—'}</td>
                      <td className="app-td text-right">{money(row.gross_sale)}</td>
                      <td className="app-td text-right">{money(sellingCosts)}</td>
                      <td className="app-td text-right">{money(row.net_proceeds)}</td>
                      <td className="app-td text-right">{money(row.cost_of_goods_sold)}</td>
                      <td className="app-td text-right">{money(row.profit)}</td>
                      <td className="app-td">{row.platform || '—'}</td>
                    </tr>
                  )
                })}

                {sales.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                      No sales found for {selectedYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="app-section mt-4">
        <div className="border-b border-zinc-800 pb-3">
          <h2 className="text-xl font-semibold">
            Ending Inventory Snapshot ({endingInventory.length})
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            This table shows current unsold inventory detail. The summary above uses a locked tax-year snapshot if one exists.
          </p>
        </div>

        <div className="app-table-wrap mt-4">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Item</th>
                  <th className="app-th">Status</th>
                  <th className="app-th text-right">Available Qty</th>
                  <th className="app-th text-right">Unit Cost</th>
                  <th className="app-th text-right">Inventory Cost</th>
                  <th className="app-th text-right">Est. Value</th>
                </tr>
              </thead>
              <tbody>
                {endingInventory.map((row) => {
                  const availableQty = Number(row.available_quantity ?? 0)
                  const unitCost = Number(row.cost_basis_unit ?? 0)
                  const rowCost =
                    availableQty > 0 && unitCost > 0
                      ? availableQty * unitCost
                      : Number(row.cost_basis_total ?? 0)

                  return (
                    <tr key={row.id} className="app-tr">
                      <td className="app-td">{buildItemName(row)}</td>
                      <td className="app-td">{row.status || '—'}</td>
                      <td className="app-td text-right">{availableQty}</td>
                      <td className="app-td text-right">{money(unitCost)}</td>
                      <td className="app-td text-right">{money(rowCost)}</td>
                      <td className="app-td text-right">{money(row.estimated_value_total)}</td>
                    </tr>
                  )
                })}

                {endingInventory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                      No ending inventory found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card-tight">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
