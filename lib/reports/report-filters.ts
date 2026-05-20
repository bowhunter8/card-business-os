export type ReportSearchFilter = {
  search?: string | null
}

export type ReportStatusFilter = {
  statuses?: string[] | null
}

export type ReportCategoryFilter = {
  categories?: string[] | null
}

export type ReportValueFilter = {
  minCost?: number | null
  maxCost?: number | null
  minValue?: number | null
  maxValue?: number | null
}

export type ReportQuantityFilter = {
  minQuantity?: number | null
  maxQuantity?: number | null
}

export type ReportInventoryFlags = {
  includeAvailable?: boolean
  includeListed?: boolean
  includeSold?: boolean
  includeJunk?: boolean
  includeDisposed?: boolean
  includePersonal?: boolean
  includeGiveaways?: boolean
  openLotsOnly?: boolean
}

export type SharedReportFilters =
  & ReportSearchFilter
  & ReportStatusFilter
  & ReportCategoryFilter
  & ReportValueFilter
  & ReportQuantityFilter
  & ReportInventoryFlags

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeSearchTerm(value?: string | null) {
  return normalizeWhitespace(String(value ?? ''))
}

export function normalizeSearchTerms(value?: string | null) {
  const normalized = normalizeSearchTerm(value)

  if (!normalized) return []

  return Array.from(
    new Set(
      normalized
        .split(/[,\n]+/)
        .map((part) => normalizeWhitespace(part))
        .filter(Boolean)
    )
  )
}

export function normalizeStringArray(values?: string[] | null) {
  if (!values?.length) return []

  return Array.from(
    new Set(
      values
        .map((value) => normalizeWhitespace(String(value)))
        .filter(Boolean)
    )
  )
}

export function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

export function valueInRange(
  value: number,
  min?: number | null,
  max?: number | null
) {
  if (min !== null && min !== undefined && value < min) {
    return false
  }

  if (max !== null && max !== undefined && value > max) {
    return false
  }

  return true
}

export function quantityMatches(
  quantity: number,
  filters: ReportQuantityFilter
) {
  return valueInRange(
    quantity,
    filters.minQuantity,
    filters.maxQuantity
  )
}

export function costMatches(
  cost: number,
  filters: ReportValueFilter
) {
  return valueInRange(
    cost,
    filters.minCost,
    filters.maxCost
  )
}

export function estimatedValueMatches(
  value: number,
  filters: ReportValueFilter
) {
  return valueInRange(
    value,
    filters.minValue,
    filters.maxValue
  )
}

export function statusMatches(
  status: string | null | undefined,
  selectedStatuses?: string[] | null
) {
  const normalizedStatuses = normalizeStringArray(selectedStatuses)

  if (normalizedStatuses.length === 0) {
    return true
  }

  const normalizedStatus = normalizeWhitespace(String(status ?? '')).toLowerCase()

  return normalizedStatuses.some(
    (candidate) => candidate.toLowerCase() === normalizedStatus
  )
}

export function categoryMatches(
  category: string | null | undefined,
  selectedCategories?: string[] | null
) {
  const normalizedCategories = normalizeStringArray(selectedCategories)

  if (normalizedCategories.length === 0) {
    return true
  }

  const normalizedCategory = normalizeWhitespace(String(category ?? '')).toLowerCase()

  return normalizedCategories.some(
    (candidate) => candidate.toLowerCase() === normalizedCategory
  )
}

export function searchTextMatches(
  searchText: string,
  search?: string | null
) {
  const terms = normalizeSearchTerms(search)

  if (terms.length === 0) {
    return true
  }

  const normalizedSearchText = normalizeWhitespace(searchText).toLowerCase()

  return terms.every((term) =>
    normalizedSearchText.includes(term.toLowerCase())
  )
}

export function buildInventorySearchText(item: {
  title?: string | null
  player_name?: string | null
  year?: number | null
  brand?: string | null
  set_name?: string | null
  card_number?: string | null
  parallel_name?: string | null
  team?: string | null
  item_type?: string | null
  storage_location?: string | null
  notes?: string | null
  status?: string | null
}) {
  return [
    item.title,
    item.player_name,
    item.year,
    item.brand,
    item.set_name,
    item.card_number,
    item.parallel_name,
    item.team,
    item.item_type,
    item.storage_location,
    item.notes,
    item.status,
  ]
    .filter(Boolean)
    .join(' ')
}

export function isOpenLot(
  quantity?: number | null,
  availableQuantity?: number | null
) {
  const qty = safeNumber(quantity)
  const available = safeNumber(availableQuantity)

  return qty > 1 && available > 0 && available < qty
}

export function filterOpenLots<T extends {
  quantity?: number | null
  available_quantity?: number | null
}>(
  rows: T[]
) {
  return rows.filter((row) =>
    isOpenLot(row.quantity, row.available_quantity)
  )
}
