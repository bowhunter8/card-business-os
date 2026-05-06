import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  total_cost: number | null
  reversed_at: string | null
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
  reversed_at: string | null
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

type CellValue = string | number | null | undefined

type ExpenseCategorySummaryRow = {
  category: string
  amount: number
  count: number
  scheduleCArea: string
}

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }
  return parsed
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

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function worksheetName(value: string) {
  const cleaned = value.replace(/[\\/*?:[\]]/g, ' ').trim()
  return cleaned.slice(0, 31) || 'Sheet'
}

function inferType(value: CellValue) {
  if (typeof value === 'number' && Number.isFinite(value)) return 'Number'
  return 'String'
}

function cellXml(value: CellValue, styleId?: string) {
  const styleAttr = styleId ? ` ss:StyleID="${styleId}"` : ''

  if (value === null || value === undefined || value === '') {
    return `<Cell${styleAttr}/>`
  }

  const type = inferType(value)
  const output = type === 'Number' ? String(value) : xmlEscape(value)

  return `<Cell${styleAttr}><Data ss:Type="${type}">${output}</Data></Cell>`
}

function rowXml(values: CellValue[], styleId?: string) {
  return `<Row>${values.map((value) => cellXml(value, styleId)).join('')}</Row>`
}

function worksheetXml(name: string, rows: CellValue[][]) {
  return `
    <Worksheet ss:Name="${xmlEscape(worksheetName(name))}">
      <Table>
        ${rows.map((row, index) => rowXml(row, index === 0 ? 'Header' : undefined)).join('')}
      </Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <FreezePanes/>
        <FrozenNoSplit/>
        <SplitHorizontal>1</SplitHorizontal>
        <TopRowBottomPane>1</TopRowBottomPane>
        <ProtectObjects>False</ProtectObjects>
        <ProtectScenarios>False</ProtectScenarios>
      </WorksheetOptions>
    </Worksheet>
  `
}

function mapExpenseCategoryToScheduleCArea(category: string) {
  const normalized = category.trim().toLowerCase()

  if (normalized.includes('advertising') || normalized.includes('marketing')) {
    return 'Advertising'
  }

  if (normalized.includes('platform') || normalized.includes('fee') || normalized.includes('commission')) {
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

function sumRows(rows: ExpenseCategorySummaryRow[], scheduleCArea: string) {
  return roundMoney(
    rows
      .filter((row) => row.scheduleCArea === scheduleCArea)
      .reduce((sum, row) => sum + row.amount, 0)
  )
}

function countRows(rows: ExpenseCategorySummaryRow[], scheduleCArea: string) {
  return rows
    .filter((row) => row.scheduleCArea === scheduleCArea)
    .reduce((sum, row) => sum + row.count, 0)
}

function categoryIncludes(row: ExpenseCategorySummaryRow, keywords: string[]) {
  const normalized = row.category.toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword))
}

export async function GET(request: NextRequest) {
  const year = clampYear(request.nextUrl.searchParams.get('year'))
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const [breaksRes, salesRes, inventoryRes, expensesRes, taxSettingsRes] = await Promise.all([
    supabase
      .from('breaks')
      .select('id, break_date, source_name, product_name, order_number, total_cost, reversed_at')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .is('reversed_at', null)
      .order('break_date', { ascending: true }),

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
        inventory_item_id,
        reversed_at
      `)
      .eq('user_id', user.id)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .is('reversed_at', null)
      .order('sale_date', { ascending: true }),

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
      .order('expense_date', { ascending: true })
      .order('created_at', { ascending: true }),

    supabase
      .from('tax_year_settings')
      .select(`
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
      .eq('tax_year', year)
      .maybeSingle(),
  ])

  const breaks: BreakRow[] = (breaksRes.data ?? []) as BreakRow[]
  const sales: SaleRow[] = (salesRes.data ?? []) as SaleRow[]
  const endingInventory: InventoryRow[] = (inventoryRes.data ?? []) as InventoryRow[]
  const expenses: ExpenseRow[] = (expensesRes.data ?? []) as ExpenseRow[]
  const taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null

  const beginningInventory = roundMoney(Number(taxSettings?.beginning_inventory ?? 0))
  const businessUseOfHome = roundMoney(Number(taxSettings?.business_use_of_home ?? 0))
  const vehicleExpense = roundMoney(Number(taxSettings?.vehicle_expense ?? 0))
  const depreciationExpense = roundMoney(Number(taxSettings?.depreciation_expense ?? 0))
  const legalProfessional = roundMoney(Number(taxSettings?.legal_professional ?? 0))
  const insuranceExpense = roundMoney(Number(taxSettings?.insurance ?? 0))
  const utilitiesExpense = roundMoney(Number(taxSettings?.utilities ?? 0))
  const taxesLicenses = roundMoney(Number(taxSettings?.taxes_licenses ?? 0))
  const repairsMaintenance = roundMoney(Number(taxSettings?.repairs_maintenance ?? 0))

  const salesInventoryIds = Array.from(
    new Set(
      sales
        .map((row) => row.inventory_item_id)
        .filter((value): value is string => Boolean(value))
    )
  )

  const inventoryNameMap = new Map<string, InventoryRow>()

  if (salesInventoryIds.length > 0) {
    const relatedInventoryRes = await supabase
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
      .in('id', salesInventoryIds)

    const relatedInventory = (relatedInventoryRes.data ?? []) as InventoryRow[]
    for (const item of relatedInventory) {
      inventoryNameMap.set(item.id, item)
    }
  }

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

  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0)
  )

  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.cost_of_goods_sold ?? 0), 0)
  )

  const totalSalesProfit = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)
  )

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

  const lockedEndingInventoryCost =
    taxSettings?.ending_inventory_snapshot != null
      ? roundMoney(Number(taxSettings.ending_inventory_snapshot ?? 0))
      : null

  const endingInventoryCost = lockedEndingInventoryCost ?? liveEndingInventoryCost
  const endingInventoryIsLocked = lockedEndingInventoryCost != null

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

  const expenseCategoryRows: ExpenseCategorySummaryRow[] = Array.from(expenseByCategory.entries())
    .sort(([left], [right]) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    )
    .map(([category, values]) => ({
      category,
      amount: roundMoney(values.amount),
      count: values.count,
      scheduleCArea: mapExpenseCategoryToScheduleCArea(category),
    }))

  const totalManualExpenses = roundMoney(
    expenseCategoryRows.reduce((sum, row) => sum + row.amount, 0)
  )

  const manualCommissionsAndFees = sumRows(expenseCategoryRows, 'Commissions and fees')
  const turbotaxCommissionsAndFees = roundMoney(totalPlatformFees + manualCommissionsAndFees)
  const turbotaxAdvertising = sumRows(expenseCategoryRows, 'Advertising')
  const turbotaxSupplies = sumRows(expenseCategoryRows, 'Supplies')
  const turbotaxOfficeExpense = sumRows(expenseCategoryRows, 'Office expense')
  const turbotaxTravel = sumRows(expenseCategoryRows, 'Travel')

  const advertisingGiveaways = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Advertising' && row.category.toLowerCase().includes('giveaway'))
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const advertisingMarketingOther = roundMoney(turbotaxAdvertising - advertisingGiveaways)

  const suppliesShippingMaterials = roundMoney(
    expenseCategoryRows
      .filter(
        (row) =>
          row.scheduleCArea === 'Supplies' &&
          categoryIncludes(row, [
            'shipping',
            'mailer',
            'label',
            'toploader',
            'top loader',
            'sleeve',
            'envelope',
            'box',
            'tape',
          ])
      )
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const suppliesGeneral = roundMoney(turbotaxSupplies - suppliesShippingMaterials)

  const otherExpensesPostageAndShipping = roundMoney(
    totalShippingAndSupplies + sumRows(expenseCategoryRows, 'Other expenses / Postage and shipping')
  )
  const otherExpensesSoftwareSubscriptions = sumRows(expenseCategoryRows, 'Other expenses / Software and subscriptions')
  const otherExpensesEquipmentReview = sumRows(expenseCategoryRows, 'Other expenses / Equipment review')
  const otherExpensesGradingAuthentication = sumRows(expenseCategoryRows, 'Other expenses / Grading and authentication')
  const otherExpensesEducation = sumRows(expenseCategoryRows, 'Other expenses / Education')
  const otherExpensesUncategorized = roundMoney(totalOtherCosts + sumRows(expenseCategoryRows, 'Other expenses'))

  const turbotaxOtherExpenses = roundMoney(
    otherExpensesPostageAndShipping +
      otherExpensesSoftwareSubscriptions +
      otherExpensesEquipmentReview +
      otherExpensesGradingAuthentication +
      otherExpensesEducation +
      otherExpensesUncategorized
  )

  const grossIncomeLine7 = roundMoney(totalGrossSales - totalCOGS)
  const purchasesForCogsSupport = roundMoney(totalCOGS + endingInventoryCost - beginningInventory)
  const costOfItemsAvailableForSale = roundMoney(beginningInventory + purchasesForCogsSupport)
  const cogsCrossCheck = roundMoney(costOfItemsAvailableForSale - endingInventoryCost)

  const totalBusinessExpenses = roundMoney(
    turbotaxAdvertising +
      vehicleExpense +
      turbotaxCommissionsAndFees +
      depreciationExpense +
      insuranceExpense +
      legalProfessional +
      turbotaxOfficeExpense +
      repairsMaintenance +
      turbotaxSupplies +
      taxesLicenses +
      turbotaxTravel +
      utilitiesExpense +
      turbotaxOtherExpenses
  )

  const scheduleCLine29TentativeProfit = roundMoney(grossIncomeLine7 - totalBusinessExpenses)
  const scheduleCLine31NetProfit = roundMoney(scheduleCLine29TentativeProfit - businessUseOfHome)

  const warnings: string[] = []

  if (!taxSettings) {
    warnings.push('No yearly tax settings record exists. Beginning inventory and extra Schedule C lines are using zero defaults.')
  }

  if (beginningInventory === 0 && (totalCOGS > 0 || endingInventoryCost > 0)) {
    warnings.push('Beginning inventory is zero. Confirm this is correct before filing.')
  }

  if (purchasesForCogsSupport < 0) {
    warnings.push('COGS support produced negative purchases. Review beginning inventory and ending inventory before filing.')
  }

  if (manualCommissionsAndFees > 0) {
    warnings.push('Manual commission / fee expenses are included on Schedule C Line 10. Confirm these are not duplicates of sale-level platform fees.')
  }

  if (otherExpensesUncategorized > 0) {
    warnings.push('Other / uncategorized expenses exist. Review and rename categories before filing if possible.')
  }

  if (otherExpensesEquipmentReview > 0) {
    warnings.push('Equipment review expenses exist. Confirm whether they should be expensed, depreciated, or Section 179.')
  }

  if (totalShippingAndSupplies > 0) {
    warnings.push('Sale-level shipping_cost currently combines postage and shipping supplies. Review detail if separating postage from supplies is needed.')
  }

  if (endingInventoryIsLocked) {
    warnings.push(
      `Ending inventory is locked for this tax year${taxSettings?.ending_inventory_locked_at ? ` at ${taxSettings.ending_inventory_locked_at}` : ''}. This is CPA-safe for filed-year reporting.`
    )
  } else {
    warnings.push('Ending inventory is NOT locked. Export values may change if inventory changes. Lock the tax-year snapshot before filing or sending final numbers to a CPA.')
  }

  const readMeRows: CellValue[][] = [
    ['Worksheet', 'Purpose', 'How to Use'],
    ['Read_Me', 'Quick explanation of this workbook', 'Start here first before entering anything into tax software or sharing with a CPA'],
    ['TurboTax_Ready', 'Simple entry sheet for Schedule C / TurboTax', 'Use this first during tax prep. It is designed to show the numbers users need without hunting through every worksheet'],
    ['QuickBooks_Level_Summary', 'Top-level summary in business-report style', 'Use this like a QuickBooks-style profit and loss plus inventory support overview'],
    ['Schedule_C_Summary', 'Schedule C category mapping', 'Use this tab when entering annual totals into TurboTax or giving numbers to a preparer'],
    ['Schedule_C_Entry_Guide', 'Plain-English guide for where numbers go', 'Use this tab to avoid hunting through detail rows during tax prep'],
    ['COGS_Worksheet', 'Inventory / COGS support', 'Uses Beginning Inventory + Purchases - Ending Inventory = COGS'],
    ['Break_Purchases', 'Detailed purchase support', 'Reference only; supports break acquisition history for the year'],
    ['Sales_Detail', 'Detailed sale support', 'Reference only; supports gross sales, fees, shipping/supplies, COGS, and profit'],
    ['Sale_Expense_Detail', 'Expense-focused sales view', 'Reference only; easier for reviewing sale-level expense buckets'],
    ['Manual_Expense_Summary', 'User-entered expense totals by category', 'Use this for QuickBooks-style expense category review'],
    ['Manual_Expense_Log', 'Detailed user-entered expense records', 'Reference only; supports receipts, notes, vendors, and manual expense categories'],
    ['Ending_Inventory', 'Unsold inventory snapshot', 'Reference only; supports ending inventory at export time'],
    ['Tax_Readiness_Checks', 'Warnings and review points', 'Review before filing or sending to a CPA'],
    ['Important note', 'TurboTax import', 'This workbook is designed for clean reference and manual entry, not direct TurboTax Schedule C import'],
    ['Important note', 'Beginning inventory', 'Beginning inventory now comes from tax_year_settings.beginning_inventory instead of being hardcoded to zero'],
    ['Important note', 'Ending inventory lock', endingInventoryIsLocked ? 'Ending inventory uses the locked tax-year snapshot for CPA-safe reporting' : 'Ending inventory is using live inventory because no locked snapshot exists yet'],
    ['Important note', 'COGS formula', 'Purchases support is calculated as COGS + Ending Inventory - Beginning Inventory'],
    ['Important note', 'Shipping and supplies', 'Your current sale schema stores sale-level postage and supplies together in shipping_cost, so this workbook preserves that combined bucket honestly'],
    ['Important note', 'Giveaways', 'Giveaways marked through inventory should show as Advertising / Marketing expenses if the giveaway workflow created the expense record'],
    ['Important note', 'Double counting', 'Do not also manually enter an expense that was already created by an automated workflow unless you are intentionally correcting an error'],
  ]

  const turbotaxReadyRows: CellValue[][] = [
    ['TurboTax / Schedule C Entry Area', 'Amount', 'Where It Comes From', 'What To Do'],
    ['INCOME', '', '', ''],
    ['Gross receipts or sales', totalGrossSales, 'Sales_Detail gross sales total', 'Enter as gross receipts / sales income'],
    ['Returns and allowances', 0, 'Not tracked separately yet', 'Enter 0 unless refunds/returns are separately tracked'],
    ['Gross income after COGS', grossIncomeLine7, 'Gross sales minus COGS', 'Use as Schedule C Line 7 cross-check'],
    ['EXPENSES', '', '', ''],
    ['Advertising', turbotaxAdvertising, 'Manual expenses mapped to Advertising / Marketing', 'Enter under Advertising'],
    ['Advertising breakdown - giveaways', advertisingGiveaways, 'Subset of Advertising based on category containing giveaway', 'Use this to answer CPA / TurboTax questions about giveaways'],
    ['Advertising breakdown - other marketing / promotion', advertisingMarketingOther, 'Advertising total minus giveaway categories', 'Use this to separate giveaways from other marketing'],
    ['Car and truck expenses', vehicleExpense, 'Tax year settings', 'Enter on Schedule C Line 9 if applicable'],
    ['Commissions and fees', turbotaxCommissionsAndFees, 'Sale-level platform fees plus manual fee categories', 'Enter under Commissions and fees; review manual fee entries for duplicates'],
    ['Commissions and fees breakdown - sale-level platform fees', totalPlatformFees, 'Sales_Detail platform fees total', 'Marketplace / platform fees from sale records'],
    ['Commissions and fees breakdown - manual fee expenses', manualCommissionsAndFees, 'Manual expenses mapped to Commissions and fees', 'Review to avoid duplicating sale-level platform fees'],
    ['Depreciation / Section 179', depreciationExpense, 'Tax year settings', 'Enter on Schedule C Line 13 if applicable'],
    ['Insurance', insuranceExpense, 'Tax year settings', 'Enter on Schedule C Line 15 if applicable'],
    ['Legal and professional services', legalProfessional, 'Tax year settings', 'Enter on Schedule C Line 17 if applicable'],
    ['Office expense', turbotaxOfficeExpense, 'Manual expenses mapped to Office Expense', 'Enter under Office expense'],
    ['Repairs and maintenance', repairsMaintenance, 'Tax year settings', 'Enter on Schedule C Line 21 if applicable'],
    ['Supplies', turbotaxSupplies, 'Manual expenses mapped to Supplies', 'Enter under Supplies'],
    ['Supplies breakdown - shipping supplies / materials', suppliesShippingMaterials, 'Subset of Supplies based on shipping material keywords', 'Use this for mailers, labels, sleeves, top loaders, boxes, envelopes, tape, and similar supplies'],
    ['Supplies breakdown - other supplies', suppliesGeneral, 'Supplies total minus shipping material categories', 'General supplies that are not specifically postage or shipping materials'],
    ['Taxes and licenses', taxesLicenses, 'Tax year settings', 'Enter on Schedule C Line 23 if applicable'],
    ['Travel', turbotaxTravel, 'Manual expenses mapped to Travel', 'Enter under Travel if applicable'],
    ['Utilities', utilitiesExpense, 'Tax year settings', 'Enter on Schedule C Line 25 if applicable'],
    ['Other expenses', turbotaxOtherExpenses, 'Sale-level shipping/supplies, other sale costs, and manual categories mapped to Other expenses', 'Enter as itemized Other expenses with clear labels'],
    ['Other expenses breakdown - postage / shipping', otherExpensesPostageAndShipping, 'Sale-level shipping_cost plus manual postage/shipping categories', 'Use for postage, labels purchased outside the platform, and shipping amounts currently stored in sales.shipping_cost'],
    ['Other expenses breakdown - software / subscriptions', otherExpensesSoftwareSubscriptions, 'Manual expenses mapped to Software and subscriptions', 'Use for pricing tools, accounting software, marketplace tools, or subscriptions'],
    ['Other expenses breakdown - grading / authentication', otherExpensesGradingAuthentication, 'Manual expenses mapped to Grading and authentication', 'Use for PSA, SGC, Beckett, authentication, grading submission fees, and related business grading costs'],
    ['Other expenses breakdown - equipment review', otherExpensesEquipmentReview, 'Manual expenses mapped to Equipment review', 'Review for expense vs depreciation / Section 179'],
    ['Other expenses breakdown - education', otherExpensesEducation, 'Manual expenses mapped to Education', 'Business-related education, courses, guides, training, and reference material'],
    ['Other expenses breakdown - other / uncategorized', otherExpensesUncategorized, 'Sale-level other costs plus manual expenses mapped to Other expenses', 'Review this catch-all carefully before filing'],
    ['Business use of home', businessUseOfHome, 'Tax year settings', 'Enter on Schedule C Line 30 if applicable'],
    ['COGS / INVENTORY', '', '', ''],
    ['Beginning inventory', beginningInventory, 'Tax year settings', 'Enter / review as Schedule C Part III beginning inventory'],
    ['Purchases during year / items available support', purchasesForCogsSupport, 'COGS + Ending Inventory - Beginning Inventory', 'Use as Schedule C Part III purchases support; review with preparer'],
    ['Ending inventory', endingInventoryCost, endingInventoryIsLocked ? 'Locked tax year snapshot' : 'Ending_Inventory sheet live value', endingInventoryIsLocked ? 'Use as CPA-safe ending inventory support' : 'Lock before filing so later inventory edits do not change this value'],
    ['Cost of goods sold', totalCOGS, 'Sales_Detail COGS total', 'Enter in COGS section if using inventory/COGS method'],
    ['FINAL CHECK', '', '', ''],
    ['Schedule C Line 28 total expenses before home office', totalBusinessExpenses, 'Schedule_C_Summary', 'Cross-check against TurboTax'],
    ['Schedule C Line 31 net profit after tracked expenses', scheduleCLine31NetProfit, 'Schedule_C_Summary', 'Use as final check against TurboTax result'],
    ['Sales profit before manual expenses', totalSalesProfit, 'Sales_Detail profit total', 'Reference only; does not include manual expenses or tax settings'],
    ['IMPORTANT', '', '', ''],
    ['Giveaways', advertisingGiveaways, 'Advertising includes recorded giveaway expenses', 'Only deductible when business intent is clear, records exist, and the item came from inventory or was recorded as an expense without double counting'],
    ['Not direct TurboTax import', '', 'Workbook note', 'Use this as an entry guide, not an automatic TurboTax import file'],
  ]

  const quickBooksLevelSummaryRows: CellValue[][] = [
    ['Category', 'Amount', 'What it Means'],
    ['Gross Sales / Gross Receipts', totalGrossSales, 'Total business sales income for the selected year'],
    ['Realized Cost of Goods Sold', totalCOGS, 'Cost basis for items actually sold'],
    ['Gross Income After COGS', grossIncomeLine7, 'Gross sales minus realized COGS'],
    ['Sale-Level Platform Fees', totalPlatformFees, 'Marketplace / selling fees captured on sale records'],
    ['Manual Commissions / Fee Expenses', manualCommissionsAndFees, 'Manual expenses mapped to Commissions and fees'],
    ['Sale-Level Shipping + Supplies', totalShippingAndSupplies, 'Postage and supplies currently stored together on sale records'],
    ['Sale-Level Other Direct Selling Costs', totalOtherCosts, 'Additional direct costs entered on sales'],
    ['Manual Expenses From Expense Page', totalManualExpenses, 'Expenses entered through the supplies / expense tracker'],
    ['Tax Year Settings Expenses', roundMoney(vehicleExpense + depreciationExpense + insuranceExpense + legalProfessional + repairsMaintenance + taxesLicenses + utilitiesExpense + businessUseOfHome), 'Extra annual Schedule C inputs saved in tax year settings'],
    ['Total Business Expenses Excluding COGS and Home Office', totalBusinessExpenses, 'Schedule C Line 28 support'],
    ['Net Proceeds From Sales', totalNetProceeds, 'Gross sales less sale-level direct selling costs'],
    ['Sales Profit Before Manual Expenses', totalSalesProfit, 'Net proceeds less realized COGS'],
    ['Schedule C Net Profit After All Tracked Expenses', scheduleCLine31NetProfit, 'Gross sales minus COGS, tracked expenses, and home office amount'],
    ['Break Purchases Recorded This Year', totalBreakPurchases, 'Purchase support from break records during the selected year'],
    ['Beginning Inventory', beginningInventory, 'Tax year settings beginning inventory'],
    ['Purchases Support From COGS Formula', purchasesForCogsSupport, 'COGS + Ending Inventory - Beginning Inventory'],
    ['Ending Inventory Cost', endingInventoryCost, endingInventoryIsLocked ? 'Locked ending inventory snapshot from tax_year_settings' : 'Live unsold inventory cost at export time'],
    ['Ending Inventory Source', endingInventoryIsLocked ? 'Locked' : 'Live', endingInventoryIsLocked ? `Locked at ${taxSettings?.ending_inventory_locked_at || ''}` : 'No locked snapshot exists yet'],
    ['Live Ending Inventory Cost', liveEndingInventoryCost, 'Reference only when a locked snapshot exists'],
    ['Ending Inventory Estimated Value', endingInventoryEstimatedValue, 'Reference only, not a direct tax input'],
  ]

  const scheduleCRows: CellValue[][] = [
    ['Category', 'Amount', 'Schedule C Area', 'Notes'],
    ['Line 1: Gross receipts or sales', totalGrossSales, 'Income', 'Includes shipping charged to buyers'],
    ['Line 2: Returns and allowances', 0, 'Income', 'Currently treated as zero unless you track them separately'],
    ['Line 3: Gross receipts minus returns', totalGrossSales, 'Income', 'Gross receipts less returns/allowances'],
    ['Line 4: Cost of goods sold', totalCOGS, 'COGS Part III', 'Realized COGS from completed sales'],
    ['Line 5: Gross profit', roundMoney(totalGrossSales - totalCOGS), 'Income', 'Gross receipts minus COGS'],
    ['Line 6: Other income', 0, 'Income', 'Currently treated as zero'],
    ['Line 7: Gross income', grossIncomeLine7, 'Income', 'Gross income after COGS'],
    ['Line 8: Advertising', turbotaxAdvertising, 'Expenses', 'Manual advertising / marketing expenses, including qualifying giveaways'],
    ['Line 9: Car and truck expenses', vehicleExpense, 'Expenses', 'Tax year settings'],
    ['Line 10: Commissions and fees', turbotaxCommissionsAndFees, 'Expenses', 'Sale-level platform fees plus manual commission/fee expense categories'],
    ['Line 13: Depreciation and Section 179', depreciationExpense, 'Expenses', 'Tax year settings'],
    ['Line 15: Insurance', insuranceExpense, 'Expenses', 'Tax year settings'],
    ['Line 17: Legal and professional services', legalProfessional, 'Expenses', 'Tax year settings'],
    ['Line 18: Office expense', turbotaxOfficeExpense, 'Expenses', 'Manual office expenses'],
    ['Line 21: Repairs and maintenance', repairsMaintenance, 'Expenses', 'Tax year settings'],
    ['Line 22: Supplies', turbotaxSupplies, 'Expenses', 'Manual supplies expense categories'],
    ['Line 23: Taxes and licenses', taxesLicenses, 'Expenses', 'Tax year settings'],
    ['Line 24a: Travel', turbotaxTravel, 'Expenses', 'Manual travel categories'],
    ['Line 25: Utilities', utilitiesExpense, 'Expenses', 'Tax year settings'],
    ['Line 27a: Other expenses', turbotaxOtherExpenses, 'Expenses / Other', 'Use itemized Other Expenses breakdown from TurboTax_Ready'],
    ['Line 28: Total expenses before home office', totalBusinessExpenses, 'Expenses', 'All tracked Schedule C expenses excluding COGS and home office'],
    ['Line 29: Tentative profit or loss', scheduleCLine29TentativeProfit, 'Net profit or loss', 'Gross income minus Line 28 expenses'],
    ['Line 30: Business use of home', businessUseOfHome, 'Expenses', 'Tax year settings'],
    ['Line 31: Net profit or loss', scheduleCLine31NetProfit, 'Net profit or loss', 'Line 29 minus Line 30'],
    ['Beginning inventory', beginningInventory, 'COGS support', 'Schedule C Part III Line 35'],
    ['Purchases support', purchasesForCogsSupport, 'COGS support', 'Schedule C Part III Line 36 support'],
    ['Ending inventory', endingInventoryCost, 'COGS support', endingInventoryIsLocked ? 'Schedule C Part III Line 41 support from locked snapshot' : 'Schedule C Part III Line 41 support from live inventory; lock before filing'],
    ['COGS cross-check', cogsCrossCheck, 'COGS support', 'Should equal realized COGS'],
  ]

  const scheduleCEntryGuideRows: CellValue[][] = [
    ['Step', 'Use This Amount', 'Source Worksheet', 'Reason'],
    ['1', 'Gross receipts or sales', 'TurboTax_Ready / Schedule_C_Summary', 'Primary business income number for the year'],
    ['2', 'Cost of goods sold', 'TurboTax_Ready / Schedule_C_Summary / COGS_Worksheet', 'Use realized COGS and the worksheet support if your preparer wants inventory detail'],
    ['3', 'Commissions and fees', 'TurboTax_Ready / Schedule_C_Summary', 'Sale-level platform fees plus manual fee categories; review duplicates'],
    ['4', 'Advertising', 'TurboTax_Ready / Manual_Expense_Summary', 'Advertising / Marketing expenses, including qualifying giveaways if recorded correctly'],
    ['5', 'Supplies / Office / Travel / Other', 'TurboTax_Ready / Manual_Expense_Summary', 'Use TurboTax_Ready first, then drill into Manual_Expense_Summary if needed'],
    ['6', 'Extra Schedule C settings', 'TurboTax_Ready / Schedule_C_Summary', 'Vehicle, depreciation, legal, insurance, repairs, taxes/licenses, utilities, and home office come from tax year settings'],
    ['7', 'Beginning inventory', 'TurboTax_Ready / COGS_Worksheet', 'Use tax year settings value and confirm it is correct'],
    ['8', 'Purchases support', 'COGS_Worksheet', 'Calculated as COGS + Ending Inventory - Beginning Inventory'],
    ['9', 'Ending inventory', 'TurboTax_Ready / COGS_Worksheet / Ending_Inventory', 'Use as support for inventory at export time'],
    ['10', 'Net profit after all tracked expenses', 'TurboTax_Ready / Schedule_C_Summary', 'Final check against your exported sale and expense data'],
    ['Review note', '', 'Read_Me', 'This workbook reduces searching, but final tax placement should still be reviewed with your preparer'],
  ]

  const cogsWorksheetRows: CellValue[][] = [
    ['Field', 'Amount', 'Notes'],
    ['Beginning Inventory', beginningInventory, 'From tax_year_settings.beginning_inventory'],
    ['Purchases During Year (derived support)', purchasesForCogsSupport, 'Calculated as COGS + Ending Inventory - Beginning Inventory'],
    ['Break Purchases Recorded This Year', totalBreakPurchases, 'Reference from break records only; may not include all non-break acquisitions'],
    ['Cost of Items Available for Sale', costOfItemsAvailableForSale, 'Beginning inventory + purchases support'],
    ['Ending Inventory', endingInventoryCost, endingInventoryIsLocked ? 'Locked tax-year ending inventory snapshot' : 'Live unsold inventory cost at export time'],
    ['Ending Inventory Source', endingInventoryIsLocked ? 'Locked' : 'Live', endingInventoryIsLocked ? `Locked at ${taxSettings?.ending_inventory_locked_at || ''}` : 'Lock before filing for CPA-safe reports'],
    ['Live Ending Inventory Reference', liveEndingInventoryCost, 'Current live unsold inventory value; reference only when locked snapshot exists'],
    ['Cost of Goods Sold', totalCOGS, 'Cost of items sold during the selected year'],
    ['COGS Cross-Check', cogsCrossCheck, 'Cost of items available for sale minus ending inventory; should match Cost of Goods Sold'],
    ['Review note', '', 'Important: for strongest tax support, set beginning inventory before exporting and save a year-end backup / snapshot'],
  ]

  const breakRows: CellValue[][] = [
    ['Date', 'Product', 'Source', 'Order Number', 'Total Cost'],
    ...breaks.map((row) => [
      row.break_date || '',
      row.product_name || '',
      row.source_name || '',
      row.order_number || '',
      roundMoney(Number(row.total_cost ?? 0)),
    ]),
  ]

  const unknownInventoryItem: InventoryRow = {
    id: '',
    title: 'Unknown item',
    player_name: null,
    year: null,
    set_name: null,
    card_number: null,
    notes: null,
    status: null,
    available_quantity: null,
    cost_basis_unit: null,
    cost_basis_total: null,
    estimated_value_total: null,
  }

  const salesRows: CellValue[][] = [
    [
      'Sale Date',
      'Item',
      'Gross Sale',
      'Platform Fees',
      'Shipping + Supplies',
      'Other Costs',
      'Net Proceeds',
      'COGS',
      'Profit',
      'Platform',
      'Notes',
    ],
    ...sales.map((row) => [
      row.sale_date || '',
      row.inventory_item_id
        ? buildItemName(inventoryNameMap.get(row.inventory_item_id) ?? { ...unknownInventoryItem, id: row.inventory_item_id })
        : 'Unknown item',
      roundMoney(Number(row.gross_sale ?? 0)),
      roundMoney(Number(row.platform_fees ?? 0)),
      roundMoney(Number(row.shipping_cost ?? 0)),
      roundMoney(Number(row.other_costs ?? 0)),
      roundMoney(Number(row.net_proceeds ?? 0)),
      roundMoney(Number(row.cost_of_goods_sold ?? 0)),
      roundMoney(Number(row.profit ?? 0)),
      row.platform || '',
      row.notes || '',
    ]),
  ]

  const saleExpenseDetailRows: CellValue[][] = [
    ['Sale Date', 'Item', 'Platform Fees', 'Shipping + Supplies', 'Other Costs', 'Total Selling Costs', 'Platform', 'Notes'],
    ...sales.map((row) => {
      const platformFees = roundMoney(Number(row.platform_fees ?? 0))
      const shippingAndSupplies = roundMoney(Number(row.shipping_cost ?? 0))
      const otherCosts = roundMoney(Number(row.other_costs ?? 0))
      const totalCosts = roundMoney(platformFees + shippingAndSupplies + otherCosts)

      return [
        row.sale_date || '',
        row.inventory_item_id
          ? buildItemName(inventoryNameMap.get(row.inventory_item_id) ?? { ...unknownInventoryItem, id: row.inventory_item_id })
          : 'Unknown item',
        platformFees,
        shippingAndSupplies,
        otherCosts,
        totalCosts,
        row.platform || '',
        row.notes || '',
      ]
    }),
  ]

  const manualExpenseSummaryRows: CellValue[][] = [
    ['Category', 'Amount', 'Count', 'Schedule C Area', 'Notes'],
    ...expenseCategoryRows.map((row) => [
      row.category,
      row.amount,
      row.count,
      row.scheduleCArea,
      row.scheduleCArea === 'Commissions and fees'
        ? 'Manual commission / fee expense; confirm it is not duplicated in sale-level platform fees'
        : 'Manual expense entered through the expenses page',
    ]),
    ['Total Manual Expenses', totalManualExpenses, expenses.length, 'Expenses', 'All manual expense categories combined'],
  ]

  const manualExpenseLogRows: CellValue[][] = [
    ['Date', 'Category', 'Vendor', 'Amount', 'Schedule C Area', 'Notes'],
    ...expenses.map((row) => {
      const category = String(row.category || 'Uncategorized').trim() || 'Uncategorized'

      return [
        row.expense_date || '',
        category,
        row.vendor || '',
        roundMoney(Number(row.amount ?? 0)),
        mapExpenseCategoryToScheduleCArea(category),
        row.notes || '',
      ]
    }),
  ]

  const inventoryRows: CellValue[][] = [
    ['Item', 'Status', 'Available Quantity', 'Unit Cost', 'Inventory Cost', 'Estimated Value'],
    ...endingInventory.map((row) => {
      const availableQty = Number(row.available_quantity ?? 0)
      const unitCost = Number(row.cost_basis_unit ?? 0)
      const rowCost =
        availableQty > 0 && unitCost > 0
          ? availableQty * unitCost
          : Number(row.cost_basis_total ?? 0)

      return [
        buildItemName(row),
        row.status || '',
        availableQty,
        roundMoney(unitCost),
        roundMoney(rowCost),
        roundMoney(Number(row.estimated_value_total ?? 0)),
      ]
    }),
  ]

  const taxReadinessRows: CellValue[][] = [
    ['Check', 'Status / Amount', 'Notes'],
    ['Tax year settings record', taxSettings ? 'Found' : 'Missing', taxSettings ? 'Beginning inventory and annual Schedule C settings were loaded' : 'Beginning inventory and annual Schedule C settings are using zero defaults'],
    ['Beginning inventory', beginningInventory, 'Must be correct for Schedule C Part III'],
    ['Ending inventory', endingInventoryCost, endingInventoryIsLocked ? 'Locked snapshot from tax_year_settings' : 'Live snapshot at export time; lock before filing'],
    ['Ending inventory source', endingInventoryIsLocked ? 'Locked' : 'Live', endingInventoryIsLocked ? `Locked at ${taxSettings?.ending_inventory_locked_at || ''}` : 'Reports can change if inventory changes'],
    ['Live ending inventory reference', liveEndingInventoryCost, 'Current live inventory value, included for review'],
    ['Purchases support', purchasesForCogsSupport, 'COGS + Ending Inventory - Beginning Inventory'],
    ['COGS cross-check', cogsCrossCheck, 'Should match realized COGS'],
    ['Manual commission / fee expenses', manualCommissionsAndFees, 'Included in Line 10; confirm these do not duplicate sale-level platform fees'],
    ['Manual advertising giveaway amount', advertisingGiveaways, 'Deduct only with business intent and records; do not double count inventory and expense'],
    ['Sale-level shipping_cost', totalShippingAndSupplies, 'Currently treated as Other expenses / postage and shipping; schema stores postage and supplies together'],
    ['Equipment review bucket', otherExpensesEquipmentReview, 'Review for expense vs depreciation / Section 179 treatment'],
    ['Uncategorized / other bucket', otherExpensesUncategorized, 'Review descriptions before filing'],
    ...warnings.map((warning) => ['Warning', warning, 'Review before filing']),
  ]

  const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>Card Business OS</Author>
    <LastAuthor>Card Business OS</LastAuthor>
    <Created>${new Date().toISOString()}</Created>
    <Company>Card Business OS</Company>
    <Version>16.00</Version>
  </DocumentProperties>
  <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
    <ProtectStructure>False</ProtectStructure>
    <ProtectWindows>False</ProtectWindows>
  </ExcelWorkbook>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1F2937" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheetXml('Read_Me', readMeRows)}
  ${worksheetXml('TurboTax_Ready', turbotaxReadyRows)}
  ${worksheetXml('QuickBooks_Level_Summary', quickBooksLevelSummaryRows)}
  ${worksheetXml('Schedule_C_Summary', scheduleCRows)}
  ${worksheetXml('Schedule_C_Entry_Guide', scheduleCEntryGuideRows)}
  ${worksheetXml('COGS_Worksheet', cogsWorksheetRows)}
  ${worksheetXml('Break_Purchases', breakRows)}
  ${worksheetXml('Sales_Detail', salesRows)}
  ${worksheetXml('Sale_Expense_Detail', saleExpenseDetailRows)}
  ${worksheetXml('Manual_Expense_Summary', manualExpenseSummaryRows)}
  ${worksheetXml('Manual_Expense_Log', manualExpenseLogRows)}
  ${worksheetXml('Ending_Inventory', inventoryRows)}
  ${worksheetXml('Tax_Readiness_Checks', taxReadinessRows)}
</Workbook>`

  const xmlWithBom = '\uFEFF' + workbookXml

  return new NextResponse(xmlWithBom, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
      'Content-Disposition': `attachment; filename="tax-report-${year}.xls"`,
      'Cache-Control': 'no-store',
    },
  })
}
