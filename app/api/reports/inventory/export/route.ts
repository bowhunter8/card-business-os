import { createClient } from '@/lib/supabase/server'
import {
  buildCsv,
  buildReportFilename,
  csvDownloadResponse,
  jsonError,
  moneyString,
  unauthorizedError,
} from '@/lib/reports/report-export-utils'

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

function getItemName(item: InventoryItemRow) {
  const directTitle = item.title || item.item_name || item.player_name || 'Untitled item'

  const details = [
    item.year ? String(item.year) : '',
    item.set_name || '',
    item.item_number || item.card_number || '',
  ].filter(Boolean)

  if (!details.length) return directTitle

  return `${directTitle} — ${details.join(' ')}`
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const search = String(searchParams.get('q') || '').trim()
  const selectedStatus = String(searchParams.get('status') || 'all').trim()
  const selectedValue = String(searchParams.get('value') || 'all').trim()
  const startDate =
    String(searchParams.get('startDate') || searchParams.get('dateFrom') || '').trim()
  const endDate =
    String(searchParams.get('endDate') || searchParams.get('dateTo') || '').trim()

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
    return jsonError(`Could not export inventory: ${error.message}`)
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

  const csvRows = inventoryItems.map((item) => {
    const costBasis = getItemCost(item)
    const estimatedValue = getItemValue(item)
    const gainLoss = estimatedValue - costBasis

    return {
      item_id: item.id,
      item_name: getItemName(item),
      status: normalizeStatus(item.status),
      item_date: getItemDate(item) || '',
      year: item.year || '',
      set_name: item.set_name || '',
      item_number: item.item_number || item.card_number || '',
      cost_basis: moneyString(costBasis),
      estimated_value: moneyString(estimatedValue),
      estimated_gain_loss: moneyString(gainLoss),
      notes: item.notes || '',
    }
  })

  const csv = '\uFEFF' + buildCsv(
    csvRows,
    'No inventory items found for this report filter.'
  )

  const filename = buildReportFilename({
    reportName: 'inventory-report',
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}
