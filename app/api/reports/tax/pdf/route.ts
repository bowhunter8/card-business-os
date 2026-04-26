import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SaleRow = {
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
}

type InventoryRow = {
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
}

type ExpenseRow = {
  category: string | null
  amount: number | null
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

type UserProfileRow = {
  email: string | null
  display_name: string | null
  legal_name: string | null
  business_name: string | null
  ein: string | null
  phone: string | null
  business_email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}

type ExpenseCategorySummaryRow = {
  category: string
  amount: number
  count: number
  scheduleCArea: string
}

type PdfLine = {
  label: string
  amount?: number | null
  type?: 'title' | 'section' | 'main' | 'sub' | 'note' | 'spacer'
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

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function pdfEscape(value: unknown) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ')
}

function cleanProfileText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function addProfileLine(lines: PdfLine[], label: string, value: string | null | undefined) {
  const cleaned = cleanProfileText(value)

  if (cleaned) {
    lines.push({
      label: `${label}: ${cleaned}`,
      type: 'note',
    })
  }
}

function buildTaxpayerProfileLines(profile: UserProfileRow | null, fallbackEmail: string | null | undefined) {
  const lines: PdfLine[] = []
  const fallbackEmailClean = cleanProfileText(fallbackEmail)
  const name = cleanProfileText(profile?.legal_name) || cleanProfileText(profile?.display_name)
  const email = cleanProfileText(profile?.business_email) || cleanProfileText(profile?.email) || fallbackEmailClean
  const cityStateZip = [profile?.city, profile?.state, profile?.zip]
    .map((value) => cleanProfileText(value))
    .filter(Boolean)
    .join(' ')
  const address = [profile?.address_line1, profile?.address_line2, cityStateZip, profile?.country]
    .map((value) => cleanProfileText(value))
    .filter(Boolean)
    .join(', ')

  addProfileLine(lines, 'Name', name)
  addProfileLine(lines, 'Business Name', profile?.business_name)
  addProfileLine(lines, 'EIN', profile?.ein)
  addProfileLine(lines, 'Mailing Address', address)
  addProfileLine(lines, 'Phone', profile?.phone)
  addProfileLine(lines, 'Email', email)

  if (lines.length === 0) {
    lines.push({
      label: 'No optional business / tax profile information was entered. This section is optional.',
      type: 'note',
    })
  }

  return lines
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

function buildPdf(lines: PdfLine[]) {
  const pageWidth = 612
  const pageHeight = 792
  const marginX = 54
  const amountX = 460
  const startY = 730
  const bottomY = 60

  const pages: string[] = []
  let current = ''
  let y = startY
  let pageNumber = 1

  function addRaw(value: string) {
    current += value
  }

  function newPage() {
    if (current) {
      addText(`Page ${pageNumber}`, marginX, 34, 8, false)
      pages.push(current)
      pageNumber += 1
    }

    current = ''
    y = startY
  }

  function addText(text: string, x: number, textY: number, size = 10, bold = false) {
    addRaw(`0 0 0 rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${textY} Td (${pdfEscape(text)}) Tj ET\n`)
  }

  function addRule(ruleY: number) {
    addRaw(`0.82 0.82 0.82 RG ${marginX} ${ruleY} m ${pageWidth - marginX} ${ruleY} l S\n`)
  }

  function addSectionBackground(sectionY: number) {
    addRaw(`0.93 0.95 0.98 rg ${marginX - 8} ${sectionY - 5} ${pageWidth - marginX * 2 + 16} 22 re f\n`)
  }

  newPage()

  for (const line of lines) {
    const type = line.type ?? 'main'

    if (y < bottomY) {
      newPage()
    }

    if (type === 'spacer') {
      y -= 10
      continue
    }

    if (type === 'title') {
      addText(line.label, marginX, y, 20, true)
      y -= 16
      addRule(y)
      y -= 24
      continue
    }

    if (type === 'section') {
      y -= 6
      addSectionBackground(y)
      addText(line.label, marginX, y, 12, true)
      y -= 24
      continue
    }

    if (type === 'note') {
      addText(line.label, marginX, y, 8, false)
      y -= 14
      continue
    }

    const isMain = type === 'main'
    const labelX = type === 'sub' ? marginX + 22 : marginX
    const size = isMain ? 10 : 9

    addText(line.label, labelX, y, size, isMain)
    if (line.amount !== undefined && line.amount !== null) {
      addText(money(line.amount), amountX, y, size, isMain)
    }

    y -= isMain ? 18 : 15
  }

  if (current) {
    addText(`Page ${pageNumber}`, marginX, 34, 8, false)
    pages.push(current)
  }

  const objects: string[] = []

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')

  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2)
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((num) => `${num} 0 R`).join(' ')}] /Count ${pages.length} >>`
  )

  pages.forEach((content, index) => {
    const pageObjectNumber = 3 + index * 2
    const contentObjectNumber = pageObjectNumber + 1

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`
    )

    objects.push(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}endstream`)
  })

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'utf8')
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

  const userEmail = String(user.email ?? '').trim().toLowerCase()

  const [salesRes, inventoryRes, expensesRes, taxSettingsRes, profileRes] = await Promise.all([
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
      .lte('sale_date', endDate)
      .is('reversed_at', null),

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
      .from('expenses')
      .select(`
        category,
        amount
      `)
      .eq('user_id', user.id)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate),

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
      .eq('tax_year', year)
      .maybeSingle(),

    supabase
      .from('app_users')
      .select(`
        email,
        display_name,
        legal_name,
        business_name,
        ein,
        phone,
        business_email,
        address_line1,
        address_line2,
        city,
        state,
        zip,
        country
      `)
      .ilike('email', userEmail)
      .maybeSingle(),
  ])

  const sales: SaleRow[] = (salesRes.data ?? []) as SaleRow[]
  const endingInventory: InventoryRow[] = (inventoryRes.data ?? []) as InventoryRow[]
  const expenses: ExpenseRow[] = (expensesRes.data ?? []) as ExpenseRow[]
  const taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null
  const profile = (profileRes.data ?? null) as UserProfileRow | null

  const beginningInventory = roundMoney(Number(taxSettings?.beginning_inventory ?? 0))
  const scheduleCLine30BusinessUseOfHome = roundMoney(Number(taxSettings?.business_use_of_home ?? 0))
  const vehicleExpense = roundMoney(Number(taxSettings?.vehicle_expense ?? 0))
  const depreciationExpense = roundMoney(Number(taxSettings?.depreciation_expense ?? 0))
  const legalProfessional = roundMoney(Number(taxSettings?.legal_professional ?? 0))
  const insuranceExpense = roundMoney(Number(taxSettings?.insurance ?? 0))
  const utilitiesExpense = roundMoney(Number(taxSettings?.utilities ?? 0))
  const taxesLicenses = roundMoney(Number(taxSettings?.taxes_licenses ?? 0))
  const repairsMaintenance = roundMoney(Number(taxSettings?.repairs_maintenance ?? 0))

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

  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.cost_of_goods_sold ?? 0), 0)
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

  const expenseByCategory = new Map<string, { amount: number; count: number }>()

  for (const expense of expenses) {
    const category = String(expense.category || 'Uncategorized').trim() || 'Uncategorized'
    const current = expenseByCategory.get(category) ?? { amount: 0, count: 0 }
    expenseByCategory.set(category, {
      amount: current.amount + Number(expense.amount ?? 0),
      count: current.count + 1,
    })
  }

  const expenseCategoryRows: ExpenseCategorySummaryRow[] = Array.from(expenseByCategory.entries()).map(
    ([category, values]) => ({
      category,
      amount: roundMoney(values.amount),
      count: values.count,
      scheduleCArea: mapExpenseCategoryToScheduleCArea(category),
    })
  )

  const totalManualExpenses = roundMoney(
    expenseCategoryRows.reduce((sum, row) => sum + row.amount, 0)
  )

  const grossIncomeLine7 = roundMoney(totalGrossSales - totalCOGS)
  const purchasesForCogsSupport = roundMoney(totalCOGS + endingInventoryCost - beginningInventory)

  const turbotaxAdvertising = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Advertising')
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
    turbotaxAdvertising - advertisingGiveaways
  )

  const turbotaxSupplies = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Supplies')
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

  const suppliesGeneral = roundMoney(turbotaxSupplies - suppliesShippingMaterials)

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

  const turbotaxOtherExpenses = roundMoney(
    otherExpensesPostageAndShipping +
      otherExpensesSoftwareSubscriptions +
      otherExpensesEquipmentReview +
      otherExpensesGradingAuthentication +
      otherExpensesEducation +
      otherExpensesUncategorized
  )

  const totalBusinessExpenses = roundMoney(
    turbotaxAdvertising +
      vehicleExpense +
      totalPlatformFees +
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

  const scheduleCLine28TotalExpenses = roundMoney(totalBusinessExpenses)

  const scheduleCLine29TentativeProfit = roundMoney(
    grossIncomeLine7 - scheduleCLine28TotalExpenses
  )

  const scheduleCLine31NetProfit = roundMoney(
    scheduleCLine29TentativeProfit - scheduleCLine30BusinessUseOfHome
  )

  const saleCount = sales.length
  const manualExpenseCount = expenses.length
  const inventoryCount = endingInventory.length

  const countForScheduleArea = (area: string) =>
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === area)
      .reduce((sum, row) => sum + row.count, 0)

  const advertisingCount = countForScheduleArea('Advertising')
  const suppliesCount = countForScheduleArea('Supplies')
  const officeCount = countForScheduleArea('Office expense')
  const travelCount = countForScheduleArea('Travel')
  const postageShippingCount = countForScheduleArea('Other expenses / Postage and shipping')
  const softwareCount = countForScheduleArea('Other expenses / Software and subscriptions')
  const equipmentReviewCount = countForScheduleArea('Other expenses / Equipment review')
  const gradingCount = countForScheduleArea('Other expenses / Grading and authentication')
  const educationCount = countForScheduleArea('Other expenses / Education')
  const uncategorizedCount = countForScheduleArea('Other expenses')

  const warnings: string[] = []

  if (!taxSettings) {
    warnings.push('No yearly tax settings record exists yet. Beginning inventory and extra Schedule C lines are using zero defaults.')
  }

  if (beginningInventory === 0 && (totalCOGS > 0 || endingInventoryCost > 0)) {
    warnings.push('Beginning inventory is zero. Confirm this is correct before filing.')
  }

  if (uncategorizedCount > 0 || otherExpensesUncategorized > 0) {
    warnings.push('Other / uncategorized expenses exist. Review and rename categories before filing if possible.')
  }

  if (equipmentReviewCount > 0 || otherExpensesEquipmentReview > 0) {
    warnings.push('Equipment review expenses exist. Confirm whether they should be expensed, depreciated, or Section 179.')
  }

  if (manualExpenseCount === 0 && saleCount > 0) {
    warnings.push('No manual expenses were recorded for the year. Confirm supplies, software, subscriptions, equipment, and other costs were not missed.')
  }

  if (totalShippingAndSupplies > 0) {
    warnings.push('Sale-level shipping_cost currently combines postage and shipping supplies. Use the workbook details if you need transaction support.')
  }

  if (warnings.length === 0) {
    warnings.push('No major tax-readiness warnings were detected from tracked data.')
  }

  const taxpayerProfileLines = buildTaxpayerProfileLines(profile, user.email)

  const pdfLines: PdfLine[] = [
    { label: `Schedule C Ready Tax Report - ${year}`, type: 'title' },
    { label: 'TAXPAYER / BUSINESS INFORMATION', type: 'section' },
    ...taxpayerProfileLines,
    { label: '', type: 'spacer' },
    {
      label:
        'This report is designed as a line-by-line Schedule C entry guide. Keep the tax workbook export as detailed backup and supporting worksheets.',
      type: 'note',
    },
    {
      label:
        'Amounts are based on tracked sales, expenses, inventory, beginning inventory settings, and COGS records in Card Business OS.',
      type: 'note',
    },
    { label: '', type: 'spacer' },

    { label: 'PART I - INCOME', type: 'section' },
    {
      label: 'Line 1: Gross receipts or sales',
      amount: totalGrossSales,
      type: 'main',
    },
    {
      label: 'Line 2: Returns and allowances',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 3: Subtract returns and allowances from gross receipts',
      amount: totalGrossSales,
      type: 'main',
    },
    {
      label: 'Line 4: Cost of goods sold',
      amount: totalCOGS,
      type: 'main',
    },
    {
      label: 'Line 5: Gross profit',
      amount: roundMoney(totalGrossSales - totalCOGS),
      type: 'main',
    },
    {
      label: 'Line 6: Other income',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 7: Gross income',
      amount: grossIncomeLine7,
      type: 'main',
    },

    { label: 'PART II - EXPENSES', type: 'section' },
    {
      label: 'Line 8: Advertising',
      amount: turbotaxAdvertising,
      type: 'main',
    },
    {
      label: `Giveaways / buyer appreciation / stream promotion (${advertisingCount} tracked advertising entries)`,
      amount: advertisingGiveaways,
      type: 'sub',
    },
    {
      label: 'Other marketing / promotion',
      amount: advertisingMarketingOther,
      type: 'sub',
    },
    {
      label: 'Line 9: Car and truck expenses',
      amount: vehicleExpense,
      type: 'main',
    },
    {
      label: 'Line 10: Commissions and fees',
      amount: totalPlatformFees,
      type: 'main',
    },
    {
      label: `Sale-level marketplace / platform fees (${saleCount} sales reviewed)`,
      amount: totalPlatformFees,
      type: 'sub',
    },
    {
      label: 'Line 11: Contract labor',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 12: Depletion',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 13: Depreciation and section 179 expense deduction',
      amount: depreciationExpense,
      type: 'main',
    },
    {
      label: 'Equipment review bucket is also shown under Line 27a until reviewed for expense vs depreciation treatment',
      type: 'note',
    },
    {
      label: 'Line 14: Employee benefit programs',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 15: Insurance',
      amount: insuranceExpense,
      type: 'main',
    },
    {
      label: 'Line 16: Interest',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 17: Legal and professional services',
      amount: legalProfessional,
      type: 'main',
    },
    {
      label: `Line 18: Office expense (${officeCount} tracked office entries)`,
      amount: turbotaxOfficeExpense,
      type: 'main',
    },
    {
      label: 'Line 19: Pension and profit-sharing plans',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 20a: Rent or lease - vehicles, machinery, and equipment',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 20b: Rent or lease - other business property',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 21: Repairs and maintenance',
      amount: repairsMaintenance,
      type: 'main',
    },
    {
      label: `Line 22: Supplies (${suppliesCount} tracked supply entries)`,
      amount: turbotaxSupplies,
      type: 'main',
    },
    {
      label: 'Shipping supplies / materials',
      amount: suppliesShippingMaterials,
      type: 'sub',
    },
    {
      label: 'Other supplies',
      amount: suppliesGeneral,
      type: 'sub',
    },
    {
      label: 'Line 23: Taxes and licenses',
      amount: taxesLicenses,
      type: 'main',
    },
    {
      label: `Line 24a: Travel (${travelCount} tracked travel entries)`,
      amount: turbotaxTravel,
      type: 'main',
    },
    {
      label: 'Line 24b: Deductible meals',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 25: Utilities',
      amount: utilitiesExpense,
      type: 'main',
    },
    {
      label: 'Line 26: Wages',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 27a: Other expenses',
      amount: turbotaxOtherExpenses,
      type: 'main',
    },
    {
      label: `Postage / shipping (${postageShippingCount} manual entries plus sale-level shipping records)`,
      amount: otherExpensesPostageAndShipping,
      type: 'sub',
    },
    {
      label: `Software / subscriptions (${softwareCount} entries)`,
      amount: otherExpensesSoftwareSubscriptions,
      type: 'sub',
    },
    {
      label: `Grading / authentication (${gradingCount} entries)`,
      amount: otherExpensesGradingAuthentication,
      type: 'sub',
    },
    {
      label: `Equipment review (${equipmentReviewCount} entries)`,
      amount: otherExpensesEquipmentReview,
      type: 'sub',
    },
    {
      label: `Education (${educationCount} entries)`,
      amount: otherExpensesEducation,
      type: 'sub',
    },
    {
      label: `Other / uncategorized (${uncategorizedCount} entries plus sale-level other costs)`,
      amount: otherExpensesUncategorized,
      type: 'sub',
    },
    {
      label: 'Line 28: Total expenses before expenses for business use of home',
      amount: scheduleCLine28TotalExpenses,
      type: 'main',
    },
    {
      label: 'Line 29: Tentative profit or loss',
      amount: scheduleCLine29TentativeProfit,
      type: 'main',
    },
    {
      label: 'Line 30: Expenses for business use of your home',
      amount: scheduleCLine30BusinessUseOfHome,
      type: 'main',
    },
    {
      label: 'Line 31: Net profit or loss',
      amount: scheduleCLine31NetProfit,
      type: 'main',
    },

    { label: 'PART III - COST OF GOODS SOLD', type: 'section' },
    {
      label: 'Line 33: Inventory method',
      type: 'main',
    },
    {
      label: 'Cost method used by app records; review with preparer if using a different tax inventory method',
      type: 'note',
    },
    {
      label: 'Line 35: Inventory at beginning of year',
      amount: beginningInventory,
      type: 'main',
    },
    {
      label: 'Line 36: Purchases less cost of items withdrawn for personal use',
      amount: purchasesForCogsSupport,
      type: 'main',
    },
    {
      label: 'Purchases support is calculated as realized COGS plus ending inventory minus beginning inventory',
      type: 'note',
    },
    {
      label: 'Line 37: Cost of labor',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 38: Materials and supplies',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 39: Other costs',
      amount: 0,
      type: 'main',
    },
    {
      label: 'Line 40: Add lines 35 through 39',
      amount: roundMoney(beginningInventory + purchasesForCogsSupport),
      type: 'main',
    },
    {
      label: 'Line 41: Inventory at end of year',
      amount: endingInventoryCost,
      type: 'main',
    },
    {
      label: 'Line 42: Cost of goods sold',
      amount: totalCOGS,
      type: 'main',
    },

    { label: 'AUDIT SUPPORT / RECORD COUNTS', type: 'section' },
    {
      label: 'Sales reviewed for this tax year',
      amount: saleCount,
      type: 'main',
    },
    {
      label: 'Manual expense records reviewed',
      amount: manualExpenseCount,
      type: 'main',
    },
    {
      label: 'Ending inventory items reviewed',
      amount: inventoryCount,
      type: 'main',
    },
    {
      label: 'Advertising entries',
      amount: advertisingCount,
      type: 'sub',
    },
    {
      label: 'Supplies entries',
      amount: suppliesCount,
      type: 'sub',
    },
    {
      label: 'Postage / shipping entries',
      amount: postageShippingCount,
      type: 'sub',
    },
    {
      label: 'Software / subscriptions entries',
      amount: softwareCount,
      type: 'sub',
    },
    {
      label: 'Grading / authentication entries',
      amount: gradingCount,
      type: 'sub',
    },
    {
      label: 'Equipment review entries',
      amount: equipmentReviewCount,
      type: 'sub',
    },
    {
      label: 'Uncategorized / other entries',
      amount: uncategorizedCount,
      type: 'sub',
    },

    { label: 'TRACKED BUSINESS TOTALS / CROSS-CHECK', type: 'section' },
    {
      label: 'Gross sales tracked',
      amount: totalGrossSales,
      type: 'main',
    },
    {
      label: 'Sale-level platform fees',
      amount: totalPlatformFees,
      type: 'sub',
    },
    {
      label: 'Sale-level shipping / postage / supplies currently stored in sales.shipping_cost',
      amount: totalShippingAndSupplies,
      type: 'sub',
    },
    {
      label: 'Sale-level other direct selling costs',
      amount: totalOtherCosts,
      type: 'sub',
    },
    {
      label: 'Manual expenses from expense tracker',
      amount: totalManualExpenses,
      type: 'sub',
    },
    {
      label: 'Total Schedule C expenses excluding COGS and home office',
      amount: totalBusinessExpenses,
      type: 'main',
    },
    {
      label: 'Net business profit after all tracked expenses',
      amount: scheduleCLine31NetProfit,
      type: 'main',
    },

    { label: 'TAX READINESS WARNINGS', type: 'section' },
    ...warnings.map((warning) => ({
      label: warning,
      type: 'note' as const,
    })),

    { label: 'IMPORTANT REVIEW NOTES', type: 'section' },
    {
      label:
        'Line 27a should not be entered as one mystery amount. Use the itemized Other Expenses breakdown above for TurboTax / CPA entry.',
      type: 'note',
    },
    {
      label:
        'Giveaway note: deduct safely only when there is business intent, records exist, and the item came from inventory or was recorded as an expense without double counting.',
      type: 'note',
    },
    {
      label:
        'Equipment review note: larger equipment may need depreciation or Section 179 treatment instead of immediate expense treatment.',
      type: 'note',
    },
    {
      label:
        'This PDF is a Schedule C entry guide. Use the tax workbook export for detailed worksheets, sales detail, manual expense detail, and ending inventory support.',
      type: 'note',
    },
  ]

  const pdfBuffer = buildPdf(pdfLines)

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="schedule-c-tax-report-${year}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
