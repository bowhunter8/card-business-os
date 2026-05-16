import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getExpenseScheduleCArea } from '@/lib/reports/expense-categories'
import {
  buildReportFilename,
  formatReportDate,
  jsonError,
  moneyString,
  pdfDownloadResponse,
  unauthorizedError,
} from '@/lib/reports/report-export-utils'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    reportType: string
  }>
}

type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

type InventoryItemRow = {
  id: string
  title?: string | null
  item_name?: string | null
  player_name?: string | null
  year?: string | number | null
  set_name?: string | null
  card_number?: string | null
  item_number?: string | null
  status?: string | null
  purchase_price?: number | string | null
  cost?: number | string | null
  allocated_cost?: number | string | null
  current_value?: number | string | null
  estimated_value?: number | string | null
  sale_price?: number | string | null
  sold_price?: number | string | null
  created_at?: string | null
  acquired_at?: string | null
  purchase_date?: string | null
  date_added?: string | null
  notes?: string | null
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

type SaleInventoryRow = {
  id: string
  title: string | null
  player_name: string | null
  year: number | null
  set_name: string | null
  card_number: string | null
  notes: string | null
  status: string | null
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

type PdfLine = {
  label: string
  type?: 'title' | 'section' | 'main' | 'sub' | 'note' | 'spacer'
}

type PdfTableColumn = {
  key: string
  label: string
  width: number
  align?: 'left' | 'right'
}

type PdfTableRow = Record<string, string>

type PdfTable = {
  type: 'table'
  columns: PdfTableColumn[]
  rows: PdfTableRow[]
  emptyMessage: string
}

type PdfSummaryGrid = {
  type: 'summaryGrid'
  cards: { label: string; value: string }[]
}

type PdfElement = PdfLine | PdfTable | PdfSummaryGrid

const REPORT_LABELS: Record<string, string> = {
  inventory: 'Inventory Report',
  sales: 'Sales Report',
  expenses: 'Expenses Report',
}

function asString(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  const numeric =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ''))

  return Number.isFinite(numeric) ? numeric : 0
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function normalizeStatus(status: string | null | undefined) {
  const clean = asString(status).trim()
  return clean || 'unknown'
}

function getItemDate(item: InventoryItemRow) {
  return item.acquired_at || item.purchase_date || item.date_added || item.created_at || null
}

function getItemCost(item: InventoryItemRow) {
  return asNumber(item.allocated_cost ?? item.purchase_price ?? item.cost ?? 0)
}

function getItemValue(item: InventoryItemRow) {
  return asNumber(
    item.current_value ??
      item.estimated_value ??
      item.sale_price ??
      item.sold_price ??
      0
  )
}

function getBaseItemName(item: InventoryItemRow) {
  return item.title || item.item_name || item.player_name || 'Untitled item'
}

function getItemNumber(item: InventoryItemRow) {
  return asString(item.item_number || item.card_number)
}

function matchesSearch(item: InventoryItemRow, search: string) {
  if (!search) return true

  const haystack = [
    item.title,
    item.item_name,
    item.player_name,
    item.year,
    item.set_name,
    item.card_number,
    item.item_number,
    item.status,
    item.notes,
  ]
    .map(asString)
    .join(' ')
    .toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function matchesDateRange(item: InventoryItemRow, startDate: string, endDate: string) {
  const rawDate = getItemDate(item)
  if (!rawDate) return true

  const itemDate = new Date(rawDate)
  if (Number.isNaN(itemDate.getTime())) return true

  if (startDate) {
    const fromDate = new Date(`${startDate}T00:00:00`)
    if (!Number.isNaN(fromDate.getTime()) && itemDate < fromDate) return false
  }

  if (endDate) {
    const toDate = new Date(`${endDate}T23:59:59`)
    if (!Number.isNaN(toDate.getTime()) && itemDate > toDate) return false
  }

  return true
}

function matchesValueFilter(item: InventoryItemRow, valueFilter: string) {
  if (!valueFilter || valueFilter === 'all') return true

  const value = getItemValue(item)

  if (valueFilter === 'no-value') return value <= 0
  if (valueFilter === 'under-10') return value > 0 && value < 10
  if (valueFilter === '10-50') return value >= 10 && value <= 50
  if (valueFilter === '50-100') return value > 50 && value <= 100
  if (valueFilter === 'over-100') return value > 100

  return true
}

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return parsed
}

function clampMonth(raw?: string | null) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    return new Date().getMonth() + 1
  }

  return parsed
}

function clampQuarter(raw?: string | null) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
    return Math.floor(new Date().getMonth() / 3) + 1
  }

  return parsed
}

function normalizePeriod(raw?: string | null): ReportPeriod {
  if (raw === 'daily' || raw === 'day') return 'day'
  if (raw === 'weekly' || raw === 'week') return 'week'
  if (raw === 'monthly' || raw === 'month') return 'month'
  if (raw === 'quarterly' || raw === 'quarter') return 'quarter'
  if (raw === 'yearly' || raw === 'year') return 'year'
  if (raw === 'custom') return 'custom'

  return 'year'
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseInputDate(value: string | undefined | null, fallback: Date) {
  if (!value) return fallback

  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== 3) return fallback

  const [year, month, day] = parts
  if (!year || !month || !day) return fallback

  const date = new Date(year, month - 1, day)

  if (Number.isNaN(date.getTime())) return fallback

  return date
}

function getStartOfWeek(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  const diff = day === 0 ? -6 : 1 - day

  result.setDate(result.getDate() + diff)

  return result
}

function getEndOfWeek(date: Date) {
  const result = getStartOfWeek(date)

  result.setDate(result.getDate() + 6)

  return result
}

function getSalesReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
}: {
  selectedYear: number
  period: ReportPeriod
  start?: string | null
  end?: string | null
  month: number
  quarter: number
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'day') {
    const selectedDay = parseInputDate(start, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily Sales Report: ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Sales Report: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Sales Report: ${monthStart.toLocaleString('default', {
        month: 'long',
      })} ${selectedYear}`,
    }
  }

  if (period === 'quarter') {
    const quarterStartMonth = (quarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly Sales Report: Q${quarter} ${selectedYear}`,
    }
  }

  if (period === 'custom') {
    const fallbackStart = new Date(selectedYear, 0, 1)
    const fallbackEnd = new Date(selectedYear, 11, 31)

    const customStart = parseInputDate(start, fallbackStart)
    const customEnd = parseInputDate(end, fallbackEnd)

    const normalizedStart =
      customStart.getTime() <= customEnd.getTime() ? customStart : customEnd
    const normalizedEnd =
      customStart.getTime() <= customEnd.getTime() ? customEnd : customStart

    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
      label: `Custom Sales Report: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Sales Report: ${selectedYear}`,
  }
}

function getExpensesReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
}: {
  selectedYear: number
  period: ReportPeriod
  start?: string | null
  end?: string | null
  month: number
  quarter: number
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'day') {
    const selectedDay = parseInputDate(start, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily Expenses Report ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Expenses Report ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Expenses Report ${monthStart.toLocaleString('default', {
        month: 'long',
      })} ${selectedYear}`,
    }
  }

  if (period === 'quarter') {
    const quarterStartMonth = (quarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly Expenses Report Q${quarter} ${selectedYear}`,
    }
  }

  if (period === 'custom') {
    const fallbackStart = new Date(selectedYear, 0, 1)
    const fallbackEnd = new Date(selectedYear, 11, 31)

    const customStart = parseInputDate(start, fallbackStart)
    const customEnd = parseInputDate(end, fallbackEnd)

    const normalizedStart =
      customStart.getTime() <= customEnd.getTime() ? customStart : customEnd
    const normalizedEnd =
      customStart.getTime() <= customEnd.getTime() ? customEnd : customStart

    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
      label: `Custom Expenses Report ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Expenses Report ${selectedYear}`,
  }
}

function buildSaleItemName(item: SaleInventoryRow | undefined) {
  if (!item) return 'Unlinked sale'

  const parts = [
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
    item.notes,
  ]

  return parts.filter(Boolean).join(' • ') || item.title || 'Untitled item'
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
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

function formatDateForPdf(value: string | null | undefined) {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toISOString().slice(0, 10)
}

function currency(value: number) {
  return `$${moneyString(value)}`
}

function getDateRange(searchParams: URLSearchParams) {
  const startDate =
    searchParams.get('startDate') || searchParams.get('dateFrom') || ''
  const endDate =
    searchParams.get('endDate') || searchParams.get('dateTo') || ''

  if (startDate && endDate) {
    return `${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
  }

  if (startDate) {
    return `From ${formatReportDate(startDate)}`
  }

  if (endDate) {
    return `Through ${formatReportDate(endDate)}`
  }

  return 'All dates'
}

function isTable(element: PdfElement): element is PdfTable {
  return 'type' in element && element.type === 'table'
}

function isSummaryGrid(element: PdfElement): element is PdfSummaryGrid {
  return 'type' in element && element.type === 'summaryGrid'
}

function buildPdf(elements: PdfElement[]) {
  const pageWidth = 792
  const pageHeight = 612
  const marginX = 34
  const startY = 558
  const bottomY = 42
  const rightX = pageWidth - marginX
  const contentWidth = rightX - marginX

  const pages: string[] = []
  let current = ''
  let y = startY
  let pageNumber = 1

  function addRaw(value: string) {
    current += value
  }

  function getApproxTextWidth(text: string, size: number) {
    return String(text ?? '').length * size * 0.48
  }

  function addText(text: string, x: number, textY: number, size = 8, bold = false) {
    addRaw(
      `0 0 0 rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${textY} Td (${pdfEscape(
        text
      )}) Tj ET\n`
    )
  }

  function addRightText(text: string, x: number, textY: number, size = 8, bold = false) {
    addText(text, x - getApproxTextWidth(text, size), textY, size, bold)
  }

  function addRule(ruleY: number) {
    addRaw(`0.78 0.80 0.84 RG ${marginX} ${ruleY} m ${rightX} ${ruleY} l S\n`)
  }

  function addLightRule(ruleY: number) {
    addRaw(`0.90 0.91 0.93 RG ${marginX} ${ruleY} m ${rightX} ${ruleY} l S\n`)
  }

  function addFill(x: number, fillY: number, width: number, height: number, shade = '0.94 0.96 0.99') {
    addRaw(`${shade} rg ${x} ${fillY} ${width} ${height} re f\n`)
  }

  function newPage() {
    if (current) {
      addText(`Page ${pageNumber}`, marginX, 24, 7, false)
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

  function truncateText(text: string, maxWidth: number, size: number) {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim()

    if (getApproxTextWidth(clean, size) <= maxWidth) {
      return clean
    }

    let result = clean

    while (result.length > 0 && getApproxTextWidth(`${result}...`, size) > maxWidth) {
      result = result.slice(0, -1)
    }

    return result ? `${result}...` : ''
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

  function addWrappedText(text: string, x: number, textY: number, maxWidth: number, size = 8, bold = false, lineHeight = 10) {
    const wrappedLines = wrapText(text, maxWidth, size)

    wrappedLines.forEach((wrappedLine, index) => {
      addText(wrappedLine, x, textY - index * lineHeight, size, bold)
    })

    return wrappedLines.length
  }

  function addLineElement(line: PdfLine) {
    const type = line.type ?? 'main'

    if (type === 'spacer') {
      ensureSpace(8)
      y -= 8
      return
    }

    if (type === 'title') {
      const lineHeight = 18
      const wrappedLineCount = wrapText(line.label, contentWidth, 18).length
      ensureSpace(wrappedLineCount * lineHeight + 34)
      addWrappedText(line.label, marginX, y, contentWidth, 18, true, lineHeight)
      y -= wrappedLineCount * lineHeight
      addRule(y)
      y -= 18
      return
    }

    if (type === 'section') {
      ensureSpace(28)
      y -= 4
      addFill(marginX, y - 5, contentWidth, 18)
      addWrappedText(line.label, marginX + 4, y, contentWidth - 8, 10, true, 12)
      y -= 22
      return
    }

    if (type === 'note') {
      const lineHeight = 9
      const wrappedLineCount = wrapText(line.label, contentWidth, 7).length
      ensureSpace(wrappedLineCount * lineHeight + 4)
      addWrappedText(line.label, marginX, y, contentWidth, 7, false, lineHeight)
      y -= wrappedLineCount * lineHeight + 3
      return
    }

    const isMain = type === 'main'
    const labelX = type === 'sub' ? marginX + 18 : marginX
    const size = isMain ? 9 : 8
    const lineHeight = isMain ? 11 : 10
    const labelMaxWidth = rightX - labelX
    const wrappedLineCount = wrapText(line.label, labelMaxWidth, size).length
    const blockHeight = Math.max(1, wrappedLineCount) * lineHeight + (isMain ? 4 : 3)

    ensureSpace(blockHeight)
    addWrappedText(line.label, labelX, y, labelMaxWidth, size, isMain, lineHeight)
    y -= blockHeight
  }

  function addSummaryGrid(summary: PdfSummaryGrid) {
    const cardGap = 10
    const cardCount = Math.max(1, summary.cards.length)
    const cardWidth = (contentWidth - cardGap * (cardCount - 1)) / cardCount
    const cardHeight = 42

    ensureSpace(cardHeight + 10)

    summary.cards.forEach((card, index) => {
      const x = marginX + index * (cardWidth + cardGap)
      addRaw(`0.98 0.98 0.99 rg ${x} ${y - cardHeight + 7} ${cardWidth} ${cardHeight} re f\n`)
      addRaw(`0.82 0.84 0.87 RG ${x} ${y - cardHeight + 7} ${cardWidth} ${cardHeight} re S\n`)
      addText(card.label, x + 7, y - 8, 7, true)
      addText(card.value, x + 7, y - 26, 13, true)
    })

    y -= cardHeight + 12
  }

  function addTableHeader(table: PdfTable) {
    const headerHeight = 18
    addFill(marginX, y - headerHeight + 5, contentWidth, headerHeight, '0.93 0.95 0.98')

    let x = marginX

    table.columns.forEach((column) => {
      const label = truncateText(column.label, column.width - 6, 7)
      if (column.align === 'right') {
        addRightText(label, x + column.width - 4, y - 7, 7, true)
      } else {
        addText(label, x + 3, y - 7, 7, true)
      }
      x += column.width
    })

    y -= headerHeight
    addLightRule(y + 5)
  }

  function addTable(table: PdfTable) {
    if (table.rows.length === 0) {
      addLineElement({ label: table.emptyMessage, type: 'note' })
      return
    }

    ensureSpace(38)
    addTableHeader(table)

    table.rows.forEach((row, index) => {
      const rowHeight = 18
      ensureSpace(rowHeight + 4)

      if (y === startY) {
        addTableHeader(table)
      }

      if (index % 2 === 1) {
        addFill(marginX, y - rowHeight + 5, contentWidth, rowHeight, '0.985 0.985 0.985')
      }

      let x = marginX

      table.columns.forEach((column) => {
        const text = truncateText(row[column.key] ?? '', column.width - 6, 7)

        if (column.align === 'right') {
          addRightText(text, x + column.width - 4, y - 7, 7, false)
        } else {
          addText(text, x + 3, y - 7, 7, false)
        }

        x += column.width
      })

      y -= rowHeight
      addLightRule(y + 5)
    })

    y -= 8
  }

  newPage()

  for (const element of elements) {
    if (isTable(element)) {
      addTable(element)
      continue
    }

    if (isSummaryGrid(element)) {
      addSummaryGrid(element)
      continue
    }

    addLineElement(element)
  }

  if (current) {
    addText(`Page ${pageNumber}`, marginX, 24, 7, false)
    pages.push(current)
  }

  const objects: string[] = []

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')

  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2)
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((num) => `${num} 0 R`)
      .join(' ')}] /Count ${pages.length} >>`
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

function buildPlaceholderLines(reportName: string, reportLabel: string): PdfElement[] {
  return [
    { label: `${reportName} - ${reportLabel}`, type: 'title' },
    { label: 'COMING NEXT', type: 'section' },
    {
      label:
        'This report type is connected to the shared dynamic PDF route. Its detailed rows will be wired after the inventory and sales reports are confirmed.',
      type: 'note',
    },
  ]
}

function buildInventoryLines(items: InventoryItemRow[], reportLabel: string): PdfElement[] {
  const totalCost = items.reduce((sum, item) => sum + getItemCost(item), 0)
  const totalValue = items.reduce((sum, item) => sum + getItemValue(item), 0)
  const totalGainLoss = totalValue - totalCost

  const rows = items.slice(0, 250).map((item, index) => {
    const costBasis = getItemCost(item)
    const estimatedValue = getItemValue(item)
    const gainLoss = estimatedValue - costBasis

    return {
      number: String(index + 1),
      item: getBaseItemName(item),
      status: normalizeStatus(item.status),
      date: formatDateForPdf(getItemDate(item)),
      year: asString(item.year),
      set: asString(item.set_name),
      itemNumber: getItemNumber(item),
      cost: currency(costBasis),
      value: currency(estimatedValue),
      gainLoss: currency(gainLoss),
      notes: asString(item.notes),
    }
  })

  const elements: PdfElement[] = [
    { label: `Inventory Report - ${reportLabel}`, type: 'title' },
    { label: 'SUMMARY', type: 'section' },
    {
      type: 'summaryGrid',
      cards: [
        { label: 'Items in report', value: String(items.length) },
        { label: 'Total cost basis', value: currency(totalCost) },
        { label: 'Estimated value', value: currency(totalValue) },
        { label: 'Estimated gain/loss', value: currency(totalGainLoss) },
      ],
    },
    { label: 'INVENTORY ITEMS', type: 'section' },
    {
      type: 'table',
      emptyMessage: 'No inventory items found for this report filter.',
      columns: [
        { key: 'number', label: '#', width: 22, align: 'right' },
        { key: 'item', label: 'Item', width: 190 },
        { key: 'status', label: 'Status', width: 55 },
        { key: 'date', label: 'Date', width: 58 },
        { key: 'year', label: 'Year', width: 35 },
        { key: 'set', label: 'Set', width: 70 },
        { key: 'itemNumber', label: 'Item #', width: 45 },
        { key: 'cost', label: 'Cost', width: 58, align: 'right' },
        { key: 'value', label: 'Value', width: 58, align: 'right' },
        { key: 'gainLoss', label: 'Gain/Loss', width: 62, align: 'right' },
        { key: 'notes', label: 'Notes', width: 105 },
      ],
      rows,
    },
  ]

  if (items.length > 250) {
    elements.push({
      label: `${items.length - 250} additional item(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: 'note',
    })
  }

  return elements
}

function buildSalesLines({
  sales,
  inventoryById,
  reportLabel,
  platformFilter,
}: {
  sales: SaleRow[]
  inventoryById: Map<string, SaleInventoryRow>
  reportLabel: string
  platformFilter: string
}): PdfElement[] {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  )
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.platform_fees ?? 0), 0)
  )
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.shipping_cost ?? 0), 0)
  )
  const totalOtherCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.other_costs ?? 0), 0)
  )
  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingCosts + totalOtherCosts
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

  const rows = sales.slice(0, 250).map((sale, index) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined

    return {
      number: String(index + 1),
      date: formatDateForPdf(sale.sale_date),
      item: buildSaleItemName(inventoryItem),
      platform: platformKey(sale.platform),
      gross: currency(Number(sale.gross_sale ?? 0)),
      fees: currency(Number(sale.platform_fees ?? 0)),
      ship: currency(Number(sale.shipping_cost ?? 0)),
      other: currency(Number(sale.other_costs ?? 0)),
      net: currency(Number(sale.net_proceeds ?? 0)),
      cogs: currency(Number(sale.cost_of_goods_sold ?? 0)),
      profit: currency(Number(sale.profit ?? 0)),
      notes: asString(sale.notes),
    }
  })

  const elements: PdfElement[] = [
    { label: `${reportLabel}`, type: 'title' },
    { label: 'SUMMARY', type: 'section' },
    {
      type: 'summaryGrid',
      cards: [
        { label: 'Sales count', value: String(sales.length) },
        { label: 'Gross sales', value: currency(totalGrossSales) },
        { label: 'Selling costs', value: currency(totalSellingCosts) },
        { label: 'Profit', value: currency(totalProfit) },
      ],
    },
    {
      type: 'summaryGrid',
      cards: [
        { label: 'Platform filter', value: platformFilter || 'All platforms' },
        { label: 'Net proceeds', value: currency(totalNetProceeds) },
        { label: 'Realized COGS', value: currency(totalCOGS) },
        { label: 'Shipping/other', value: currency(totalShippingCosts + totalOtherCosts) },
      ],
    },
    { label: 'SALES DETAIL', type: 'section' },
    {
      type: 'table',
      emptyMessage: 'No sales found for this report range.',
      columns: [
        { key: 'number', label: '#', width: 22, align: 'right' },
        { key: 'date', label: 'Date', width: 58 },
        { key: 'item', label: 'Item', width: 170 },
        { key: 'platform', label: 'Platform', width: 58 },
        { key: 'gross', label: 'Gross', width: 55, align: 'right' },
        { key: 'fees', label: 'Fees', width: 50, align: 'right' },
        { key: 'ship', label: 'Ship', width: 48, align: 'right' },
        { key: 'other', label: 'Other', width: 48, align: 'right' },
        { key: 'net', label: 'Net', width: 55, align: 'right' },
        { key: 'cogs', label: 'COGS', width: 55, align: 'right' },
        { key: 'profit', label: 'Profit', width: 58, align: 'right' },
        { key: 'notes', label: 'Notes', width: 103 },
      ],
      rows,
    },
  ]

  if (sales.length > 250) {
    elements.push({
      label: `${sales.length - 250} additional sale(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: 'note',
    })
  }

  return elements
}

function buildExpensesLines({
  expenses,
  reportLabel,
  categoryFilter,
}: {
  expenses: ExpenseRow[]
  reportLabel: string
  categoryFilter: string
}): PdfElement[] {
  const totalExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0)
  )

  const categorySummary = Array.from(
    expenses.reduce((map, expense) => {
      const category =
        String(expense.category || 'Uncategorized').trim() || 'Uncategorized'
      const current = map.get(category) ?? { count: 0, amount: 0 }

      map.set(category, {
        count: current.count + 1,
        amount: roundMoney(current.amount + Number(expense.amount ?? 0)),
      })

      return map
    }, new Map<string, { count: number; amount: number }>())
  )
    .map(([category, values]) => ({
      category,
      scheduleCArea: getExpenseScheduleCArea(category),
      count: values.count,
      amount: values.amount,
    }))
    .sort((a, b) => b.amount - a.amount)

  const largestCategory = categorySummary[0]

  const summaryRows = categorySummary.map((row, index) => ({
    number: String(index + 1),
    category: row.category,
    scheduleCArea: row.scheduleCArea,
    count: String(row.count),
    amount: currency(row.amount),
  }))

  const detailRows = expenses.slice(0, 250).map((expense, index) => {
    const category =
      String(expense.category || 'Uncategorized').trim() || 'Uncategorized'

    return {
      number: String(index + 1),
      date: formatDateForPdf(expense.expense_date),
      category,
      scheduleCArea: getExpenseScheduleCArea(category),
      vendor: asString(expense.vendor),
      amount: currency(Number(expense.amount ?? 0)),
      notes: asString(expense.notes),
    }
  })

  const elements: PdfElement[] = [
    { label: `${reportLabel}`, type: 'title' },
    { label: 'SUMMARY', type: 'section' },
    {
      type: 'summaryGrid',
      cards: [
        { label: 'Expense count', value: String(expenses.length) },
        { label: 'Total expenses', value: currency(totalExpenses) },
        { label: 'Category filter', value: categoryFilter || 'All categories' },
        { label: 'Largest category', value: largestCategory ? largestCategory.category : 'None' },
      ],
    },
    { label: 'CATEGORY SUMMARY', type: 'section' },
    {
      type: 'table',
      emptyMessage: 'No manual expenses found for this report range.',
      columns: [
        { key: 'number', label: '#', width: 24, align: 'right' },
        { key: 'category', label: 'Category', width: 190 },
        { key: 'scheduleCArea', label: 'Schedule C Area', width: 310 },
        { key: 'count', label: 'Count', width: 70, align: 'right' },
        { key: 'amount', label: 'Amount', width: 130, align: 'right' },
      ],
      rows: summaryRows,
    },
    { label: 'EXPENSE DETAIL', type: 'section' },
    {
      type: 'table',
      emptyMessage: 'No manual expenses found for this report range.',
      columns: [
        { key: 'number', label: '#', width: 24, align: 'right' },
        { key: 'date', label: 'Date', width: 62 },
        { key: 'category', label: 'Category', width: 150 },
        { key: 'scheduleCArea', label: 'Schedule C Area', width: 205 },
        { key: 'vendor', label: 'Vendor', width: 115 },
        { key: 'amount', label: 'Amount', width: 70, align: 'right' },
        { key: 'notes', label: 'Notes', width: 98 },
      ],
      rows: detailRows,
    },
  ]

  if (expenses.length > 250) {
    elements.push({
      label: `${expenses.length - 250} additional expense(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: 'note',
    })
  }

  return elements
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { reportType } = await context.params

    if (reportType === 'tax') {
      return jsonError('Tax PDF exports use their existing dedicated route.', 400)
    }

    const reportName = REPORT_LABELS[reportType]

    if (!reportName) {
      return jsonError('Unsupported report type.', 404)
    }

    const searchParams = request.nextUrl.searchParams

    if (reportType === 'sales') {
      const selectedYear = clampYear(searchParams.get('year'))
      const selectedPeriod = normalizePeriod(searchParams.get('period'))
      const selectedMonth = clampMonth(searchParams.get('month'))
      const selectedQuarter = clampQuarter(searchParams.get('quarter'))
      const selectedPlatform = String(searchParams.get('platform') || '').trim()
      const selectedStart =
        searchParams.get('start') ||
        searchParams.get('startDate') ||
        searchParams.get('date')
      const selectedEnd = searchParams.get('end') || searchParams.get('endDate')

      const { startDate, endDate, label } = getSalesReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
      })

      const supabase = await createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return unauthorizedError()
      }

      let salesQuery = supabase
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
        .order('sale_date', { ascending: false })

      if (selectedPlatform) {
        salesQuery = salesQuery.eq('platform', selectedPlatform)
      }

      const { data: salesData, error: salesError } = await salesQuery

      if (salesError) {
        return jsonError(`Could not export sales PDF: ${salesError.message}`)
      }

      const sales = (salesData ?? []) as SaleRow[]

      const inventoryIds = Array.from(
        new Set(
          sales
            .map((sale) => sale.inventory_item_id)
            .filter((id): id is string => Boolean(id))
        )
      )

      const inventoryRes =
        inventoryIds.length > 0
          ? await supabase
              .from('inventory_items')
              .select('id, title, player_name, year, set_name, card_number, notes, status')
              .eq('user_id', user.id)
              .in('id', inventoryIds)
          : { data: [], error: null }

      if (inventoryRes.error) {
        return jsonError(
          `Could not load inventory item details for sales PDF: ${inventoryRes.error.message}`
        )
      }

      const inventoryItems = (inventoryRes.data ?? []) as SaleInventoryRow[]
      const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]))

      const pdfBuffer = buildPdf(
        buildSalesLines({
          sales,
          inventoryById,
          reportLabel: label,
          platformFilter: selectedPlatform,
        })
      )

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: 'sales-report',
          startDate,
          endDate,
          extension: 'pdf',
        }),
      })
    }

    if (reportType === 'expenses') {
      const selectedYear = clampYear(searchParams.get('year'))
      const selectedPeriod = normalizePeriod(searchParams.get('period'))
      const selectedMonth = clampMonth(searchParams.get('month'))
      const selectedQuarter = clampQuarter(searchParams.get('quarter'))
      const selectedCategory = String(searchParams.get('category') || '').trim()
      const selectedStart =
        searchParams.get('start') ||
        searchParams.get('startDate') ||
        searchParams.get('date')
      const selectedEnd = searchParams.get('end') || searchParams.get('endDate')

      const { startDate, endDate, label } = getExpensesReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
      })

      const supabase = await createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return unauthorizedError()
      }

      let expensesQuery = supabase
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
        .order('created_at', { ascending: false })

      if (selectedCategory) {
        expensesQuery = expensesQuery.eq('category', selectedCategory)
      }

      const { data, error } = await expensesQuery

      if (error) {
        return jsonError(`Could not export expenses PDF: ${error.message}`)
      }

      const expenses = (data ?? []) as ExpenseRow[]

      const pdfBuffer = buildPdf(
        buildExpensesLines({
          expenses,
          reportLabel: label,
          categoryFilter: selectedCategory,
        })
      )

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: 'expenses-report',
          startDate,
          endDate,
          extension: 'pdf',
        }),
      })
    }

    const reportLabel = getDateRange(searchParams)
    const startDate =
      String(searchParams.get('startDate') || searchParams.get('dateFrom') || '').trim()
    const endDate =
      String(searchParams.get('endDate') || searchParams.get('dateTo') || '').trim()

    if (reportType !== 'inventory') {
      const pdfBuffer = buildPdf(buildPlaceholderLines(reportName, reportLabel))

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          extension: 'pdf',
        }),
      })
    }

    const search = String(searchParams.get('q') || '').trim()
    const selectedStatus = String(searchParams.get('status') || 'all').trim()
    const selectedValue = String(searchParams.get('value') || 'all').trim()

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return unauthorizedError()
    }

    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return jsonError(`Could not export inventory PDF: ${error.message}`)
    }

    const allInventoryItems = (data ?? []) as InventoryItemRow[]

    const inventoryItems = allInventoryItems.filter((item) => {
      const status = normalizeStatus(item.status)

      if (selectedStatus !== 'all' && status !== selectedStatus) return false
      if (!matchesSearch(item, search)) return false
      if (!matchesDateRange(item, startDate, endDate)) return false
      if (!matchesValueFilter(item, selectedValue)) return false

      return true
    })

    const pdfBuffer = buildPdf(buildInventoryLines(inventoryItems, reportLabel))

    return pdfDownloadResponse({
      pdf: pdfBuffer,
      filename: buildReportFilename({
        reportName: 'inventory-report',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        extension: 'pdf',
      }),
    })
  } catch (error) {
    console.error('Dynamic report PDF export failed:', error)
    return jsonError('Unable to build PDF report.')
  }
}
