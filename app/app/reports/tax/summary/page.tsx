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

type ExpenseRow = {
  category: string | null
  amount: number | null
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

type DisposalTransactionRow = {
  id: string
  inventory_item_id: string | null
  transaction_type: string | null
  quantity_change: number | null
  notes: string | null
  disposal_reason: string | null
  disposal_notes: string | null
  finalized_for_tax: boolean | null
  created_at: string | null
}

type DisposalInventoryRow = {
  id: string
  title: string | null
  player_name: string | null
  year: number | null
  set_name: string | null
  card_number: string | null
  notes: string | null
  cost_basis_total: number | null
  cost_basis_unit: number | null
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

function buildItemName(item: InventoryRow | DisposalInventoryRow) {
  const parts = [
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
    item.notes,
  ]
  return parts.filter(Boolean).join(' • ') || item.title || 'Untitled item'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatDisposalReason(value: string | null | undefined) {
  if (!value) return 'Not specified'
  return value
    .replaceAll('_', ' ')
    .replace(/\w/g, (letter) => letter.toUpperCase())
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

async function carryForwardEndingInventory(formData: FormData) {
  'use server'

  const year = clampYear(String(formData.get('tax_year') ?? ''))
  const nextYear = year + 1
  const endingInventoryCost = parseMoneyInput(formData.get('ending_inventory_cost'))

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const existingSettingsRes = await supabase
    .from('tax_year_settings')
    .select(`
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
    .eq('tax_year', nextYear)
    .maybeSingle()

  const existingSettings = existingSettingsRes.data as Partial<TaxYearSettingsRow> | null

  const existingNotes = String(existingSettings?.notes ?? '').trim()
  const carryForwardNote = `Beginning inventory carried forward from ${year} ending inventory: ${money(endingInventoryCost)}.`
  const nextNotes = existingNotes
    ? `${existingNotes}\n${carryForwardNote}`
    : carryForwardNote

  await supabase
    .from('tax_year_settings')
    .upsert(
      {
        user_id: user.id,
        tax_year: nextYear,
        beginning_inventory: endingInventoryCost,
        business_use_of_home: Number(existingSettings?.business_use_of_home ?? 0),
        vehicle_expense: Number(existingSettings?.vehicle_expense ?? 0),
        depreciation_expense: Number(existingSettings?.depreciation_expense ?? 0),
        legal_professional: Number(existingSettings?.legal_professional ?? 0),
        insurance: Number(existingSettings?.insurance ?? 0),
        utilities: Number(existingSettings?.utilities ?? 0),
        taxes_licenses: Number(existingSettings?.taxes_licenses ?? 0),
        repairs_maintenance: Number(existingSettings?.repairs_maintenance ?? 0),
        notes: nextNotes,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,tax_year',
      }
    )

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
    expensesRes,
    disposalTransactionsRes,
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
      .from('expenses')
      .select(`
        category,
        amount
      `)
      .eq('user_id', user.id)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate),

    supabase
      .from('inventory_transactions')
      .select(`
        id,
        inventory_item_id,
        transaction_type,
        quantity_change,
        notes,
        disposal_reason,
        disposal_notes,
        finalized_for_tax,
        created_at
      `)
      .eq('user_id', user.id)
      .eq('transaction_type', 'disposal_writeoff_review')
      .eq('finalized_for_tax', true)
      .gte('created_at', `${startDate}T00:00:00.000Z`)
      .lte('created_at', `${endDate}T23:59:59.999Z`)
      .order('created_at', { ascending: false })
      .limit(DETAIL_LIMIT),

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

  const breakSummaryRows = (breaksSummaryRes.data ?? []) as BreakSummaryRow[]
  const breaks = (breaksDetailRes.data ?? []) as BreakRow[]

  const salesSummaryRows = (salesSummaryRes.data ?? []) as SaleSummaryRow[]
  const sales = (salesDetailRes.data ?? []) as SaleRow[]

  const inventorySummaryRows = (inventorySummaryRes.data ?? []) as InventorySummaryRow[]
  const endingInventory = (inventoryDetailRes.data ?? []) as InventoryRow[]

  const expenses = (expensesRes.data ?? []) as ExpenseRow[]

  const taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null
  const disposalTransactions = (disposalTransactionsRes.data ?? []) as DisposalTransactionRow[]
  const disposalItemIds = Array.from(
    new Set(
      disposalTransactions
        .map((row) => row.inventory_item_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  let disposalItemRows: DisposalInventoryRow[] = []

  if (disposalItemIds.length > 0) {
    const disposalItemsRes = await supabase
      .from('inventory_items')
      .select(`
        id,
        title,
        player_name,
        year,
        set_name,
        card_number,
        notes,
        cost_basis_total,
        cost_basis_unit
      `)
      .eq('user_id', user.id)
      .in('id', disposalItemIds)

    disposalItemRows = (disposalItemsRes.data ?? []) as DisposalInventoryRow[]
  }

  const disposalItemsById = new Map(disposalItemRows.map((item) => [item.id, item]))

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

  const totalDisposalReviewCost = disposalTransactions.reduce((sum, row) => {
    const item = row.inventory_item_id ? disposalItemsById.get(row.inventory_item_id) : null
    return sum + Number(item?.cost_basis_total ?? 0)
  }, 0)

  const totalDisposalReviewQuantity = disposalTransactions.reduce((sum, row) => {
    return sum + Math.abs(Number(row.quantity_change ?? 0))
  }, 0)

  const nextYear = selectedYear + 1

  const nextTaxSettingsRes = await supabase
    .from('tax_year_settings')
    .select('beginning_inventory, notes')
    .eq('user_id', user.id)
    .eq('tax_year', nextYear)
    .maybeSingle()

  const nextTaxSettings = nextTaxSettingsRes.data as Pick<
    TaxYearSettingsRow,
    'beginning_inventory' | 'notes'
  > | null

  if (!nextTaxSettings && endingInventoryCost > 0) {
    await supabase
      .from('tax_year_settings')
      .upsert(
        {
          user_id: user.id,
          tax_year: nextYear,
          beginning_inventory: endingInventoryCost,
          business_use_of_home: 0,
          vehicle_expense: 0,
          depreciation_expense: 0,
          legal_professional: 0,
          insurance: 0,
          utilities: 0,
          taxes_licenses: 0,
          repairs_maintenance: 0,
          notes: `Auto-created from ${selectedYear} ending inventory: ${money(endingInventoryCost)}.`,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,tax_year',
        }
      )
  }

  const beginningInventory = Number(taxSettings?.beginning_inventory ?? 0)
  const businessUseOfHome = Number(taxSettings?.business_use_of_home ?? 0)
  const vehicleExpense = Number(taxSettings?.vehicle_expense ?? 0)
  const depreciationExpense = Number(taxSettings?.depreciation_expense ?? 0)
  const legalProfessional = Number(taxSettings?.legal_professional ?? 0)
  const insurance = Number(taxSettings?.insurance ?? 0)
  const utilities = Number(taxSettings?.utilities ?? 0)
  const taxesLicenses = Number(taxSettings?.taxes_licenses ?? 0)
  const repairsMaintenance = Number(taxSettings?.repairs_maintenance ?? 0)
  const endingInventoryIsLocked = taxSettings?.ending_inventory_snapshot != null
  const manualExpenseCount = expenses.length
  const uncategorizedExpenseCount = expenses.filter((expense) => {
    const category = String(expense.category ?? '').trim().toLowerCase()
    return !category || category === 'uncategorized' || category.includes('uncategorized') || category === 'other' || category.includes('other')
  }).length
  const disposalRowsMissingReason = disposalTransactions.filter((row) => !String(row.disposal_reason ?? '').trim()).length
  const disposalRowsMissingNotes = disposalTransactions.filter((row) => !String(row.disposal_notes ?? '').trim()).length

  const taxReadinessWarnings: string[] = []

  if (!taxSettings) {
    taxReadinessWarnings.push('No yearly tax settings record exists yet. Beginning inventory and extra Schedule C lines are using zero defaults.')
  }

  if (beginningInventory === 0 && (totalCOGS > 0 || endingInventoryCost > 0)) {
    taxReadinessWarnings.push('Beginning inventory is zero. Confirm this is correct before filing.')
  }

  if (!endingInventoryIsLocked) {
    taxReadinessWarnings.push('Ending inventory is not locked. Report values may change if inventory changes. Lock the tax-year snapshot before filing or sending final numbers to a CPA.')
  }

  if (uncategorizedExpenseCount > 0) {
    taxReadinessWarnings.push(`${uncategorizedExpenseCount} other / uncategorized expense record${uncategorizedExpenseCount === 1 ? '' : 's'} should be reviewed before filing.`)
  }

  if (manualExpenseCount === 0 && salesSummaryRows.length > 0) {
    taxReadinessWarnings.push('No manual expenses were recorded for the year. Confirm supplies, software, subscriptions, equipment, and other costs were not missed.')
  }

  if (disposalTransactions.length > 0) {
    taxReadinessWarnings.push('Finalized disposal / write-off review items exist. Review them so they are not double counted as expenses, giveaways, donations, or separate inventory losses.')
  }

  if (disposalRowsMissingReason > 0) {
    taxReadinessWarnings.push(`${disposalRowsMissingReason} finalized disposal item${disposalRowsMissingReason === 1 ? '' : 's'} missing a disposal reason.`)
  }

  if (disposalRowsMissingNotes > 0) {
    taxReadinessWarnings.push(`${disposalRowsMissingNotes} finalized disposal item${disposalRowsMissingNotes === 1 ? '' : 's'} missing detailed notes.`)
  }

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

          <TaxExportButton year={selectedYear} readinessWarnings={taxReadinessWarnings} />

          <TaxPdfExportButton year={selectedYear} readinessWarnings={taxReadinessWarnings} />
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
              {Array.from({ length: 6 }).map((_, i) => {
                const year = new Date().getFullYear() + 1 - i
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

            <TaxPdfExportButton year={selectedYear} readinessWarnings={taxReadinessWarnings} />
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

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Disposal Review Items" value={String(disposalTransactions.length)} />
        <StatCard label="Disposal Review Qty" value={String(totalDisposalReviewQuantity)} />
        <StatCard label="Disposal Review Cost" value={money(totalDisposalReviewCost)} />
        <StatCard label="Write-Off Status" value="Review" />
      </div>

      <div className="app-section p-5">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Disposal / Write-Off Review</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Finalized disposal records are shown here for accountant and year-end review. These are not treated as a second manual expense; they document inventory that physically left the business.
          </p>
        </div>

        <div className="app-table-wrap">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Date</th>
                  <th className="app-th">Item</th>
                  <th className="app-th">Reason</th>
                  <th className="app-th text-right">Cost Basis</th>
                  <th className="app-th">Notes / Remarks</th>
                </tr>
              </thead>
              <tbody>
                {disposalTransactions.map((row) => {
                  const item = row.inventory_item_id ? disposalItemsById.get(row.inventory_item_id) : null

                  return (
                    <tr key={row.id} className="app-tr align-top">
                      <td className="app-td whitespace-nowrap">{formatDate(row.created_at)}</td>
                      <td className="app-td min-w-[260px]">{item ? buildItemName(item) : 'Inventory item not found'}</td>
                      <td className="app-td whitespace-nowrap">{formatDisposalReason(row.disposal_reason)}</td>
                      <td className="app-td text-right whitespace-nowrap">{money(item?.cost_basis_total)}</td>
                      <td className="app-td min-w-[320px]">
                        <div className="text-sm text-zinc-200">{row.disposal_notes || 'No additional remarks entered.'}</div>
                        <div className="mt-1 text-xs text-zinc-500">{row.notes || '—'}</div>
                      </td>
                    </tr>
                  )
                })}

                {disposalTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                      No finalized disposal write-off review records found for {selectedYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {endingInventoryCost > 0 && (
        <div className="rounded-2xl border border-emerald-800/60 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          The system checks for a {nextYear} tax settings record automatically. If one does not exist yet, it creates it using {selectedYear} ending inventory as {nextYear} beginning inventory.
        </div>
      )}

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

            <TaxPdfExportButton year={selectedYear} readinessWarnings={taxReadinessWarnings} />
          </div>
        </form>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Inventory Carryover</h3>
              <p className="mt-1 max-w-3xl text-sm text-zinc-400">
                Use this after reviewing the year. It will copy {selectedYear} ending inventory cost into {selectedYear + 1} beginning inventory so next year&apos;s Schedule C starts with the correct carryover number.
              </p>
              <p className="mt-2 text-sm text-zinc-300">
                Carryover amount:{' '}
                <span className="font-semibold text-zinc-100">
                  {money(endingInventoryCost)}
                </span>
              </p>
            </div>

            <form action={carryForwardEndingInventory}>
              <input type="hidden" name="tax_year" value={selectedYear} />
              <input
                type="hidden"
                name="ending_inventory_cost"
                value={endingInventoryCost}
              />

              <button type="submit" className="app-button-primary">
                Carry Forward to {selectedYear + 1}
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            This updates or creates the {selectedYear + 1} Schedule C settings record. You can still edit the beginning inventory later if needed.
          </div>
        </div>
      </div>
    </div>
  )
}