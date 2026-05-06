import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  lockEndingInventorySnapshotAction,
  saveTaxYearSettingsAction,
  unlockEndingInventorySnapshotAction,
} from '@/app/actions/tax'

type SearchParams = Promise<{
  year?: string
  success?: string
  error?: string
}>

type TaxYearSettingsRow = {
  tax_year: number
  beginning_inventory: number | null
  ending_inventory_snapshot: number | null
  ending_inventory_item_count: number | null
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

type SaleRow = {
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  cost_of_goods_sold: number | null
}

type InventoryRow = {
  id: string
  available_quantity: number | null
  quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
}

type ExpenseRow = {
  category: string | null
  amount: number | null
}

function clampYear(raw?: string) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return Math.floor(parsed)
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not locked'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function numberInputValue(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2)
}

function calculateLiveEndingInventory(rows: InventoryRow[]) {
  return roundMoney(
    rows.reduce((sum, row) => {
      const availableQty = Number(row.available_quantity ?? 0)
      const quantity = Number(row.quantity ?? 0)
      const unitCost = Number(row.cost_basis_unit ?? 0)
      const totalCost = Number(row.cost_basis_total ?? 0)

      if (availableQty > 0 && unitCost > 0) {
        return sum + availableQty * unitCost
      }

      if (availableQty > 0 && quantity > 0 && totalCost > 0) {
        return sum + (totalCost / quantity) * availableQty
      }

      return sum + totalCost
    }, 0)
  )
}

function mapExpenseCategoryToBucket(category: string | null) {
  const normalized = String(category ?? '').trim().toLowerCase()

  if (normalized.includes('advertising') || normalized.includes('marketing')) {
    return 'advertising'
  }

  if (normalized.includes('giveaway')) {
    return 'giveaways'
  }

  if (normalized.includes('supply') || normalized.includes('sleeve') || normalized.includes('toploader') || normalized.includes('top loader') || normalized.includes('mailer') || normalized.includes('box') || normalized.includes('label') || normalized.includes('envelope')) {
    return 'supplies'
  }

  if (normalized.includes('shipping') || normalized.includes('postage')) {
    return 'shipping'
  }

  return 'other'
}

function SettingMoneyField({
  label,
  name,
  defaultValue,
  help,
}: {
  label: string
  name: string
  defaultValue: number | null | undefined
  help?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
        {label}
      </label>
      <input
        name={name}
        type="number"
        min={0}
        step="0.01"
        defaultValue={numberInputValue(defaultValue)}
        className="app-input"
      />
      {help ? <div className="mt-1 text-xs leading-relaxed text-zinc-500">{help}</div> : null}
    </div>
  )
}

function StatCard({
  label,
  value,
  help,
}: {
  label: string
  value: string
  help?: string
}) {
  return (
    <div className="app-card-tight p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-tight">{value}</div>
      {help ? <div className="mt-1 text-xs leading-relaxed text-zinc-500">{help}</div> : null}
    </div>
  )
}

function StepCard({
  step,
  title,
  description,
  status,
}: {
  step: string
  title: string
  description: string
  status: 'done' | 'warning' | 'pending'
}) {
  const badgeClass =
    status === 'done'
      ? 'app-badge app-badge-success'
      : status === 'warning'
        ? 'app-badge app-badge-warning'
        : 'app-badge app-badge-neutral'

  const badgeText =
    status === 'done' ? 'Done' : status === 'warning' ? 'Review' : 'Pending'

  return (
    <div className="app-card-tight p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Step {step}
          </div>
          <div className="mt-1 font-semibold text-zinc-100">{title}</div>
        </div>
        <span className={badgeClass}>{badgeText}</span>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</div>
    </div>
  )
}

export default async function TaxSettingsPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const params = searchParams ? await searchParams : undefined
  const selectedYear = clampYear(params?.year)
  const successMessage = String(params?.success ?? '').trim()
  const errorMessage = String(params?.error ?? '').trim()

  const startDate = `${selectedYear}-01-01`
  const endDate = `${selectedYear}-12-31`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [settingsRes, salesRes, inventoryRes, expensesRes] = await Promise.all([
    supabase
      .from('tax_year_settings')
      .select(`
        tax_year,
        beginning_inventory,
        ending_inventory_snapshot,
        ending_inventory_item_count,
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

    supabase
      .from('sales')
      .select('gross_sale, platform_fees, shipping_cost, other_costs, cost_of_goods_sold')
      .eq('user_id', user.id)
      .is('reversed_at', null)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate),

    supabase
      .from('inventory_items')
      .select('id, available_quantity, quantity, cost_basis_unit, cost_basis_total')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gt('available_quantity', 0),

    supabase
      .from('expenses')
      .select('category, amount')
      .eq('user_id', user.id)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate),
  ])

  const settings = (settingsRes.data ?? null) as TaxYearSettingsRow | null
  const sales = (salesRes.data ?? []) as SaleRow[]
  const liveInventoryRows = (inventoryRes.data ?? []) as InventoryRow[]
  const expenses = (expensesRes.data ?? []) as ExpenseRow[]

  const beginningInventory = roundMoney(Number(settings?.beginning_inventory ?? 0))
  const liveEndingInventory = calculateLiveEndingInventory(liveInventoryRows)
  const lockedEndingInventory =
    settings?.ending_inventory_snapshot != null
      ? roundMoney(Number(settings.ending_inventory_snapshot ?? 0))
      : null
  const endingInventoryForCogs = lockedEndingInventory ?? liveEndingInventory
  const endingInventoryIsLocked = lockedEndingInventory != null

  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  )

  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.cost_of_goods_sold ?? 0), 0)
  )

  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.platform_fees ?? 0), 0)
  )

  const totalSaleShipping = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.shipping_cost ?? 0), 0)
  )

  const totalSaleOtherCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.other_costs ?? 0), 0)
  )

  const manualExpenseBuckets = expenses.reduce(
    (totals, expense) => {
      const amount = Number(expense.amount ?? 0)
      const bucket = mapExpenseCategoryToBucket(expense.category)

      if (bucket === 'advertising') totals.advertising += amount
      else if (bucket === 'giveaways') totals.giveaways += amount
      else if (bucket === 'supplies') totals.supplies += amount
      else if (bucket === 'shipping') totals.shipping += amount
      else totals.other += amount

      totals.total += amount
      return totals
    },
    {
      advertising: 0,
      giveaways: 0,
      supplies: 0,
      shipping: 0,
      other: 0,
      total: 0,
    }
  )

  const totalManualExpenses = roundMoney(manualExpenseBuckets.total)
  const totalTrackedSellingCosts = roundMoney(totalPlatformFees + totalSaleShipping + totalSaleOtherCosts)
  const purchasesSupport = roundMoney(totalCOGS + endingInventoryForCogs - beginningInventory)
  const grossIncomeAfterCOGS = roundMoney(totalGrossSales - totalCOGS)

  const extraScheduleCSettings = roundMoney(
    Number(settings?.business_use_of_home ?? 0) +
      Number(settings?.vehicle_expense ?? 0) +
      Number(settings?.depreciation_expense ?? 0) +
      Number(settings?.legal_professional ?? 0) +
      Number(settings?.insurance ?? 0) +
      Number(settings?.utilities ?? 0) +
      Number(settings?.taxes_licenses ?? 0) +
      Number(settings?.repairs_maintenance ?? 0)
  )

  const estimatedNetProfit = roundMoney(
    totalGrossSales - totalCOGS - totalTrackedSellingCosts - totalManualExpenses - extraScheduleCSettings
  )

  const savedSettings = Boolean(settings)
  const hasActivity = totalGrossSales > 0 || totalCOGS > 0 || liveEndingInventory > 0 || totalManualExpenses > 0
  const beginningInventoryNeedsReview = beginningInventory === 0 && hasActivity
  const readyForFinalExport = savedSettings && endingInventoryIsLocked && purchasesSupport >= 0 && !beginningInventoryNeedsReview

  const warnings: string[] = []

  if (!savedSettings) {
    warnings.push('No saved tax year settings yet. Save this page before relying on reports for this year.')
  }

  if (beginningInventoryNeedsReview) {
    warnings.push('Beginning inventory is zero. Confirm this is correct if inventory carried over from a prior year.')
  }

  if (!endingInventoryIsLocked) {
    warnings.push('Ending inventory is not locked. Reports are using the current live inventory value until you lock this year.')
  }

  if (endingInventoryIsLocked && Math.abs(lockedEndingInventory - liveEndingInventory) > 0.009) {
    warnings.push('Locked ending inventory differs from live inventory. This is normal after filing, but review before filing.')
  }

  if (purchasesSupport < 0) {
    warnings.push('COGS tie-out produced negative purchases support. Review beginning inventory, ending inventory, and sold-item COGS.')
  }

  if (warnings.length === 0) {
    warnings.push('No major CPA readiness warnings detected for this tax year.')
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 7 }).map((_, index) => currentYear + 1 - index)

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header">
        <div>
          <div className="mb-1">
            <Link href="/app/settings" className="text-xs text-zinc-400 hover:underline">
              ← Back to Settings
            </Link>
          </div>
          <h1 className="app-title">Tax Year Settings</h1>
          <p className="app-subtitle">
            Guided CPA setup for beginning inventory, ending inventory locks, Schedule C support, and export readiness.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/app/reports/tax?year=${selectedYear}`} className="app-button">
            View Tax Report
          </Link>
          <Link href="/app/settings" className="app-button">
            Settings
          </Link>
        </div>
      </div>

      {successMessage ? <div className="app-alert-success">{successMessage}</div> : null}
      {errorMessage ? <div className="app-alert-error">{errorMessage}</div> : null}

      <div className={readyForFinalExport ? 'app-alert-success' : 'app-alert-warning'}>
        <div className="font-semibold">
          {readyForFinalExport
            ? `CPA-ready for ${selectedYear}`
            : `Action needed before final CPA export for ${selectedYear}`}
        </div>
        <div className="mt-1 text-sm">
          {readyForFinalExport
            ? 'Settings are saved, ending inventory is locked, and the COGS tie-out does not show major issues.'
            : 'Review the checklist below, save settings, and lock ending inventory before filing or sending final numbers to a CPA.'}
        </div>
      </div>

      <div className="app-section">
        <form method="get" className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tax Year</label>
            <select name="year" defaultValue={String(selectedYear)} className="app-select max-w-40">
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="app-button">
            Load Year
          </button>
        </form>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <StepCard
          step="1"
          title="Save beginning inventory"
          description="Enter the cost value of inventory carried into January 1. If this was your first year with no prior inventory, zero is okay."
          status={savedSettings && !beginningInventoryNeedsReview ? 'done' : beginningInventoryNeedsReview ? 'warning' : 'pending'}
        />
        <StepCard
          step="2"
          title="Review auto-calculated activity"
          description="Sales, COGS, expenses, shipping, supplies, and giveaways are pulled from your app records. Use this page as a guided checklist."
          status={hasActivity ? 'done' : 'pending'}
        />
        <StepCard
          step="3"
          title="Lock ending inventory"
          description="Lock after the tax year is complete so later inventory edits do not change filed reports or CPA exports."
          status={endingInventoryIsLocked ? 'done' : 'warning'}
        />
      </div>

      <div className="app-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tax Summary Preview</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Auto-calculated from your app records. These numbers help you fill and verify the settings below.
            </p>
          </div>

          <div className="text-sm text-zinc-400">
            {sales.length} sale(s), {expenses.length} manual expense(s), {liveInventoryRows.length} unsold inventory item(s)
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard label="Gross Sales" value={money(totalGrossSales)} />
          <StatCard label="Realized COGS" value={money(totalCOGS)} />
          <StatCard label="Gross Income After COGS" value={money(grossIncomeAfterCOGS)} />
          <StatCard label="Estimated Net Profit" value={money(estimatedNetProfit)} />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <StatCard label="Platform Fees" value={money(totalPlatformFees)} />
          <StatCard label="Sale Shipping / Supplies" value={money(totalSaleShipping)} help="Currently stored together on sales." />
          <StatCard label="Manual Expenses" value={money(totalManualExpenses)} />
          <StatCard label="Extra CPA Inputs" value={money(extraScheduleCSettings)} />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <StatCard label="Manual Shipping" value={money(manualExpenseBuckets.shipping)} />
          <StatCard label="Manual Supplies" value={money(manualExpenseBuckets.supplies)} />
          <StatCard label="Giveaways / Marketing" value={money(manualExpenseBuckets.giveaways + manualExpenseBuckets.advertising)} />
          <StatCard label="Other Manual Expenses" value={money(manualExpenseBuckets.other)} />
        </div>
      </div>

      <div className="app-section">
        <h2 className="text-lg font-semibold">CPA / Schedule C COGS Tie-Out</h2>
        <p className="mt-1 text-sm text-zinc-400">
          This is the core inventory math used by the tax report and export files.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard label="Beginning Inventory" value={money(beginningInventory)} help="Manual value you confirm below." />
          <StatCard label="+ Purchases Support" value={money(purchasesSupport)} help="COGS + Ending Inventory - Beginning Inventory." />
          <StatCard
            label="- Ending Inventory"
            value={money(endingInventoryForCogs)}
            help={endingInventoryIsLocked ? 'Using locked snapshot.' : 'Using live value until locked.'}
          />
          <StatCard label="= Realized COGS" value={money(totalCOGS)} />
        </div>
      </div>

      <div className="app-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tax Readiness</h2>
            <p className="mt-1 text-sm text-zinc-400">
              These checks protect users from filing numbers that can drift or double count.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {warnings.map((warning) => (
            <div key={warning} className={warning.startsWith('No major') ? 'app-alert-success' : 'app-alert-warning'}>
              {warning}
            </div>
          ))}
        </div>
      </div>

      <div className="app-section">
        <form action={saveTaxYearSettingsAction}>
          <input type="hidden" name="tax_year" value={selectedYear} />

          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Required Tax Input</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Most users only need to confirm beginning inventory here. Everything else can stay zero unless it applies.
              </p>
            </div>

            <button type="submit" className="app-button-primary">
              Save Tax Settings
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SettingMoneyField
              label="Beginning Inventory"
              name="beginning_inventory"
              defaultValue={settings?.beginning_inventory}
              help="Inventory cost carried into Jan 1 of this tax year. If no prior inventory existed, use 0.00."
            />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Suggested review
              </div>
              <div className="mt-2 text-sm leading-relaxed text-zinc-300">
                Use last year’s locked ending inventory, your prior spreadsheet, or CPA records. Do not use today’s current inventory unless this is actually the first day of the tax year.
              </div>
            </div>

            <div className="md:col-span-2">
              <details className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-100">
                  Optional advanced Schedule C fields
                </summary>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SettingMoneyField
                    label="Business Use of Home"
                    name="business_use_of_home"
                    defaultValue={settings?.business_use_of_home}
                    help="Schedule C line 30 support, if applicable."
                  />
                  <SettingMoneyField label="Vehicle Expense" name="vehicle_expense" defaultValue={settings?.vehicle_expense} />
                  <SettingMoneyField label="Depreciation / Section 179" name="depreciation_expense" defaultValue={settings?.depreciation_expense} />
                  <SettingMoneyField label="Legal / Professional" name="legal_professional" defaultValue={settings?.legal_professional} />
                  <SettingMoneyField label="Insurance" name="insurance" defaultValue={settings?.insurance} />
                  <SettingMoneyField label="Utilities" name="utilities" defaultValue={settings?.utilities} />
                  <SettingMoneyField label="Taxes / Licenses" name="taxes_licenses" defaultValue={settings?.taxes_licenses} />
                  <SettingMoneyField label="Repairs / Maintenance" name="repairs_maintenance" defaultValue={settings?.repairs_maintenance} />
                </div>
              </details>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
                CPA Notes
              </label>
              <textarea
                name="notes"
                rows={4}
                defaultValue={settings?.notes ?? ''}
                className="app-textarea"
                placeholder="Optional notes for CPA review, corrections, carryover details, or filing assumptions."
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button type="submit" className="app-button-primary">
              Save Tax Settings
            </button>
          </div>
        </form>
      </div>

      <div className="app-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ending Inventory Snapshot Lock</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Lock this after the year is complete. Once locked, exports use the saved tax-year snapshot instead of live inventory.
            </p>
          </div>

          <div className="text-sm text-zinc-400">
            Current live value:{' '}
            <span className="font-semibold text-zinc-100">{money(liveEndingInventory)}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatCard
            label="Current Live Value"
            value={money(liveEndingInventory)}
            help={`${liveInventoryRows.length} current unsold item(s).`}
          />
          <StatCard
            label="Locked Value"
            value={endingInventoryIsLocked ? money(lockedEndingInventory) : 'Not locked'}
            help={formatDateTime(settings?.ending_inventory_locked_at)}
          />
          <StatCard
            label="Snapshot Status"
            value={endingInventoryIsLocked ? 'Locked' : 'Live'}
            help={endingInventoryIsLocked ? 'Safe for final export.' : 'Lock before final CPA export.'}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <form action={lockEndingInventorySnapshotAction} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <input type="hidden" name="tax_year" value={selectedYear} />

            <div className="text-sm font-semibold text-zinc-200">Lock Snapshot</div>
            <div className="mt-1 text-xs leading-relaxed text-zinc-400">
              Type LOCK to confirm. This records the current live ending inventory as the official snapshot for {selectedYear}.
            </div>

            <input name="confirm_lock" placeholder="LOCK" className="app-input mt-3" />

            <button type="submit" className="app-button-primary mt-3">
              Lock Ending Inventory
            </button>
          </form>

          <form action={unlockEndingInventorySnapshotAction} className="rounded-2xl border border-red-900/60 bg-red-950/10 p-4">
            <input type="hidden" name="tax_year" value={selectedYear} />

            <div className="text-sm font-semibold text-red-200">Unlock Snapshot</div>
            <div className="mt-1 text-xs leading-relaxed text-zinc-400">
              Type UNLOCK only if correcting records before filing. Avoid unlocking a filed year unless your CPA tells you to amend or correct it.
            </div>

            <input name="confirm_unlock" placeholder="UNLOCK" className="app-input mt-3" />

            <button type="submit" className="app-button-danger mt-3">
              Unlock Snapshot
            </button>
          </form>
        </div>
      </div>

      <div className="app-section">
        <h2 className="text-lg font-semibold">Final Export Checklist</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className={savedSettings ? 'app-alert-success' : 'app-alert-warning'}>
            {savedSettings ? 'Tax settings are saved.' : 'Save tax settings before export.'}
          </div>
          <div className={endingInventoryIsLocked ? 'app-alert-success' : 'app-alert-warning'}>
            {endingInventoryIsLocked ? 'Ending inventory is locked.' : 'Ending inventory is not locked yet.'}
          </div>
          <div className={purchasesSupport >= 0 ? 'app-alert-success' : 'app-alert-error'}>
            {purchasesSupport >= 0 ? 'COGS tie-out is not negative.' : 'COGS tie-out needs review.'}
          </div>
          <div className={!beginningInventoryNeedsReview ? 'app-alert-success' : 'app-alert-warning'}>
            {!beginningInventoryNeedsReview ? 'Beginning inventory reviewed.' : 'Beginning inventory needs confirmation.'}
          </div>
        </div>
      </div>
    </div>
  )
}
