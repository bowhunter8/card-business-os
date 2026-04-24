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

type CellValue = string | number | null | undefined

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

  const [breaksRes, salesRes, inventoryRes, expensesRes] = await Promise.all([
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
  ])

  const breaks: BreakRow[] = (breaksRes.data ?? []) as BreakRow[]
  const sales: SaleRow[] = (salesRes.data ?? []) as SaleRow[]
  const endingInventory: InventoryRow[] = (inventoryRes.data ?? []) as InventoryRow[]
  const expenses: ExpenseRow[] = (expensesRes.data ?? []) as ExpenseRow[]

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

  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingAndSupplies + totalOtherCosts
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

  const endingInventoryCost = roundMoney(
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

  const endingInventoryEstimatedValue = roundMoney(
    endingInventory.reduce(
      (sum, row) => sum + Number(row.estimated_value_total ?? 0),
      0
    )
  )

  const expenseByCategory = new Map<string, number>()

  for (const expense of expenses) {
    const category = String(expense.category || 'Uncategorized').trim() || 'Uncategorized'
    const current = expenseByCategory.get(category) ?? 0
    expenseByCategory.set(category, current + Number(expense.amount ?? 0))
  }

  const expenseCategoryRows = Array.from(expenseByCategory.entries())
    .sort(([left], [right]) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    )
    .map(([category, amount]) => ({
      category,
      amount: roundMoney(amount),
      scheduleCArea: mapExpenseCategoryToScheduleCArea(category),
    }))

  const totalManualExpenses = roundMoney(
    expenseCategoryRows.reduce((sum, row) => sum + row.amount, 0)
  )

  const totalBusinessExpenses = roundMoney(
    totalPlatformFees + totalShippingAndSupplies + totalOtherCosts + totalManualExpenses
  )

  const netBusinessProfitAfterManualExpenses = roundMoney(
    totalGrossSales - totalCOGS - totalBusinessExpenses
  )

  const derivedPurchasesForCogsSupport = roundMoney(totalCOGS + endingInventoryCost)

  const turbotaxAdvertising = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Advertising')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const turbotaxCommissionsAndFees = roundMoney(totalPlatformFees)

  const turbotaxSupplies = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Supplies')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const turbotaxOfficeExpense = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Office expense')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const turbotaxTravel = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Travel')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const turbotaxOtherExpenses = roundMoney(
    totalShippingAndSupplies +
      totalOtherCosts +
      expenseCategoryRows
        .filter((row) =>
          [
            'Other expenses / Postage and shipping',
            'Other expenses / Software and subscriptions',
            'Other expenses / Equipment review',
            'Other expenses / Grading and authentication',
            'Other expenses / Education',
            'Other expenses',
          ].includes(row.scheduleCArea)
        )
        .reduce((sum, row) => sum + row.amount, 0)
  )

  const advertisingGiveaways = roundMoney(
    expenseCategoryRows
      .filter(
        (row) =>
          row.scheduleCArea === 'Advertising' &&
          row.category.toLowerCase().includes('giveaway')
      )
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const advertisingMarketingOther = roundMoney(
    expenseCategoryRows
      .filter(
        (row) =>
          row.scheduleCArea === 'Advertising' &&
          !row.category.toLowerCase().includes('giveaway')
      )
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const suppliesShippingMaterials = roundMoney(
    expenseCategoryRows
      .filter(
        (row) =>
          row.scheduleCArea === 'Supplies' &&
          (row.category.toLowerCase().includes('shipping') ||
            row.category.toLowerCase().includes('mailer') ||
            row.category.toLowerCase().includes('label') ||
            row.category.toLowerCase().includes('toploader') ||
            row.category.toLowerCase().includes('top loader') ||
            row.category.toLowerCase().includes('sleeve') ||
            row.category.toLowerCase().includes('envelope') ||
            row.category.toLowerCase().includes('box') ||
            row.category.toLowerCase().includes('tape'))
      )
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const suppliesGeneral = roundMoney(
    expenseCategoryRows
      .filter(
        (row) =>
          row.scheduleCArea === 'Supplies' &&
          !(
            row.category.toLowerCase().includes('shipping') ||
            row.category.toLowerCase().includes('mailer') ||
            row.category.toLowerCase().includes('label') ||
            row.category.toLowerCase().includes('toploader') ||
            row.category.toLowerCase().includes('top loader') ||
            row.category.toLowerCase().includes('sleeve') ||
            row.category.toLowerCase().includes('envelope') ||
            row.category.toLowerCase().includes('box') ||
            row.category.toLowerCase().includes('tape')
          )
      )
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const otherExpensesPostageAndShipping = roundMoney(
    totalShippingAndSupplies +
      expenseCategoryRows
        .filter((row) => row.scheduleCArea === 'Other expenses / Postage and shipping')
        .reduce((sum, row) => sum + row.amount, 0)
  )

  const otherExpensesSoftwareSubscriptions = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Other expenses / Software and subscriptions')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const otherExpensesEquipmentReview = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Other expenses / Equipment review')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const otherExpensesGradingAuthentication = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Other expenses / Grading and authentication')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const otherExpensesEducation = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Other expenses / Education')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const otherExpensesUncategorized = roundMoney(
    totalOtherCosts +
      expenseCategoryRows
        .filter((row) => row.scheduleCArea === 'Other expenses')
        .reduce((sum, row) => sum + row.amount, 0)
  )

  const readMeRows: CellValue[][] = [
    ['Worksheet', 'Purpose', 'How to Use'],
    [
      'Read_Me',
      'Quick explanation of this workbook',
      'Start here first before entering anything into tax software or sharing with a CPA',
    ],
    [
      'TurboTax_Ready',
      'Simple entry sheet for Schedule C / TurboTax',
      'Use this first during tax prep. It is designed to show the numbers users need without hunting through every worksheet',
    ],
    [
      'QuickBooks_Level_Summary',
      'Top-level summary in business-report style',
      'Use this like a QuickBooks-style profit and loss plus inventory support overview',
    ],
    [
      'Schedule_C_Summary',
      'Schedule C category mapping',
      'Use this tab when entering annual totals into TurboTax or giving numbers to a preparer',
    ],
    [
      'Schedule_C_Entry_Guide',
      'Plain-English guide for where numbers go',
      'Use this tab to avoid hunting through detail rows during tax prep',
    ],
    [
      'COGS_Worksheet',
      'Inventory / COGS support',
      'Use this with Schedule C Part III support and discuss beginning inventory with your preparer',
    ],
    [
      'Break_Purchases',
      'Detailed purchase support',
      'Reference only; supports your acquisition history for the year',
    ],
    [
      'Sales_Detail',
      'Detailed sale support',
      'Reference only; supports gross sales, fees, shipping/supplies, COGS, and profit',
    ],
    [
      'Sale_Expense_Detail',
      'Expense-focused sales view',
      'Reference only; easier for reviewing sale-level expense buckets without hunting through the full sale view',
    ],
    [
      'Manual_Expense_Summary',
      'User-entered expense totals by category',
      'Use this for QuickBooks-style expense category review',
    ],
    [
      'Manual_Expense_Log',
      'Detailed user-entered expense records',
      'Reference only; supports receipts, notes, vendors, and manual expense categories',
    ],
    [
      'Ending_Inventory',
      'Unsold inventory snapshot',
      'Reference only; supports ending inventory at export time',
    ],
    [
      'Important note',
      'TurboTax import',
      'This workbook is designed for clean reference and manual entry, not direct TurboTax Schedule C import',
    ],
    [
      'Important note',
      'Shipping and supplies',
      'Your current sale schema stores sale-level postage and supplies together in shipping_cost, so this workbook preserves that combined bucket honestly',
    ],
    [
      'Important note',
      'Manual expenses',
      'Manual expenses from the expenses page are included separately so they are not hidden inside sales profit',
    ],
    [
      'Important note',
      'Giveaways',
      'Giveaways marked through inventory should show as Advertising / Marketing expenses if the giveaway workflow created the expense record',
    ],
    [
      'Important note',
      'Double counting',
      'Do not also manually enter an expense that was already created by an automated workflow unless you are intentionally correcting an error',
    ],
  ]

  const turbotaxReadyRows: CellValue[][] = [
    ['TurboTax / Schedule C Entry Area', 'Amount', 'Where It Comes From', 'What To Do'],
    ['INCOME', '', '', ''],
    ['Gross receipts or sales', totalGrossSales, 'Sales_Detail gross sales total', 'Enter as gross receipts / sales income'],
    ['Returns and allowances', 0, 'Not tracked separately yet', 'Enter 0 unless you separately tracked refunds/returns'],
    ['EXPENSES', '', '', ''],
    ['Advertising', turbotaxAdvertising, 'Manual expenses mapped to Advertising / Marketing', 'Enter under Advertising. This includes qualifying Whatnot giveaways and buyer appreciation giveaways if recorded as Advertising / Marketing'],
    ['Advertising breakdown - giveaways', advertisingGiveaways, 'Subset of Advertising based on category containing giveaway', 'Use this to answer CPA / TurboTax questions about how much Advertising is from giveaways'],
    ['Advertising breakdown - other marketing / promotion', advertisingMarketingOther, 'Advertising total minus giveaway categories', 'Use this to separate giveaways from other ads, marketing, promotion, and buyer appreciation activity'],
    ['Commissions and fees', turbotaxCommissionsAndFees, 'Sale-level platform fees', 'Enter under Commissions and fees'],
    ['Office expense', turbotaxOfficeExpense, 'Manual expenses mapped to Office Expense', 'Enter under Office expense'],
    ['Supplies', turbotaxSupplies, 'Manual expenses mapped to Supplies', 'Enter under Supplies'],
    ['Supplies breakdown - shipping supplies / materials', suppliesShippingMaterials, 'Subset of Supplies based on shipping material keywords', 'Use this for mailers, labels, sleeves, top loaders, boxes, envelopes, tape, and similar shipping supplies'],
    ['Supplies breakdown - other supplies', suppliesGeneral, 'Supplies total minus shipping material categories', 'Use this for general supplies that are not specifically postage or shipping materials'],
    ['Travel', turbotaxTravel, 'Manual expenses mapped to Travel', 'Enter under Travel if applicable'],
    ['Other expenses', turbotaxOtherExpenses, 'Sale-level shipping/supplies, other sale costs, and manual categories mapped to Other expenses', 'Enter as Other expenses with clear labels such as postage/shipping, software, grading, equipment review, education, or other'],
    ['Other expenses breakdown - postage / shipping', otherExpensesPostageAndShipping, 'Sale-level shipping_cost plus manual postage/shipping categories', 'Use this for postage, labels purchased outside the platform, and shipping amounts currently stored in sales.shipping_cost'],
    ['Other expenses breakdown - software / subscriptions', otherExpensesSoftwareSubscriptions, 'Manual expenses mapped to Software and subscriptions', 'Use this for Card Ladder, pricing tools, accounting software, marketplace tools, or other business subscriptions'],
    ['Other expenses breakdown - grading / authentication', otherExpensesGradingAuthentication, 'Manual expenses mapped to Grading and authentication', 'Use this for PSA, SGC, Beckett, authentication, grading submission fees, and related business grading costs'],
    ['Other expenses breakdown - equipment review', otherExpensesEquipmentReview, 'Manual expenses mapped to Equipment review', 'Use this as a review bucket for cameras, lighting, stands, printers, scanners, or items that may need expense vs depreciation review'],
    ['Other expenses breakdown - education', otherExpensesEducation, 'Manual expenses mapped to Education', 'Use this for business-related education, courses, guides, training, and reference material'],
    ['Other expenses breakdown - other / uncategorized', otherExpensesUncategorized, 'Sale-level other costs plus manual expenses mapped to Other expenses', 'Use this catch-all carefully and review descriptions before entering into tax software'],
    ['COGS / INVENTORY', '', '', ''],
    ['Beginning inventory', 0, 'Placeholder', 'Future upgrade: beginning inventory tracking. Review with preparer before entering'],
    ['Purchases during year / items available support', derivedPurchasesForCogsSupport, 'COGS_Worksheet derived support', 'Use as support only; review with preparer because beginning inventory and purchases may need a tighter tie-out'],
    ['Ending inventory', endingInventoryCost, 'Ending_Inventory sheet', 'Use as ending inventory support'],
    ['Cost of goods sold', totalCOGS, 'Sales_Detail COGS total', 'Enter in COGS section if using inventory/COGS method'],
    ['FINAL CHECK', '', '', ''],
    ['Net profit after all tracked expenses', netBusinessProfitAfterManualExpenses, 'Schedule_C_Summary', 'Use as a final check against TurboTax result'],
    ['Sales profit before manual expenses', totalSalesProfit, 'Sales_Detail profit total', 'Reference only; this does not include manual expenses from the expense tracker'],
    ['IMPORTANT', '', '', ''],
    ['Giveaways', turbotaxAdvertising, 'Advertising includes recorded giveaway expenses', 'Only deductible when business intent is clear, records exist, and the item came from inventory or was recorded as an expense without double counting'],
    ['Not direct TurboTax import', '', 'Workbook note', 'Use this as an entry guide, not an automatic TurboTax import file'],
  ]

  const quickBooksLevelSummaryRows: CellValue[][] = [
    ['Category', 'Amount', 'What it Means'],
    ['Gross Sales / Gross Receipts', totalGrossSales, 'Total business sales income for the selected year'],
    ['Sale-Level Platform Fees', totalPlatformFees, 'Marketplace / selling fees captured on sale records'],
    ['Sale-Level Shipping + Supplies', totalShippingAndSupplies, 'Postage and supplies currently stored together on sale records'],
    ['Sale-Level Other Direct Selling Costs', totalOtherCosts, 'Additional direct costs entered on sales'],
    ['Manual Expenses From Expense Page', totalManualExpenses, 'Expenses entered through the supplies / expense tracker'],
    ['Total Business Expenses Excluding COGS', totalBusinessExpenses, 'Sale-level fees/costs plus manually entered expenses'],
    ['Net Proceeds From Sales', totalNetProceeds, 'Gross sales less sale-level direct selling costs'],
    ['Realized Cost of Goods Sold', totalCOGS, 'Cost basis for items actually sold'],
    ['Sales Profit Before Manual Expenses', totalSalesProfit, 'Net proceeds less realized COGS'],
    ['Net Business Profit After Manual Expenses', netBusinessProfitAfterManualExpenses, 'Gross sales minus COGS and all tracked business expenses'],
    ['Break Purchases Recorded This Year', totalBreakPurchases, 'Purchase support from break records during the selected year'],
    ['Ending Inventory Cost', endingInventoryCost, 'Unsold inventory cost snapshot at export time'],
    ['Ending Inventory Estimated Value', endingInventoryEstimatedValue, 'Reference only, not a direct tax input'],
  ]

  const scheduleCRows: CellValue[][] = [
    ['Category', 'Amount', 'Schedule C Area', 'Notes'],
    ['Gross receipts or sales', totalGrossSales, 'Income', 'Includes shipping charged to buyers'],
    ['Returns and allowances', 0, 'Income', 'Currently treated as zero unless you track them separately'],
    ['Net income before expenses', totalGrossSales, 'Income', 'Gross receipts less returns/allowances'],
    ['Commissions and fees', totalPlatformFees, 'Expenses', 'Sale-level marketplace / selling platform fees'],
    ['Shipping + supplies from sales', totalShippingAndSupplies, 'Expenses / Other', 'Sale-level postage and supplies currently combined in sales.shipping_cost'],
    ['Other selling expenses from sales', totalOtherCosts, 'Expenses / Other', 'Additional direct selling costs entered on sales'],
    ...expenseCategoryRows.map((row) => [
      row.category,
      row.amount,
      row.scheduleCArea,
      'Manual expense entered through the expenses page',
    ]),
    ['Total manual expenses', totalManualExpenses, 'Expenses', 'All manual expense categories combined'],
    ['Total business expenses excluding COGS', totalBusinessExpenses, 'Expenses', 'Sale-level expenses plus manual expenses'],
    ['Cost of goods sold', totalCOGS, 'COGS Part III', 'Realized COGS from completed sales'],
    ['Net profit after all tracked expenses', netBusinessProfitAfterManualExpenses, 'Net profit or loss', 'Gross sales minus COGS and tracked business expenses'],
    ['Sales profit before manual expenses', totalSalesProfit, 'Reference only', 'Existing sale profit total before expenses from the expenses page'],
    [
      'Ending inventory (reference)',
      endingInventoryCost,
      'COGS support',
      'Supports inventory / COGS review, not a direct profit line',
    ],
  ]

  const scheduleCEntryGuideRows: CellValue[][] = [
    ['Step', 'Use This Amount', 'Source Worksheet', 'Reason'],
    [
      '1',
      'Gross receipts or sales',
      'TurboTax_Ready / Schedule_C_Summary',
      'Primary business income number for the year',
    ],
    [
      '2',
      'Commissions and fees',
      'TurboTax_Ready / Schedule_C_Summary',
      'Sale-level selling platform fees bucket',
    ],
    [
      '3',
      'Advertising',
      'TurboTax_Ready / Manual_Expense_Summary',
      'Advertising / Marketing expenses, including qualifying giveaways if recorded correctly',
    ],
    [
      '4',
      'Supplies / Office / Travel / Other',
      'TurboTax_Ready / Manual_Expense_Summary',
      'Use the TurboTax_Ready sheet first, then drill into Manual_Expense_Summary if needed',
    ],
    [
      '5',
      'Shipping + supplies from sales',
      'TurboTax_Ready / Schedule_C_Summary',
      'Sale-level expense support for postage and supplies, currently combined in your sales schema',
    ],
    [
      '6',
      'Cost of goods sold',
      'TurboTax_Ready / Schedule_C_Summary / COGS_Worksheet',
      'Use realized COGS plus the worksheet support if your preparer wants inventory detail',
    ],
    [
      '7',
      'Ending inventory',
      'TurboTax_Ready / COGS_Worksheet / Ending_Inventory',
      'Use as support for inventory at export time',
    ],
    [
      '8',
      'Net profit after all tracked expenses',
      'TurboTax_Ready / Schedule_C_Summary',
      'Final check against your exported sale and expense data',
    ],
    [
      'Review note',
      '',
      'Read_Me',
      'This workbook is designed to reduce searching, but final tax placement should still be reviewed with your preparer',
    ],
  ]

  const cogsWorksheetRows: CellValue[][] = [
    ['Field', 'Amount', 'Notes'],
    ['Beginning Inventory', 0, 'Placeholder until beginning inventory is tracked/exported directly'],
    ['Purchases During Year (derived support)', derivedPurchasesForCogsSupport, 'Currently derived as realized COGS + ending inventory cost'],
    ['Break Purchases Recorded This Year', totalBreakPurchases, 'Reference from break records only; may not include all non-break acquisitions'],
    ['Cost of Items Available for Sale (derived)', derivedPurchasesForCogsSupport, 'Beginning inventory + derived purchases support'],
    ['Ending Inventory', endingInventoryCost, 'Unsold inventory cost snapshot at export time'],
    ['Cost of Goods Sold', totalCOGS, 'Cost of items sold during the selected year'],
    [
      'Review note',
      '',
      'Important',
      'For strongest tax support, add beginning inventory tracking and verify purchase tie-out with your preparer',
    ],
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
        ? buildItemName(
            inventoryNameMap.get(row.inventory_item_id) ?? {
              id: row.inventory_item_id,
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
          )
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
    [
      'Sale Date',
      'Item',
      'Platform Fees',
      'Shipping + Supplies',
      'Other Costs',
      'Total Selling Costs',
      'Platform',
      'Notes',
    ],
    ...sales.map((row) => {
      const platformFees = roundMoney(Number(row.platform_fees ?? 0))
      const shippingAndSupplies = roundMoney(Number(row.shipping_cost ?? 0))
      const otherCosts = roundMoney(Number(row.other_costs ?? 0))
      const totalCosts = roundMoney(platformFees + shippingAndSupplies + otherCosts)

      return [
        row.sale_date || '',
        row.inventory_item_id
          ? buildItemName(
              inventoryNameMap.get(row.inventory_item_id) ?? {
                id: row.inventory_item_id,
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
            )
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
    ['Category', 'Amount', 'Schedule C Area', 'Notes'],
    ...expenseCategoryRows.map((row) => [
      row.category,
      row.amount,
      row.scheduleCArea,
      'Manual expense entered through the expenses page',
    ]),
    ['Total Manual Expenses', totalManualExpenses, 'Expenses', 'All manual expense categories combined'],
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

  const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>ChatGPT</Author>
    <LastAuthor>ChatGPT</LastAuthor>
    <Created>${new Date().toISOString()}</Created>
    <Company>OpenAI</Company>
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