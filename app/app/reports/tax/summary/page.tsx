import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import TaxExportButton from '../TaxExportButton'
import TaxPdfExportButton from '../TaxPdfExportButton'

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

type BreakSummaryRow = {
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

type SaleSummaryRow = {
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
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

type InventorySummaryRow = {
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
}

type TaxYearSettingsRow = {
  beginning_inventory: number | null
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

const DETAIL_LIMIT = 25

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function parseMoneyInput(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? '0').replace(/\$/g, '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card-tight p-5">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}

async function saveTaxYearSettings(formData: FormData) {
  'use server'

  const year = clampYear(String(formData.get('tax_year') ?? ''))
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const payload = {
    user_id: user.id,
    tax_year: year,
    beginning_inventory: parseMoneyInput(formData.get('beginning_inventory')),
    business_use_of_home: parseMoneyInput(formData.get('business_use_of_home')),
    vehicle_expense: parseMoneyInput(formData.get('vehicle_expense')),
    depreciation_expense: parseMoneyInput(formData.get('depreciation_expense')),
    legal_professional: parseMoneyInput(formData.get('legal_professional')),
    insurance: parseMoneyInput(formData.get('insurance')),
    utilities: parseMoneyInput(formData.get('utilities')),
    taxes_licenses: parseMoneyInput(formData.get('taxes_licenses')),
    repairs_maintenance: parseMoneyInput(formData.get('repairs_maintenance')),
    notes: String(formData.get('notes') ?? '').trim() || null,
    updated_at: new Date().toISOString(),
  }

  await supabase
    .from('tax_year_settings')
    .upsert(payload, {
      onConflict: 'user_id,tax_year',
    })

  revalidatePath('/app/reports/tax/summary')
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

  const [
    breaksSummaryRes,
    breaksDetailRes,
    salesSummaryRes,
    salesDetailRes,
    inventorySummaryRes,
    inventoryDetailRes,
    taxSettingsRes,
  ] = await Promise.all([
    supabase
      .from('breaks')
      .select('total_cost')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate),

    supabase
      .from('breaks')
      .select('id, break_date, source_name, product_name, order_number, total_cost')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .order('break_date', { ascending: false })
      .limit(DETAIL_LIMIT),

    supabase
      .from('sales')
      .select(`
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        net_proceeds,
        cost_of_goods_sold,
        profit
      `)
      .eq('user_id', user.id)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate),

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
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .order('sale_date', { ascending: false })
      .limit(DETAIL_LIMIT),

    supabase
      .from('inventory_items')
      .select(`
        available_quantity,
        cost_basis_unit,
        cost_basis_total,
        estimated_value_total
      `)
      .eq('user_id', user.id)
      .gt('available_quantity', 0),

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
      .order('year', { ascending: false })
      .limit(DETAIL_LIMIT),

    supabase
      .from('tax_year_settings')
      .select(`
        beginning_inventory,
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

  const breakSummaryRows = (breaksSummaryRes.data ?? []) as BreakSummaryRow[]
  const breaks = (breaksDetailRes.data ?? []) as BreakRow[]

  const salesSummaryRows = (salesSummaryRes.data ?? []) as SaleSummaryRow[]
  const sales = (salesDetailRes.data ?? []) as SaleRow[]

  const inventorySummaryRows = (inventorySummaryRes.data ?? []) as InventorySummaryRow[]
  const endingInventory = (inventoryDetailRes.data ?? []) as InventoryRow[]

  const taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null

  const totalBreakPurchases = breakSummaryRows.reduce(
    (sum, row) => sum + Number(row.total_cost ?? 0),
    0
  )

  const totalGrossSales = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.gross_sale ?? 0),
    0
  )

  const totalSellingCosts = salesSummaryRows.reduce(
    (sum, row) =>
      sum +
      Number(row.platform_fees ?? 0) +
      Number(row.shipping_cost ?? 0) +
      Number(row.other_costs ?? 0),
    0
  )

  const totalNetProceeds = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.net_proceeds ?? 0),
    0
  )

  const totalCOGS = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.cost_of_goods_sold ?? 0),
    0
  )

  const totalProfit = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.profit ?? 0),
    0
  )

  const endingInventoryCost = inventorySummaryRows.reduce((sum, row) => {
    const availableQty = Number(row.available_quantity ?? 0)
    const unitCost = Number(row.cost_basis_unit ?? 0)
    const fallbackTotal = Number(row.cost_basis_total ?? 0)

    if (availableQty > 0 && unitCost > 0) {
      return sum + availableQty * unitCost
    }

    return sum + fallbackTotal
  }, 0)

  const endingInventoryEstimatedValue = inventorySummaryRows.reduce(
    (sum, row) => sum + Number(row.estimated_value_total ?? 0),
    0
  )

  const beginningInventory = Number(taxSettings?.beginning_inventory ?? 0)
  const businessUseOfHome = Number(taxSettings?.business_use_of_home ?? 0)
  const vehicleExpense = Number(taxSettings?.vehicle_expense ?? 0)
  const depreciationExpense = Number(taxSettings?.depreciation_expense ?? 0)
  const legalProfessional = Number(taxSettings?.legal_professional ?? 0)
  const insurance = Number(taxSettings?.insurance ?? 0)
  const utilities = Number(taxSettings?.utilities ?? 0)
  const taxesLicenses = Number(taxSettings?.taxes_licenses ?? 0)
  const repairsMaintenance = Number(taxSettings?.repairs_maintenance ?? 0)

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header gap-4">
        <div>
          <h1 className="app-title">Tax Summary</h1>
          <p className="app-subtitle">
            Year-end summary, Schedule C settings, workbook export, and PDF tax report.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app" className="app-button">
            Back to Dashboard
          </Link>

          <TaxExportButton year={selectedYear} />

          <TaxPdfExportButton year={selectedYear} />
        </div>
      </div>

      <div className="app-section p-5">
        <form method="get" className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tax Year</label>
            <select
              name="year"
              defaultValue={String(selectedYear)}
              className="app-select"
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

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="app-button">
              Load Year
            </button>

            <TaxPdfExportButton year={selectedYear} />
          </div>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Break Purchases" value={money(totalBreakPurchases)} />
        <StatCard label="Gross Sales" value={money(totalGrossSales)} />
        <StatCard label="Selling Costs" value={money(totalSellingCosts)} />
        <StatCard label="Net Proceeds" value={money(totalNetProceeds)} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Realized COGS" value={money(totalCOGS)} />
        <StatCard label="Realized Profit" value={money(totalProfit)} />
        <StatCard label="Beginning Inventory" value={money(beginningInventory)} />
        <StatCard label="Ending Inventory Cost" value={money(endingInventoryCost)} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Ending Inventory Est. Value" value={money(endingInventoryEstimatedValue)} />
        <StatCard label="Home Office" value={money(businessUseOfHome)} />
        <StatCard label="Depreciation / Section 179" value={money(depreciationExpense)} />
        <StatCard label="Legal / Professional" value={money(legalProfessional)} />
      </div>

      <div className="app-section p-5">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Schedule C Year Settings</h2>
          <p className="mt-1 text-sm text-zinc-400">
            These amounts feed the Schedule C PDF report for {selectedYear}. Use this for beginning inventory and Schedule C lines that are not created from sales or expense records.
          </p>
        </div>

        {!taxSettings && (
          <div className="mb-4 rounded-2xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100">
            No tax settings have been saved for {selectedYear} yet. The PDF will use zero defaults until you save this section.
          </div>
        )}

        <form action={saveTaxYearSettings} className="space-y-5">
          <input type="hidden" name="tax_year" value={selectedYear} />

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Beginning Inventory</span>
              <input
                name="beginning_inventory"
                defaultValue={beginningInventory}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Part III Line 35.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Business Use of Home</span>
              <input
                name="business_use_of_home"
                defaultValue={businessUseOfHome}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 30, if applicable.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Vehicle Expense</span>
              <input
                name="vehicle_expense"
                defaultValue={vehicleExpense}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 9, if applicable.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Depreciation / Section 179</span>
              <input
                name="depreciation_expense"
                defaultValue={depreciationExpense}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 13.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Legal / Professional</span>
              <input
                name="legal_professional"
                defaultValue={legalProfessional}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 17.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Insurance</span>
              <input
                name="insurance"
                defaultValue={insurance}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 15.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Utilities</span>
              <input
                name="utilities"
                defaultValue={utilities}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 25.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Taxes / Licenses</span>
              <input
                name="taxes_licenses"
                defaultValue={taxesLicenses}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 23.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Repairs / Maintenance</span>
              <input
                name="repairs_maintenance"
                defaultValue={repairsMaintenance}
                className="app-input"
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Schedule C Line 21.
              </span>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Tax Notes</span>
            <textarea
              name="notes"
              defaultValue={taxSettings?.notes ?? ''}
              className="app-input min-h-28"
              placeholder="Optional notes for this tax year..."
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="app-button-primary">
              Save Schedule C Settings
            </button>

            <TaxPdfExportButton year={selectedYear} />
          </div>
        </form>
      </div>
    </div>
  )
}