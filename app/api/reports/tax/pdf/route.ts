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

type DisposalInventoryItemRow = {
  title: string | null
  player_name: string | null
  year: number | null
  set_name: string | null
  card_number: string | null
  cost_basis_total: number | null
  cost_basis_unit: number | null
  quantity: number | null
  available_quantity: number | null
}

type DisposalReviewRow = {
  id: string
  inventory_item_id: string | null
  quantity_change: number | null
  disposal_reason: string | null
  disposal_notes: string | null
  notes: string | null
  created_at: string | null
  inventory_items?: DisposalInventoryItemRow | DisposalInventoryItemRow[] | null
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
  valueType?: 'currency' | 'count'
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
    .replace(/™/g, '\\231')
    .replace(/•/g, '\\225')
    .replace(/–/g, '\\226')
    .replace(/—/g, '\\227')
    .replace(/‘/g, '\\221')
    .replace(/’/g, '\\222')
    .replace(/“/g, '\\223')
    .replace(/”/g, '\\224')
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

function formatDisposalReason(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return 'Missing reason'
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function getDisposalInventoryItem(row: DisposalReviewRow) {
  const relation = row.inventory_items
  if (Array.isArray(relation)) {
    return relation[0] ?? null
  }
  return relation ?? null
}

function getDisposalItemName(row: DisposalReviewRow) {
  const item = getDisposalInventoryItem(row)
  if (!item) return `Inventory item ${row.inventory_item_id ?? ''}`.trim()
  return (
    item.title ||
    [item.year, item.set_name, item.player_name, item.card_number ? `#${item.card_number}` : null]
      .filter(Boolean)
      .join(' • ') ||
    `Inventory item ${row.inventory_item_id ?? ''}`.trim()
  )
}

function getDisposalCostBasis(row: DisposalReviewRow) {
  return Number(getDisposalInventoryItem(row)?.cost_basis_total ?? 0)
}

function getDisposalQuantity(row: DisposalReviewRow) {
  const item = getDisposalInventoryItem(row)
  const quantity = Number(item?.quantity ?? 0)
  const availableQuantity = Number(item?.available_quantity ?? 0)
  if (quantity > 0) return quantity
  if (availableQuantity > 0) return availableQuantity
  return Math.abs(Number(row.quantity_change ?? 0))
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
}


function formatPdfAmount(value: number | null | undefined, valueType: PdfLine['valueType']) {
  if (valueType === 'count') {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Number(value ?? 0))
  }

  return money(value)
}

function buildDisposalDetailLabel(row: DisposalReviewRow) {
  const notes = String(row.disposal_notes || row.notes || 'No notes entered').trim()

  return [
    `Date: ${formatShortDate(row.created_at)}`,
    `Item: ${getDisposalItemName(row)}`,
    `Qty: ${getDisposalQuantity(row)}`,
    `Reason: ${formatDisposalReason(row.disposal_reason)}`,
    `Notes: ${notes || 'No notes entered'}`,
  ].join('\n')
}

function buildPdf(lines: PdfLine[]) {
  const pageWidth = 612
  const pageHeight = 792
  const marginX = 54
  const amountX = 460
  const startY = 730
  const bottomY = 60
  const rightX = pageWidth - marginX

  const pages: string[] = []
  let current = ''
  let y = startY
  let pageNumber = 1

  function addRaw(value: string) {
    current += value
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

  function newPage() {
    if (current) {
      addText(`Page ${pageNumber}`, marginX, 34, 8, false)
      pages.push(current)
      pageNumber += 1
    }

    current = ''
    y = startY
  }

  function ensureSpace(heightNeeded: number) {
    if (y - heightNeeded < bottomY) {
      newPage()
    }
  }

  function getApproxTextWidth(text: string, size: number) {
    return text.length * size * 0.5
  }

  function wrapText(text: string, maxWidth: number, size: number) {
    const rawParts = String(text || '').split(/\r?\n/)
    const wrapped: string[] = []

    for (const rawPart of rawParts) {
      const words = rawPart.trim().split(/\s+/).filter(Boolean)

      if (words.length === 0) {
        wrapped.push('')
        continue
      }

      let line = ''

      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word

        if (line && getApproxTextWidth(candidate, size) > maxWidth) {
          wrapped.push(line)
          line = word
        } else {
          line = candidate
        }
      }

      if (line) {
        wrapped.push(line)
      }
    }

    return wrapped
  }

  function addWrappedText(text: string, x: number, textY: number, maxWidth: number, size = 10, bold = false, lineHeight = 12) {
    const wrappedLines = wrapText(text, maxWidth, size)

    wrappedLines.forEach((wrappedLine, index) => {
      addText(wrappedLine, x, textY - index * lineHeight, size, bold)
    })

    return wrappedLines.length
  }

  newPage()

  for (const line of lines) {
    const type = line.type ?? 'main'

    if (type === 'spacer') {
      ensureSpace(10)
      y -= 10
      continue
    }

    if (type === 'title') {
      const lineHeight = 22
      const maxWidth = rightX - marginX
      const wrappedLineCount = wrapText(line.label, maxWidth, 20).length
      ensureSpace(wrappedLineCount * lineHeight + 40)
      addWrappedText(line.label, marginX, y, maxWidth, 20, true, lineHeight)
      y -= wrappedLineCount * lineHeight
      addRule(y)
      y -= 24
      continue
    }

    if (type === 'section') {
      ensureSpace(36)
      y -= 6
      addSectionBackground(y)
      addWrappedText(line.label, marginX, y, rightX - marginX, 12, true, 14)
      y -= 24
      continue
    }

    if (type === 'note') {
      const maxWidth = rightX - marginX
      const lineHeight = 11
      const wrappedLineCount = wrapText(line.label, maxWidth, 8).length
      ensureSpace(wrappedLineCount * lineHeight + 4)
      addWrappedText(line.label, marginX, y, maxWidth, 8, false, lineHeight)
      y -= wrappedLineCount * lineHeight + 3
      continue
    }

    const isMain = type === 'main'
    const labelX = type === 'sub' ? marginX + 22 : marginX
    const size = isMain ? 10 : 9
    const lineHeight = isMain ? 13 : 12
    const hasAmount = line.amount !== undefined && line.amount !== null
    const amountText = hasAmount ? formatPdfAmount(line.amount, line.valueType) : ''
    const labelMaxWidth = hasAmount ? amountX - labelX - 18 : rightX - labelX
    const wrappedLineCount = wrapText(line.label, labelMaxWidth, size).length
    const blockHeight = Math.max(1, wrappedLineCount) * lineHeight + (isMain ? 5 : 4)

    ensureSpace(blockHeight)
    addWrappedText(line.label, labelX, y, labelMaxWidth, size, isMain, lineHeight)

    if (hasAmount) {
      addText(amountText, amountX, y, size, isMain)
    }

    y -= blockHeight
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >> >> /Contents ${contentObjectNumber} 0 R >>`
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

  const [salesRes, inventoryRes, expensesRes, disposalReviewRes, taxSettingsRes, profileRes] = await Promise.all([
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
      .from('inventory_transactions')
      .select(`
        id,
        inventory_item_id,
        quantity_change,
        disposal_reason,
        disposal_notes,
        notes,
        created_at,
        inventory_items (
          title,
          player_name,
          year,
          set_name,
          card_number,
          cost_basis_total,
          cost_basis_unit,
          quantity,
          available_quantity
        )
      `)
      .eq('user_id', user.id)
      .eq('transaction_type', 'disposal_writeoff_review')
      .eq('finalized_for_tax', true)
      .gte('created_at', `${startDate}T00:00:00.000Z`)
      .lte('created_at', `${endDate}T23:59:59.999Z`)
      .order('created_at', { ascending: false }),

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
  const disposalReviewRows: DisposalReviewRow[] = ((disposalReviewRes.data ?? []) as unknown) as DisposalReviewRow[]
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

  const manualCommissionsAndFees = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Commissions and fees')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const turbotaxCommissionsAndFees = roundMoney(
    totalPlatformFees + manualCommissionsAndFees
  )

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

  const commissionsAndFeesCount = countForScheduleArea('Commissions and fees')
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

  const disposalReviewCount = disposalReviewRows.length
  const totalDisposalReviewCost = roundMoney(
    disposalReviewRows.reduce((sum, row) => sum + getDisposalCostBasis(row), 0)
  )
  const disposalReasonSummaryRows = Array.from(
    disposalReviewRows.reduce((map, row) => {
      const reason = formatDisposalReason(row.disposal_reason)
      const current = map.get(reason) ?? { count: 0, cost: 0 }
      map.set(reason, {
        count: current.count + 1,
        cost: roundMoney(current.cost + getDisposalCostBasis(row)),
      })
      return map
    }, new Map<string, { count: number; cost: number }>())
  )
    .map(([reason, values]) => ({ reason, ...values }))
    .sort((a, b) => b.cost - a.cost)

  const disposalRowsMissingReason = disposalReviewRows.filter((row) => !String(row.disposal_reason ?? '').trim()).length
  const disposalRowsMissingNotes = disposalReviewRows.filter((row) => !String(row.disposal_notes ?? '').trim()).length

  const warnings: string[] = []

  if (!taxSettings) {
    warnings.push('No yearly tax settings record exists yet. Beginning inventory and extra Schedule C lines are using zero defaults.')
  }

  if (beginningInventory === 0 && (totalCOGS > 0 || endingInventoryCost > 0)) {
    warnings.push('Beginning inventory is zero. Confirm this is correct before filing.')
  }

  if (purchasesForCogsSupport < 0) {
    warnings.push('COGS support produced negative purchases. Review beginning inventory and ending inventory before filing.')
  }

  if (endingInventoryIsLocked) {
    warnings.push(
      `Ending inventory is LOCKED for this tax year${taxSettings?.ending_inventory_locked_at ? ` at ${taxSettings.ending_inventory_locked_at}` : ''}. This PDF is CPA-safe for filed-year reporting.`
    )
  } else {
    warnings.push('Ending inventory is NOT locked. PDF values may change if inventory changes. Lock the tax-year snapshot before filing or sending final numbers to a CPA.')
  }

  if (manualCommissionsAndFees > 0) {
    warnings.push('Manual commission / fee expenses are included on Schedule C Line 10. Confirm these are not duplicates of sale-level platform fees.')
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

  if (disposalReviewCount > 0) {
    warnings.push('Finalized disposal / write-off review items exist. Review the disposal section so these items are not double counted as expenses, giveaways, donations, or separate inventory losses.')
  }

  if (disposalRowsMissingReason > 0) {
    warnings.push(`${disposalRowsMissingReason} finalized disposal item(s) are missing a disposal reason.`)
  }

  if (disposalRowsMissingNotes > 0) {
    warnings.push(`${disposalRowsMissingNotes} finalized disposal item(s) are missing detailed notes.`)
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
        endingInventoryIsLocked
          ? 'Amounts are based on tracked sales, expenses, locked ending inventory, beginning inventory settings, and COGS records in HITS™.'
          : 'Amounts are based on tracked sales, expenses, live inventory, beginning inventory settings, and COGS records in HITS™. Lock ending inventory before filing.',
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
      amount: turbotaxCommissionsAndFees,
      type: 'main',
    },
    {
      label: `Sale-level marketplace / platform fees (${saleCount} sales reviewed)`,
      amount: totalPlatformFees,
      type: 'sub',
    },
    {
      label: `Manual commissions / fee expenses (${commissionsAndFeesCount} tracked manual entries)`,
      amount: manualCommissionsAndFees,
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
      label: endingInventoryIsLocked
        ? `Ending inventory source: locked tax-year snapshot${taxSettings?.ending_inventory_locked_at ? ` locked at ${taxSettings.ending_inventory_locked_at}` : ''}`
        : 'Ending inventory source: live inventory at PDF export time. Lock before filing.',
      type: 'note',
    },
    {
      label: 'Live ending inventory reference',
      amount: liveEndingInventoryCost,
      type: 'sub',
    },
    {
      label: 'Line 42: Cost of goods sold',
      amount: totalCOGS,
      type: 'main',
    },

    { label: 'DISPOSAL / WRITE-OFF REVIEW', type: 'section' },
    {
      label: 'Finalized disposal records reviewed',
      amount: disposalReviewCount,
      valueType: 'count',
      type: 'main',
    },
    {
      label: 'Total cost basis flagged for disposal / write-off review',
      amount: totalDisposalReviewCost,
      type: 'main',
    },
    {
      label:
        'These records are review support only. Confirm final tax treatment with your CPA/preparer and do not also deduct these items as expenses, giveaways, donations, or separate losses.',
      type: 'note',
    },
    ...(disposalReasonSummaryRows.length > 0
      ? disposalReasonSummaryRows.map((row) => ({
          label: `${row.reason} (${row.count} finalized item${row.count === 1 ? '' : 's'})`,
          amount: row.cost,
          type: 'sub' as const,
        }))
      : [
          {
            label: 'No finalized disposal / write-off review records found for this tax year.',
            type: 'note' as const,
          },
        ]),
    ...(disposalReviewRows.length > 0
      ? [
          {
            label: 'Disposal detail',
            type: 'main' as const,
          },
          ...disposalReviewRows.slice(0, 20).map((row) => ({
            label: buildDisposalDetailLabel(row),
            amount: getDisposalCostBasis(row),
            type: 'sub' as const,
          })),
          ...(disposalReviewRows.length > 20
            ? [
                {
                  label: `${disposalReviewRows.length - 20} additional finalized disposal record(s) not shown. Use workbook/export details for the full list.`,
                  type: 'note' as const,
                },
              ]
            : []),
        ]
      : []),

    { label: 'AUDIT SUPPORT / RECORD COUNTS', type: 'section' },
    {
      label: 'Sales reviewed for this tax year',
      amount: saleCount,
      valueType: 'count',
      type: 'main',
    },
    {
      label: 'Manual expense records reviewed',
      amount: manualExpenseCount,
      valueType: 'count',
      type: 'main',
    },
    {
      label: 'Ending inventory items reviewed',
      amount: inventoryCount,
      valueType: 'count',
      type: 'main',
    },
    {
      label: 'Finalized disposal / write-off review records',
      amount: disposalReviewCount,
      valueType: 'count',
      type: 'main',
    },
    {
      label: 'Ending inventory source',
      type: 'main',
    },
    {
      label: endingInventoryIsLocked
        ? `Locked snapshot${taxSettings?.ending_inventory_locked_at ? ` locked at ${taxSettings.ending_inventory_locked_at}` : ''}`
        : 'Live inventory value at export time',
      type: 'note',
    },
    {
      label: 'Live ending inventory reference',
      amount: liveEndingInventoryCost,
      type: 'sub',
    },
    {
      label: 'Advertising entries',
      amount: advertisingCount,
      valueType: 'count',
      type: 'sub',
    },
    {
      label: 'Manual commissions / fees entries',
      amount: commissionsAndFeesCount,
      valueType: 'count',
      type: 'sub',
    },
    {
      label: 'Supplies entries',
      amount: suppliesCount,
      valueType: 'count',
      type: 'sub',
    },
    {
      label: 'Postage / shipping entries',
      amount: postageShippingCount,
      valueType: 'count',
      type: 'sub',
    },
    {
      label: 'Software / subscriptions entries',
      amount: softwareCount,
      valueType: 'count',
      type: 'sub',
    },
    {
      label: 'Grading / authentication entries',
      amount: gradingCount,
      valueType: 'count',
      type: 'sub',
    },
    {
      label: 'Equipment review entries',
      amount: equipmentReviewCount,
      valueType: 'count',
      type: 'sub',
    },
    {
      label: 'Uncategorized / other entries',
      amount: uncategorizedCount,
      valueType: 'count',
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
      label: 'Manual commissions / fee expenses',
      amount: manualCommissionsAndFees,
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
      label: 'Finalized disposal / write-off review cost basis',
      amount: totalDisposalReviewCost,
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
        'Disposal / write-off note: finalized disposal records are CPA/tax review support and should not be double counted as manual expenses, giveaways, donations, or additional inventory losses.',
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
