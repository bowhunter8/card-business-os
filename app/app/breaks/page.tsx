import Link from 'next/link'
import Script from 'next/script'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CancelDetailsButton from '../search/CancelDetailsButton'

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  order_number: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  total_cost: number | null
  allocation_method: string | null
  notes?: string | null
  reversed_at?: string | null
  cards_received?: number | null
  entered_count?: number | null
  remaining_count?: number | null
  completion_status?: string | null
}

type ImportedOrderRow = {
  id: string
  break_id: string | null
  order_id: string | null
  order_numeric_id: string | null
  buyer: string | null
  seller: string | null
  product_name: string | null
  processed_date: string | null
  processed_date_display: string | null
  order_status: string | null
  quantity: number | null
  subtotal: number | null
  shipping_price: number | null
  taxes: number | null
  total: number | null
  source_file_name: string | null
  created_at: string | null
}

type BreakViewRow = BreakRow & {
  received: number
  entered: number
  remaining: number
  completionStatus: 'Open' | 'In Progress' | 'Complete' | 'Reversed'
}

type SortKey =
  | 'break_date'
  | 'product_name'
  | 'source_name'
  | 'order_number'
  | 'completionStatus'
  | 'entered'
  | 'received'
  | 'remaining'
  | 'total_cost'

type SortDir = 'asc' | 'desc'
type ImportedOrdersSortKey =
  | 'order_number'
  | 'created_at'
  | 'processed_date'
  | 'seller'
  | 'product_name'
  | 'order_status'
  | 'total'
type PageLimit = 5 | 10 | 25 | 100

const DEFAULT_LIMIT: PageLimit = 5
const LIMIT_OPTIONS: PageLimit[] = [5, 10, 25, 100]
const BULK_BREAKS_FORM_ID = 'bulk-delete-breaks-page-form'
const BULK_SELECTION_COUNT_ID = 'breaks-bulk-selection-count'
const BULK_PENDING_STATE_ID = 'breaks-bulk-pending-state'
const IMPORTED_ORDERS_FORM_ID = 'imported-orders-combine-form'
const IMPORTED_SELECTION_COUNT_ID = 'imported-orders-selection-count'
const IMPORTED_PENDING_STATE_ID = 'imported-orders-pending-state'

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanText(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).format(parsed)
}

function getImportedOrderNumber(order: ImportedOrderRow) {
  const numericId = cleanText(order.order_numeric_id)
  const orderId = cleanText(order.order_id)

  if (numericId) return numericId
  if (orderId) return orderId

  return '—'
}

function getImportedOrderDescription(order: ImportedOrderRow) {
  const productName = cleanText(order.product_name)

  if (productName) return productName

  return 'Imported order'
}

function buildImportedOrderFocusHref(order: ImportedOrderRow) {
  const params = new URLSearchParams()

  if (order.id) params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)

  return `/app/whatnot-orders/focus?${params.toString()}`
}

function getCompletionStatus(
  received: number,
  entered: number,
  reversedAt?: string | null
): 'Open' | 'In Progress' | 'Complete' | 'Reversed' {
  if (reversedAt) return 'Reversed'
  if (received <= 0) return 'Open'
  if (entered <= 0) return 'Open'
  if (entered < received) return 'In Progress'
  return 'Complete'
}

function getSortValue(item: BreakViewRow, key: SortKey) {
  switch (key) {
    case 'break_date':
      return item.break_date || ''
    case 'product_name':
      return item.product_name || ''
    case 'source_name':
      return item.source_name || ''
    case 'order_number':
      return item.order_number || ''
    case 'completionStatus':
      return item.completionStatus || ''
    case 'entered':
      return item.entered
    case 'received':
      return item.received
    case 'remaining':
      return item.remaining
    case 'total_cost':
      return Number(item.total_cost ?? 0)
    default:
      return ''
  }
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function sortRows(rows: BreakViewRow[], sortKey: SortKey, sortDir: SortDir) {
  return [...rows].sort((left, right) => {
    const result = compareValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
    return sortDir === 'asc' ? result : -result
  })
}

function getNextSortDir(currentKey: SortKey, currentDir: SortDir, nextKey: SortKey): SortDir {
  if (currentKey !== nextKey) return nextKey === 'break_date' ? 'desc' : 'asc'
  return currentDir === 'asc' ? 'desc' : 'asc'
}

function getSortIndicator(currentKey: SortKey, currentDir: SortDir, key: SortKey) {
  if (currentKey !== key) return '↕'
  return currentDir === 'asc' ? '↑' : '↓'
}


function getImportedSortValue(item: ImportedOrderRow, key: ImportedOrdersSortKey) {
  switch (key) {
    case 'order_number':
      return getImportedOrderNumber(item)
    case 'created_at':
      return item.created_at || ''
    case 'processed_date':
      return item.processed_date_display || item.processed_date || ''
    case 'seller':
      return item.seller || ''
    case 'product_name':
      return getImportedOrderDescription(item)
    case 'order_status':
      return item.order_status || ''
    case 'total':
      return Number(item.total ?? 0)
    default:
      return ''
  }
}

function getNextImportedSortDir(
  currentKey: ImportedOrdersSortKey,
  currentDir: SortDir,
  nextKey: ImportedOrdersSortKey
): SortDir {
  if (currentKey !== nextKey) return nextKey === 'created_at' ? 'desc' : 'asc'
  return currentDir === 'asc' ? 'desc' : 'asc'
}

function getImportedSortIndicator(
  currentKey: ImportedOrdersSortKey,
  currentDir: SortDir,
  key: ImportedOrdersSortKey
) {
  if (currentKey !== key) return '↕'
  return currentDir === 'asc' ? '↑' : '↓'
}

function sortImportedOrders(
  rows: ImportedOrderRow[],
  sortKey: ImportedOrdersSortKey,
  sortDir: SortDir
) {
  return [...rows].sort((left, right) => {
    const result = compareValues(getImportedSortValue(left, sortKey), getImportedSortValue(right, sortKey))
    return sortDir === 'asc' ? result : -result
  })
}

function buildBreaksHref({
  q,
  sort,
  dir,
  page,
  limit,
  ordersLimit,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  ordersLimit: number
}) {
  const params = new URLSearchParams()

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))

  return `/app/breaks?${params.toString()}`
}

function buildBreaksStatusHref({
  q,
  sort,
  dir,
  page,
  limit,
  ordersLimit,
  statusKey,
  statusValue,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  ordersLimit: number
  statusKey: string
  statusValue: string
}) {
  const params = new URLSearchParams()

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))
  params.set(statusKey, statusValue)

  return `/app/breaks?${params.toString()}#breaks-status`
}

function buildImportedOrdersStatusHref({
  q,
  sort,
  dir,
  page,
  limit,
  ordersLimit,
  statusKey,
  statusValue,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  ordersLimit: number
  statusKey: string
  statusValue: string
}) {
  const params = new URLSearchParams()

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))
  params.set(statusKey, statusValue)

  return `/app/breaks?${params.toString()}#imported-orders-status`
}

function buildReceivedLimitHref({
  q,
  sort,
  dir,
  limit,
  ordersLimit,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  limit: number
  ordersLimit: number
}) {
  const params = new URLSearchParams()

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', '1')
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))

  return `/app/breaks?${params.toString()}`
}

function buildOrdersLimitHref({
  q,
  sort,
  dir,
  page,
  limit,
  ordersLimit,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  ordersLimit: number
}) {
  const params = new URLSearchParams()

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))

  return `/app/breaks?${params.toString()}#imported-orders-status`
}


function buildImportedOrdersSortHref({
  q,
  sort,
  dir,
  page,
  limit,
  ordersLimit,
  ordersSort,
  ordersDir,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  ordersLimit: number
  ordersSort: ImportedOrdersSortKey
  ordersDir: SortDir
}) {
  const params = new URLSearchParams()

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))
  params.set('orders_sort', ordersSort)
  params.set('orders_dir', ordersDir)

  return `/app/breaks?${params.toString()}#imported-orders-status`
}

function getFilterHref(
  filter: '' | 'active' | 'open',
  sortKey: SortKey,
  sortDir: SortDir,
  limit: number,
  ordersLimit: number
) {
  const params = new URLSearchParams()

  if (filter) params.set('q', filter)
  params.set('sort', sortKey)
  params.set('dir', sortDir)
  params.set('page', '1')
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))

  const query = params.toString()
  return query ? `/app/breaks?${query}` : '/app/breaks'
}

function readFormIds(formData: FormData, fieldName: string) {
  return formData
    .getAll(fieldName)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

function readBreakListFormState(formData: FormData) {
  const q = String(formData.get('q') ?? '').trim()
  const sort = String(formData.get('sort') ?? 'break_date').trim() as SortKey
  const dir = String(formData.get('dir') ?? 'desc').trim() as SortDir
  const page = Number(String(formData.get('page') ?? '1'))
  const limit = Number(String(formData.get('limit') ?? String(DEFAULT_LIMIT)))
  const ordersLimit = Number(String(formData.get('orders_limit') ?? String(DEFAULT_LIMIT)))

  const safeSort: SortKey = [
    'break_date',
    'product_name',
    'source_name',
    'order_number',
    'completionStatus',
    'entered',
    'received',
    'remaining',
    'total_cost',
  ].includes(sort)
    ? sort
    : 'break_date'

  const safeDir: SortDir = dir === 'asc' ? 'asc' : 'desc'
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit: PageLimit = LIMIT_OPTIONS.includes(limit as PageLimit)
    ? (limit as PageLimit)
    : DEFAULT_LIMIT
  const safeOrdersLimit: PageLimit = LIMIT_OPTIONS.includes(ordersLimit as PageLimit)
    ? (ordersLimit as PageLimit)
    : DEFAULT_LIMIT

  return {
    q,
    safeSort,
    safeDir,
    safePage,
    safeLimit,
    safeOrdersLimit,
  }
}

function readImportedOrdersFormState(formData: FormData) {
  const q = String(formData.get('q') ?? '').trim()
  const sort = String(formData.get('sort') ?? 'break_date').trim() as SortKey
  const dir = String(formData.get('dir') ?? 'desc').trim() as SortDir
  const page = Number(String(formData.get('page') ?? '1'))
  const limit = Number(String(formData.get('limit') ?? String(DEFAULT_LIMIT)))
  const ordersLimit = Number(String(formData.get('orders_limit') ?? String(DEFAULT_LIMIT)))

  const safeSort: SortKey = [
    'break_date',
    'product_name',
    'source_name',
    'order_number',
    'completionStatus',
    'entered',
    'received',
    'remaining',
    'total_cost',
  ].includes(sort)
    ? sort
    : 'break_date'

  const safeDir: SortDir = dir === 'asc' ? 'asc' : 'desc'
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit: PageLimit = LIMIT_OPTIONS.includes(limit as PageLimit)
    ? (limit as PageLimit)
    : DEFAULT_LIMIT
  const safeOrdersLimit: PageLimit = LIMIT_OPTIONS.includes(ordersLimit as PageLimit)
    ? (ordersLimit as PageLimit)
    : DEFAULT_LIMIT

  return {
    q,
    safeSort,
    safeDir,
    safePage,
    safeLimit,
    safeOrdersLimit,
  }
}

function readPositiveInteger(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(String(value ?? '').trim())
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

function readDateInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return new Date().toISOString().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return new Date().toISOString().slice(0, 10)
}

async function createPurchaseFromImportedOrdersAction(formData: FormData) {
  'use server'

  const orderIds = readFormIds(formData, 'selected_imported_order_ids')
  const purchaseNameRaw = cleanText(String(formData.get('purchase_name') ?? ''))
  const purchaseDate = readDateInput(formData.get('purchase_date'))
  const cardsReceived = readPositiveInteger(formData.get('cards_received'), orderIds.length)
  const notesRaw = cleanText(String(formData.get('purchase_notes') ?? ''))
  const { q, safeSort, safeDir, safePage, safeLimit, safeOrdersLimit } = readImportedOrdersFormState(formData)

  if (orderIds.length === 0) {
    redirect(
      buildImportedOrdersStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'import_error',
        statusValue: 'Select at least one imported order to combine.',
      })
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: selectedOrdersData, error: selectedOrdersError } = await supabase
    .from('whatnot_orders')
    .select(`
      id,
      break_id,
      order_id,
      order_numeric_id,
      seller,
      product_name,
      processed_date,
      processed_date_display,
      subtotal,
      shipping_price,
      taxes,
      total,
      created_at
    `)
    .eq('user_id', user.id)
    .is('break_id', null)
    .in('id', orderIds)

  if (selectedOrdersError) {
    redirect(
      buildImportedOrdersStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'import_error',
        statusValue: selectedOrdersError.message,
      })
    )
  }

  const selectedOrders = (selectedOrdersData ?? []) as ImportedOrderRow[]

  if (selectedOrders.length !== orderIds.length) {
    redirect(
      buildImportedOrdersStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'import_error',
        statusValue: 'One or more selected imported orders were already linked, deleted, or could not be found.',
      })
    )
  }

  const sellers = Array.from(
    new Set(selectedOrders.map((order) => cleanText(order.seller)).filter(Boolean))
  )
  const orderNumbers = selectedOrders
    .map((order) => getImportedOrderNumber(order))
    .filter((value) => value !== '—')
  const totalCost = selectedOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0)
  const sourceName = sellers.length === 1 ? sellers[0] : sellers.length > 1 ? 'Multiple sellers' : 'Imported orders'
  const productName =
    purchaseNameRaw ||
    (selectedOrders.length === 1
      ? getImportedOrderDescription(selectedOrders[0])
      : `${sourceName} combined purchase (${selectedOrders.length} orders)`)
  const orderNumber = orderNumbers.length > 0 ? orderNumbers.join(', ') : null
  const generatedNotes = [
    `Created from ${selectedOrders.length} imported order(s).`,
    orderNumbers.length > 0 ? `Imported order numbers: ${orderNumbers.join(', ')}.` : '',
    notesRaw,
  ]
    .filter(Boolean)
    .join(' ')

  const { data: createdBreak, error: createError } = await supabase
    .from('breaks')
    .insert({
      user_id: user.id,
      break_date: purchaseDate,
      source_name: sourceName,
      order_number: orderNumber,
      product_name: productName,
      format_type: selectedOrders.length > 1 ? 'combined_imported_order' : 'imported_order',
      teams: [],
      total_cost: Number(totalCost.toFixed(2)),
      allocation_method: 'equal_per_item',
      cards_received: cardsReceived,
      notes: generatedNotes,
    })
    .select('id')
    .single()

  if (createError || !createdBreak?.id) {
    redirect(
      buildImportedOrdersStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'import_error',
        statusValue: createError?.message ?? 'Purchase could not be created.',
      })
    )
  }

  const { error: linkError } = await supabase
    .from('whatnot_orders')
    .update({ break_id: createdBreak.id })
    .eq('user_id', user.id)
    .is('break_id', null)
    .in('id', orderIds)

  if (linkError) {
    redirect(
      buildImportedOrdersStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'import_error',
        statusValue: `Purchase was created, but imported orders could not be linked: ${linkError.message}`,
      })
    )
  }

  revalidatePath('/app/breaks')
  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(`/app/breaks/${createdBreak.id}/add-cards`)
}

async function deleteBreakAction(formData: FormData) {
  'use server'

  const breakId = String(formData.get('break_id') ?? '').trim()
  const { q, safeSort, safeDir, safePage, safeLimit, safeOrdersLimit } = readBreakListFormState(formData)

  if (!breakId) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'delete_error',
        statusValue: 'Missing break ID.',
      })
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('breaks')
    .delete()
    .eq('user_id', user.id)
    .eq('id', breakId)

  if (error) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'delete_error',
        statusValue: error.message,
      })
    )
  }

  revalidatePath('/app/breaks')
  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(
    buildBreaksStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      ordersLimit: safeOrdersLimit,
      statusKey: 'deleted_count',
      statusValue: '1 break',
    })
  )
}

async function bulkDeleteBreaksAction(formData: FormData) {
  'use server'

  const breakIds = readFormIds(formData, 'selected_break_ids')
  const { q, safeSort, safeDir, safePage, safeLimit, safeOrdersLimit } = readBreakListFormState(formData)

  if (breakIds.length === 0) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'delete_error',
        statusValue: 'Select at least one break to delete.',
      })
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('breaks')
    .delete()
    .eq('user_id', user.id)
    .in('id', breakIds)

  if (error) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        ordersLimit: safeOrdersLimit,
        statusKey: 'delete_error',
        statusValue: error.message,
      })
    )
  }

  revalidatePath('/app/breaks')
  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(
    buildBreaksStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      ordersLimit: safeOrdersLimit,
      statusKey: 'deleted_count',
      statusValue: `${breakIds.length} break(s)`,
    })
  )
}

function ImportedSortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  qRaw,
  receivedSortKey,
  receivedSortDir,
  page,
  limit,
  ordersLimit,
}: {
  label: string
  sortKey: ImportedOrdersSortKey
  currentSortKey: ImportedOrdersSortKey
  currentSortDir: SortDir
  qRaw: string
  receivedSortKey: SortKey
  receivedSortDir: SortDir
  page: number
  limit: number
  ordersLimit: number
}) {
  return (
    <Link
      href={buildImportedOrdersSortHref({
        q: qRaw,
        sort: receivedSortKey,
        dir: receivedSortDir,
        page,
        limit,
        ordersLimit,
        ordersSort: sortKey,
        ordersDir: getNextImportedSortDir(currentSortKey, currentSortDir, sortKey),
      })}
      className="inline-flex items-center gap-1 hover:text-zinc-100"
    >
      <span>{label}</span>
      <span className="text-[10px]">{getImportedSortIndicator(currentSortKey, currentSortDir, sortKey)}</span>
    </Link>
  )
}

function SortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  qRaw,
  limit,
  ordersLimit,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  currentSortDir: SortDir
  qRaw: string
  limit: number
  ordersLimit: number
}) {
  const params = new URLSearchParams()

  if (qRaw) params.set('q', qRaw)
  params.set('sort', sortKey)
  params.set('dir', getNextSortDir(currentSortKey, currentSortDir, sortKey))
  params.set('page', '1')
  params.set('limit', String(limit))
  params.set('orders_limit', String(ordersLimit))

  return (
    <Link
      href={`/app/breaks?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:text-zinc-100"
    >
      <span>{label}</span>
      <span className="text-[10px]">{getSortIndicator(currentSortKey, currentSortDir, sortKey)}</span>
    </Link>
  )
}

function SummaryCard({
  label,
  value,
  href,
  active = false,
}: {
  label: string
  value: string | number
  href: string
  active?: boolean
}) {
  return (
    <Link
      href={href}
      className={`app-card-tight block p-2.5 transition hover:border-sky-700 hover:bg-sky-950/20 ${
        active ? 'border-sky-700 bg-sky-950/20' : ''
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-base font-semibold leading-tight">{value}</div>
    </Link>
  )
}

function BulkImportedOrdersControl({
  formId,
  importedOrderCount,
  defaultPurchaseDate,
}: {
  formId: string
  importedOrderCount: number
  defaultPurchaseDate: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        id={IMPORTED_SELECTION_COUNT_ID}
        data-imported-selected-count="true"
        data-imported-page-count={importedOrderCount}
        className="inline-flex w-fit rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400"
      >
        0 of {importedOrderCount} selected
      </div>

      <button
        type="button"
        data-imported-select-page="true"
        className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
      >
        Select all on page
      </button>

      <button
        type="button"
        data-imported-clear-selection="true"
        className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
      >
        Clear selection
      </button>

      <div
        id={IMPORTED_PENDING_STATE_ID}
        data-imported-pending-state="true"
        className="hidden w-fit rounded-full border border-sky-900/60 bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-200"
        aria-live="polite"
      >
        Creating purchase…
      </div>

      <details className="group relative">
        <summary
          data-imported-action-toggle="true"
          className="app-button-primary cursor-pointer list-none whitespace-nowrap px-2.5 py-1 text-xs"
        >
          Combine Selected
        </summary>

        <div className="absolute right-0 z-50 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-xl">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-zinc-100">Create purchase from selected imports</div>
            <div className="text-xs leading-relaxed text-zinc-400">
              This creates the normal purchase record first, then links the selected imported orders to it. Cost basis stays on the purchase record before item entry.
            </div>
            <div
              data-imported-panel-summary="true"
              className="mt-1 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-300"
            >
              Select imported orders to preview the combined total.
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-400">
              Purchase name
              <input
                form={formId}
                name="purchase_name"
                placeholder="Example: Seller name combined order"
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-400">
              Purchase date
              <input
                form={formId}
                type="date"
                name="purchase_date"
                defaultValue={defaultPurchaseDate}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-400">
              Items/cards expected
              <input
                form={formId}
                type="number"
                min="0"
                step="1"
                name="cards_received"
                placeholder="How many items will you enter?"
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-400 md:col-span-2">
              Notes
              <textarea
                form={formId}
                name="purchase_notes"
                rows={2}
                placeholder="Optional note, such as stream name, shipment, or grouping reason."
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              form={formId}
              data-imported-submit="true"
              className="app-button-primary whitespace-nowrap"
            >
              Save Purchase + Enter Items
            </button>
            <CancelDetailsButton />
          </div>
        </div>
      </details>
    </div>
  )
}

function ImportedOrderSelectionScript({ formId }: { formId: string }) {
  const script = `
    (() => {
      const formId = ${JSON.stringify('${FORM_ID_PLACEHOLDER}')};
      const fieldName = 'selected_imported_order_ids';
      const storageKey = 'card_business_os_imported_orders_bulk_selection_v1';
      let isSubmitting = false;

      const form = () => document.getElementById(formId);
      const countNodes = () => Array.from(document.querySelectorAll('[data-imported-selected-count="true"]'));
      const pendingNodes = () => Array.from(document.querySelectorAll('[data-imported-pending-state="true"]'));
      const panelSummaryNodes = () => Array.from(document.querySelectorAll('[data-imported-panel-summary="true"]'));
      const rowCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-imported-row-checkbox="true"]'));
      const allSelectionCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"]'));
      const pageToggleCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][data-imported-page-checkbox="true"][form="' + formId + '"]'));
      const toggles = () => Array.from(document.querySelectorAll('[data-imported-action-toggle="true"]'));
      const submitButtons = () => Array.from(document.querySelectorAll('[data-imported-submit="true"]'));
      const selectPageButtons = () => Array.from(document.querySelectorAll('[data-imported-select-page="true"]'));
      const clearButtons = () => Array.from(document.querySelectorAll('[data-imported-clear-selection="true"]'));

      function loadStoredSelection() {
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(parsed)) return new Set();
          return new Set(parsed.map((value) => String(value || '').trim()).filter(Boolean));
        } catch (_error) {
          return new Set();
        }
      }

      function saveStoredSelection(selection) {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(selection)));
        } catch (_error) {}
      }

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('import_error')) {
        try { window.sessionStorage.removeItem(storageKey); } catch (_error) {}
      }

      let selectedIdsSet = loadStoredSelection();

      function setDisabled(node, disabled) {
        node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        node.classList.toggle('pointer-events-none', disabled);
        node.classList.toggle('opacity-50', disabled);
        if ('disabled' in node) node.disabled = disabled;
      }

      function pageIds() {
        return rowCheckboxes().map((checkbox) => checkbox.value).filter(Boolean);
      }

      function selectedIds() {
        return Array.from(selectedIdsSet);
      }

      function formatMoney(value) {
        const number = Number(value || 0);
        try {
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number);
        } catch (_error) {
          return '$' + number.toFixed(2);
        }
      }

      function selectedTotal() {
        return rowCheckboxes().reduce((sum, checkbox) => {
          if (!selectedIdsSet.has(checkbox.value)) return sum;
          return sum + Number(checkbox.getAttribute('data-imported-order-total') || 0);
        }, 0);
      }

      function syncStoredInputs() {
        const bulkForm = form();
        if (!bulkForm) return;
        bulkForm.querySelectorAll('input[data-imported-persisted-selection="true"]').forEach((input) => input.remove());
        selectedIds().forEach((id) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = fieldName;
          input.value = id;
          input.setAttribute('data-imported-persisted-selection', 'true');
          bulkForm.appendChild(input);
        });
      }

      function syncPageCheckboxesFromStoredSelection() {
        rowCheckboxes().forEach((checkbox) => {
          checkbox.checked = selectedIdsSet.has(checkbox.value);
        });
      }

      function updateImportedState() {
        syncPageCheckboxesFromStoredSelection();
        syncStoredInputs();
        const currentPageIds = pageIds();
        const totalOnPage = currentPageIds.length;
        const selectedOnPage = currentPageIds.filter((id) => selectedIdsSet.has(id)).length;
        const count = selectedIdsSet.size;
        const hasSelection = count > 0;
        const allPageSelected = totalOnPage > 0 && selectedOnPage === totalOnPage;
        const total = selectedTotal();

        countNodes().forEach((node) => {
          node.textContent = count + ' selected' + (totalOnPage > 0 ? ' • ' + selectedOnPage + ' of ' + totalOnPage + ' on this page' : '');
          node.classList.toggle('text-zinc-400', !hasSelection);
          node.classList.toggle('text-zinc-100', hasSelection);
          node.classList.toggle('border-zinc-800', !hasSelection);
          node.classList.toggle('border-emerald-900/60', hasSelection);
          node.classList.toggle('bg-zinc-950', !hasSelection);
          node.classList.toggle('bg-emerald-950/20', hasSelection);
        });
        panelSummaryNodes().forEach((node) => {
          node.textContent = hasSelection
            ? count + ' imported order(s) selected • combined total ' + formatMoney(total)
            : 'Select imported orders to preview the combined total.';
        });
        rowCheckboxes().forEach((checkbox) => {
          const row = checkbox.closest('[data-imported-order-row-id]');
          if (row) row.classList.toggle('bg-zinc-900/40', selectedIdsSet.has(checkbox.value) && !isSubmitting);
        });
        pageToggleCheckboxes().forEach((checkbox) => {
          checkbox.checked = allPageSelected;
          checkbox.indeterminate = selectedOnPage > 0 && !allPageSelected;
          checkbox.setAttribute('aria-checked', checkbox.indeterminate ? 'mixed' : String(allPageSelected));
          setDisabled(checkbox, totalOnPage === 0 || isSubmitting);
        });
        toggles().forEach((node) => setDisabled(node, !hasSelection || isSubmitting));
        submitButtons().forEach((node) => setDisabled(node, !hasSelection || isSubmitting));
        selectPageButtons().forEach((node) => {
          setDisabled(node, totalOnPage === 0 || allPageSelected || isSubmitting);
          node.textContent = allPageSelected ? 'All rows on this page selected' : 'Select all on page';
        });
        clearButtons().forEach((node) => setDisabled(node, !hasSelection || isSubmitting));
      }

      function applySubmittingState() {
        isSubmitting = true;
        const count = selectedIdsSet.size;
        pendingNodes().forEach((node) => {
          node.textContent = 'Creating purchase from ' + count + ' imported order(s)…';
          node.classList.remove('hidden');
        });
        selectedIds().forEach((id) => {
          const row = document.querySelector('[data-imported-order-row-id="' + CSS.escape(id) + '"]');
          if (!row) return;
          row.classList.add('transition', 'duration-150', 'opacity-40');
          row.style.filter = 'grayscale(1)';
        });
        window.setTimeout(() => updateImportedState(), 0);
      }

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (target && target.matches && target.matches('input[type="checkbox"][data-imported-page-checkbox="true"][form="' + formId + '"]')) {
          const shouldSelectPage = Boolean(target.checked);
          pageIds().forEach((id) => { if (shouldSelectPage) selectedIdsSet.add(id); else selectedIdsSet.delete(id); });
          saveStoredSelection(selectedIdsSet);
          updateImportedState();
          return;
        }
        if (target && target.matches && target.matches('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-imported-row-checkbox="true"]')) {
          const id = String(target.value || '').trim();
          if (id && target.checked) selectedIdsSet.add(id);
          if (id && !target.checked) selectedIdsSet.delete(id);
          saveStoredSelection(selectedIdsSet);
          updateImportedState();
          return;
        }
      }, true);

      document.addEventListener('click', (event) => {
        const toggle = event.target && event.target.closest ? event.target.closest('[data-imported-action-toggle="true"]') : null;
        if (toggle && (selectedIdsSet.size === 0 || isSubmitting)) {
          event.preventDefault();
          updateImportedState();
          return;
        }
        const selectPageButton = event.target && event.target.closest ? event.target.closest('[data-imported-select-page="true"]') : null;
        if (selectPageButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isSubmitting) return;
          pageIds().forEach((id) => selectedIdsSet.add(id));
          saveStoredSelection(selectedIdsSet);
          updateImportedState();
          return;
        }
        const clearButton = event.target && event.target.closest ? event.target.closest('[data-imported-clear-selection="true"]') : null;
        if (clearButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isSubmitting) return;
          selectedIdsSet = new Set();
          saveStoredSelection(selectedIdsSet);
          allSelectionCheckboxes().forEach((checkbox) => { checkbox.checked = false; checkbox.indeterminate = false; });
          updateImportedState();
          return;
        }
        const submitButton = event.target && event.target.closest ? event.target.closest('[data-imported-submit="true"]') : null;
        if (submitButton) {
          if (selectedIdsSet.size === 0 || isSubmitting) {
            event.preventDefault();
            updateImportedState();
            return;
          }
          syncStoredInputs();
          applySubmittingState();
        }
      }, true);

      document.addEventListener('submit', (event) => {
        if (event.target && event.target.id === formId) syncStoredInputs();
      });

      syncPageCheckboxesFromStoredSelection();
      syncStoredInputs();
      updateImportedState();
    })();
  `.replace('${FORM_ID_PLACEHOLDER}', formId)

  return <Script id="imported-orders-selection-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
}

function BulkDeleteConfirmControl({ formId, pageBreakCount }: { formId: string; pageBreakCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        id={BULK_SELECTION_COUNT_ID}
        data-bulk-selected-count="true"
        data-bulk-page-count={pageBreakCount}
        className="inline-flex w-fit rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400"
      >
        0 of {pageBreakCount} selected
      </div>

      <button
        type="button"
        data-bulk-select-page="true"
        className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
      >
        Select all on page
      </button>

      <button
        type="button"
        data-bulk-clear-selection="true"
        className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
      >
        Clear selection
      </button>

      <div
        id={BULK_PENDING_STATE_ID}
        data-bulk-pending-state="true"
        className="hidden w-fit rounded-full border border-sky-900/60 bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-200"
        aria-live="polite"
      >
        Deleting selected breaks…
      </div>

      <details className="group relative">
        <summary
          data-bulk-action-toggle="true"
          className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/40"
        >
          Delete Selected
        </summary>

        <div className="absolute right-0 z-50 mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
          <div className="text-sm font-semibold text-red-200">Confirm bulk delete?</div>
          <div className="mt-1 text-xs leading-relaxed text-zinc-400">
            This will delete the selected breaks. This cannot be undone from this screen.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              form={formId}
              data-bulk-submit="true"
              data-bulk-delete="true"
              data-bulk-label="Delete Selected"
              className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
            >
              Yes, Delete Selected
            </button>

            <CancelDetailsButton />
          </div>
        </div>
      </details>
    </div>
  )
}

function BulkSelectionScript({ formId }: { formId: string }) {
  const script = `
    (() => {
      const formId = ${JSON.stringify('${FORM_ID_PLACEHOLDER}')};
      const fieldName = 'selected_break_ids';
      const storageKey = 'card_business_os_breaks_bulk_selection_v1';
      let isBulkSubmitting = false;

      const form = () => document.getElementById(formId);
      const countNodes = () => Array.from(document.querySelectorAll('[data-bulk-selected-count="true"]'));
      const pendingNodes = () => Array.from(document.querySelectorAll('[data-bulk-pending-state="true"]'));
      const rowCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-break-bulk-row-checkbox="true"]'));
      const allSelectionCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"]'));
      const pageToggleCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]'));
      const toggles = () => Array.from(document.querySelectorAll('[data-bulk-action-toggle="true"]'));
      const submitButtons = () => Array.from(document.querySelectorAll('[data-bulk-submit="true"]'));
      const selectPageButtons = () => Array.from(document.querySelectorAll('[data-bulk-select-page="true"]'));
      const clearButtons = () => Array.from(document.querySelectorAll('[data-bulk-clear-selection="true"]'));

      function loadStoredSelection() {
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(parsed)) return new Set();
          return new Set(parsed.map((value) => String(value || '').trim()).filter(Boolean));
        } catch (_error) {
          return new Set();
        }
      }

      function saveStoredSelection(selection) {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(selection)));
        } catch (_error) {}
      }

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('deleted_count')) {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch (_error) {}
      }

      let selectedIdsSet = loadStoredSelection();

      function setDisabled(node, disabled) {
        node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        node.classList.toggle('pointer-events-none', disabled);
        node.classList.toggle('opacity-50', disabled);
        if ('disabled' in node) node.disabled = disabled;
      }

      function pageIds() {
        return rowCheckboxes().map((checkbox) => checkbox.value).filter(Boolean);
      }

      function selectedCount() {
        return selectedIdsSet.size;
      }

      function selectedIds() {
        return Array.from(selectedIdsSet);
      }

      function syncStoredInputs() {
        const bulkForm = form();
        if (!bulkForm) return;
        bulkForm.querySelectorAll('input[data-bulk-persisted-selection="true"]').forEach((input) => input.remove());
        selectedIds().forEach((id) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = fieldName;
          input.value = id;
          input.setAttribute('data-bulk-persisted-selection', 'true');
          bulkForm.appendChild(input);
        });
      }

      function syncPageCheckboxesFromStoredSelection() {
        rowCheckboxes().forEach((checkbox) => {
          checkbox.checked = selectedIdsSet.has(checkbox.value);
        });
      }

      function syncStoredSelectionFromPageCheckbox(checkbox) {
        const id = String(checkbox.value || '').trim();
        if (!id) return;
        if (checkbox.checked) selectedIdsSet.add(id);
        else selectedIdsSet.delete(id);
        saveStoredSelection(selectedIdsSet);
        syncStoredInputs();
      }

      function updateBulkState() {
        syncPageCheckboxesFromStoredSelection();
        syncStoredInputs();
        const currentPageIds = pageIds();
        const totalOnPage = currentPageIds.length;
        const selectedOnPage = currentPageIds.filter((id) => selectedIdsSet.has(id)).length;
        const count = selectedCount();
        const hasSelection = count > 0;
        const allPageSelected = totalOnPage > 0 && selectedOnPage === totalOnPage;
        countNodes().forEach((node) => {
          node.textContent = count + ' selected' + (totalOnPage > 0 ? ' • ' + selectedOnPage + ' of ' + totalOnPage + ' on this page' : '');
          node.classList.toggle('text-zinc-400', !hasSelection);
          node.classList.toggle('text-zinc-100', hasSelection);
          node.classList.toggle('border-zinc-800', !hasSelection);
          node.classList.toggle('border-emerald-900/60', hasSelection);
          node.classList.toggle('bg-zinc-950', !hasSelection);
          node.classList.toggle('bg-emerald-950/20', hasSelection);
        });
        rowCheckboxes().forEach((checkbox) => {
          const row = checkbox.closest('[data-break-row-id]');
          if (row) row.classList.toggle('bg-zinc-900/40', selectedIdsSet.has(checkbox.value) && !isBulkSubmitting);
        });
        pageToggleCheckboxes().forEach((checkbox) => {
          checkbox.checked = allPageSelected;
          checkbox.indeterminate = selectedOnPage > 0 && !allPageSelected;
          checkbox.setAttribute('aria-checked', checkbox.indeterminate ? 'mixed' : String(allPageSelected));
          setDisabled(checkbox, totalOnPage === 0 || isBulkSubmitting);
        });
        toggles().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
        submitButtons().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
        selectPageButtons().forEach((node) => {
          setDisabled(node, totalOnPage === 0 || allPageSelected || isBulkSubmitting);
          node.textContent = allPageSelected ? 'All rows on this page selected' : 'Select all on page';
        });
        clearButtons().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
      }

      function closeOpenConfirmations() {
        document.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
      }

      function showPendingMessage(message) {
        pendingNodes().forEach((node) => {
          node.textContent = message;
          node.classList.remove('hidden');
        });
      }

      function applyInstantDeleteState(ids) {
        ids.forEach((id) => {
          const row = document.querySelector('[data-break-row-id="' + CSS.escape(id) + '"]');
          if (!row) return;
          row.classList.add('transition', 'duration-150', 'opacity-40');
          row.style.filter = 'grayscale(1)';
          row.querySelectorAll('a, button, input').forEach((node) => setDisabled(node, true));
          const titleNode = row.querySelector('[data-break-primary-title="true"]');
          if (titleNode && !titleNode.querySelector('[data-bulk-row-pending="true"]')) {
            const badge = document.createElement('span');
            badge.setAttribute('data-bulk-row-pending', 'true');
            badge.className = 'ml-2 inline-flex rounded-full border border-red-900/60 bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-200';
            badge.textContent = 'Deleting…';
            titleNode.appendChild(badge);
          }
        });
      }

      function setSubmitting(button) {
        isBulkSubmitting = true;
        const count = selectedCount();
        const ids = selectedIds();
        const label = button.getAttribute('data-bulk-label') || 'Delete Selected';
        button.setAttribute('data-original-label', button.textContent || label);
        button.textContent = 'Deleting…';
        showPendingMessage('Deleting ' + count + ' selected break(s)…');
        closeOpenConfirmations();
        applyInstantDeleteState(ids);
        window.setTimeout(() => updateBulkState(), 0);
      }

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (target && target.matches && target.matches('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]')) {
          const shouldSelectPage = Boolean(target.checked);
          pageIds().forEach((id) => { if (shouldSelectPage) selectedIdsSet.add(id); else selectedIdsSet.delete(id); });
          saveStoredSelection(selectedIdsSet);
          syncStoredInputs();
          updateBulkState();
          return;
        }
        if (target && target.matches && target.matches('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-break-bulk-row-checkbox="true"]')) {
          syncStoredSelectionFromPageCheckbox(target);
          updateBulkState();
          return;
        }
      }, true);

      document.addEventListener('click', (event) => {
        const toggle = event.target && event.target.closest ? event.target.closest('[data-bulk-action-toggle="true"]') : null;
        if (toggle && (selectedCount() === 0 || isBulkSubmitting)) {
          event.preventDefault();
          updateBulkState();
          return;
        }
        const selectPageButton = event.target && event.target.closest ? event.target.closest('[data-bulk-select-page="true"]') : null;
        if (selectPageButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isBulkSubmitting) return;
          pageIds().forEach((id) => selectedIdsSet.add(id));
          saveStoredSelection(selectedIdsSet);
          updateBulkState();
          return;
        }
        const clearButton = event.target && event.target.closest ? event.target.closest('[data-bulk-clear-selection="true"]') : null;
        if (clearButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isBulkSubmitting) return;
          selectedIdsSet = new Set();
          saveStoredSelection(selectedIdsSet);
          allSelectionCheckboxes().forEach((checkbox) => { checkbox.checked = false; checkbox.indeterminate = false; });
          syncStoredInputs();
          updateBulkState();
          return;
        }
        const submitButton = event.target && event.target.closest ? event.target.closest('[data-bulk-submit="true"]') : null;
        if (submitButton) {
          if (selectedCount() === 0 || isBulkSubmitting) {
            event.preventDefault();
            updateBulkState();
            return;
          }
          syncStoredInputs();
          setSubmitting(submitButton);
        }
      }, true);

      document.addEventListener('submit', (event) => {
        if (event.target && event.target.id === formId) syncStoredInputs();
      });

      syncPageCheckboxesFromStoredSelection();
      syncStoredInputs();
      updateBulkState();
    })();
  `.replace('${FORM_ID_PLACEHOLDER}', formId)

  return <Script id="breaks-bulk-selection-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
}

function DeleteBreakConfirmControl({
  breakId,
  breakLabel,
  qRaw,
  sortKey,
  sortDir,
  page,
  limit,
  ordersLimit,
}: {
  breakId: string
  breakLabel: string
  qRaw: string
  sortKey: SortKey
  sortDir: SortDir
  page: number
  limit: PageLimit
  ordersLimit: PageLimit
}) {
  return (
    <details className="group relative">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete
      </summary>

      <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
        <div className="text-sm font-semibold text-red-200">Confirm delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete this break: <span className="text-zinc-200">{breakLabel}</span>
        </div>

        <form action={deleteBreakAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="break_id" value={breakId} />
          <input type="hidden" name="q" value={qRaw} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="orders_limit" value={ordersLimit} />

          <button
            type="submit"
            className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
          >
            Yes, Delete
          </button>

          <CancelDetailsButton />
        </form>
      </div>
    </details>
  )
}

function renderStatusPill(status: BreakViewRow['completionStatus']) {
  if (status === 'Complete') {
    return <span className="app-badge app-badge-success">Complete</span>
  }

  if (status === 'In Progress') {
    return <span className="app-badge app-badge-info">In Progress</span>
  }

  if (status === 'Reversed') {
    return <span className="app-badge app-badge-warning">Reversed</span>
  }

  return <span className="app-badge app-badge-warning">Open</span>
}

export default async function BreaksPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    sort?: string
    dir?: string
    page?: string
    limit?: string
    orders_limit?: string
    orders_sort?: string
    orders_dir?: string
    deleted_count?: string
    delete_error?: string
    import_error?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim().toLowerCase()
  const deletedCount = String(params?.deleted_count ?? '').trim()
  const deleteError = String(params?.delete_error ?? '').trim()
  const importError = String(params?.import_error ?? '').trim()

  const requestedPage = Number(String(params?.page ?? '1'))
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1

  const requestedLimit = Number(String(params?.limit ?? String(DEFAULT_LIMIT)))
  const limit: PageLimit = LIMIT_OPTIONS.includes(requestedLimit as PageLimit)
    ? (requestedLimit as PageLimit)
    : DEFAULT_LIMIT

  const requestedOrdersLimit = Number(String(params?.orders_limit ?? String(DEFAULT_LIMIT)))
  const ordersLimit: PageLimit = LIMIT_OPTIONS.includes(requestedOrdersLimit as PageLimit)
    ? (requestedOrdersLimit as PageLimit)
    : DEFAULT_LIMIT

  const requestedOrdersSort = String(params?.orders_sort ?? 'created_at').trim() as ImportedOrdersSortKey
  const ordersSortKey: ImportedOrdersSortKey = [
    'order_number',
    'created_at',
    'processed_date',
    'seller',
    'product_name',
    'order_status',
    'total',
  ].includes(requestedOrdersSort)
    ? requestedOrdersSort
    : 'created_at'
  const requestedOrdersDir = String(params?.orders_dir ?? 'desc').trim() as SortDir
  const ordersSortDir: SortDir = requestedOrdersDir === 'asc' ? 'asc' : 'desc'

  const requestedSort = String(params?.sort ?? 'break_date').trim() as SortKey
  const requestedDir = String(params?.dir ?? 'desc').trim() as SortDir

  const sortKey: SortKey = [
    'break_date',
    'product_name',
    'source_name',
    'order_number',
    'completionStatus',
    'entered',
    'received',
    'remaining',
    'total_cost',
  ].includes(requestedSort)
    ? requestedSort
    : 'break_date'

  const sortDir: SortDir = requestedDir === 'asc' ? 'asc' : 'desc'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const from = (page - 1) * limit
  const to = from + limit - 1

  const dbSortKey =
    sortKey === 'completionStatus'
      ? 'completion_status'
      : sortKey === 'entered'
        ? 'entered_count'
        : sortKey === 'received'
          ? 'cards_received'
          : sortKey === 'remaining'
            ? 'remaining_count'
            : sortKey

  let breaksQuery = supabase
    .from('breaks')
    .select(`
      id,
      break_date,
      source_name,
      order_number,
      product_name,
      format_type,
      teams,
      total_cost,
      allocation_method,
      notes,
      reversed_at,
      cards_received,
      entered_count,
      remaining_count,
      completion_status
    `)
    .eq('user_id', user.id)

  if (qRaw === 'active') {
    breaksQuery = breaksQuery.is('reversed_at', null)
  } else if (qRaw === 'open') {
    breaksQuery = breaksQuery
      .is('reversed_at', null)
      .in('completion_status', ['Open', 'In Progress'])
  }

  const [
    breaksResponse,
    allOrdersCountResponse,
    activeOrdersCountResponse,
    openOrdersCountResponse,
    importedOrdersResponse,
  ] = await Promise.all([
    breaksQuery
      .order(dbSortKey, { ascending: sortDir === 'asc', nullsFirst: false })
      .range(from, to),

    supabase
      .from('breaks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),

    supabase
      .from('breaks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('reversed_at', null),

    supabase
      .from('breaks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('reversed_at', null)
      .in('completion_status', ['Open', 'In Progress']),

    supabase
      .from('whatnot_orders')
      .select(`
        id,
        break_id,
        order_id,
        order_numeric_id,
        buyer,
        seller,
        product_name,
        processed_date,
        processed_date_display,
        order_status,
        quantity,
        subtotal,
        shipping_price,
        taxes,
        total,
        source_file_name,
        created_at
      `)
      .eq('user_id', user.id)
      .is('break_id', null)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(ordersLimit),
  ])

  const pageBreakRows = (breaksResponse.data ?? []) as BreakRow[]
  const importedOrders = sortImportedOrders(
    (importedOrdersResponse.data ?? []) as ImportedOrderRow[],
    ordersSortKey,
    ordersSortDir
  )
  const error =
    breaksResponse.error ||
    allOrdersCountResponse.error ||
    activeOrdersCountResponse.error ||
    openOrdersCountResponse.error
  const importedOrdersError = importedOrdersResponse.error

  const breaks: BreakViewRow[] = pageBreakRows.map((item) => {
    const received = Number(item.cards_received ?? 0)
    const entered = Number(item.entered_count ?? 0)
    const remaining = Number(item.remaining_count ?? Math.max(0, received - entered))
    const cachedStatus = String(item.completion_status ?? '').trim()
    const completionStatus =
      cachedStatus === 'Open' ||
      cachedStatus === 'In Progress' ||
      cachedStatus === 'Complete' ||
      cachedStatus === 'Reversed'
        ? cachedStatus
        : getCompletionStatus(received, entered, item.reversed_at)

    return {
      ...item,
      received,
      entered,
      remaining,
      completionStatus,
    }
  })

  const allOrdersCount = Number(allOrdersCountResponse.count ?? 0)
  const activeCount = Number(activeOrdersCountResponse.count ?? 0)
  const openCount = Number(openOrdersCountResponse.count ?? 0)

  const hasPreviousPage = page > 1
  const hasNextPage = breaks.length === limit

  const pageTitle =
    qRaw === 'active'
      ? 'Orders — Active'
      : qRaw === 'open'
        ? 'Orders — Open'
        : 'Orders'

  const pageDescription =
    qRaw === 'active'
      ? 'Showing active orders that have not been reversed.'
      : qRaw === 'open'
        ? 'Showing orders that still need item entry.'
        : 'View and manage your recorded orders.'

  const defaultPurchaseDate = new Date().toISOString().slice(0, 10)

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">{pageTitle}</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <Link href="/app/breaks/new" className="app-button-primary">
          Add Order
        </Link>
      </div>

      <div id="breaks-status" className="scroll-mt-28 space-y-3">
        {deletedCount ? (
          <div className="app-alert-success">
            Deleted {deletedCount} successfully.
          </div>
        ) : null}

        {deleteError ? (
          <div className="app-alert-error">
            Delete failed: {deleteError}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          label="All Orders"
          value={allOrdersCount}
          href={getFilterHref('', sortKey, sortDir, limit, ordersLimit)}
          active={qRaw === ''}
        />
        <SummaryCard
          label="Active"
          value={activeCount}
          href={getFilterHref('active', sortKey, sortDir, limit, ordersLimit)}
          active={qRaw === 'active'}
        />
        <SummaryCard
          label="Open"
          value={openCount}
          href={getFilterHref('open', sortKey, sortDir, limit, ordersLimit)}
          active={qRaw === 'open'}
        />
      </div>

      {error ? (
        <div className="app-alert-error">
          Error loading orders: {error.message}
        </div>
      ) : null}

      <div id="imported-orders-status" className="scroll-mt-28 space-y-3">
        {importError ? (
          <div className="app-alert-error">
            Import combine failed: {importError}
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <details open className="app-section group">
        <summary className="cursor-pointer list-none rounded-2xl outline-none">
          <div className="grid min-h-[3.25rem] grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">Orders</h2>
              <p className="mt-0.5 truncate whitespace-nowrap text-sm text-zinc-400">
                Paid For Not Entered
              </p>
            </div>

            <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 overflow-x-auto">
              <Link href="/app/imports/whatnot" className="app-button shrink-0 whitespace-nowrap">
                Import More
              </Link>
              <span className="app-chip app-chip-idle shrink-0 whitespace-nowrap">
                {importedOrders.length} imported shown
              </span>
              <div className="flex shrink-0 flex-nowrap items-center gap-1">
                {LIMIT_OPTIONS.map((option) => (
                  <Link
                    key={option}
                    href={buildOrdersLimitHref({
                      q: qRaw,
                      sort: sortKey,
                      dir: sortDir,
                      page,
                      limit,
                      ordersLimit: option,
                    })}
                    className={`app-chip ${ordersLimit === option ? 'app-chip-active' : 'app-chip-idle'}`}
                  >
                    {option}
                  </Link>
                ))}
              </div>
              <span className="app-button shrink-0 whitespace-nowrap">
                Collapse / Expand
              </span>
            </div>
          </div>
        </summary>

        {importedOrdersError ? (
          <div className="app-alert-error mt-3">
            Imported order load error: {importedOrdersError.message}
          </div>
        ) : null}

        <form id={IMPORTED_ORDERS_FORM_ID} action={createPurchaseFromImportedOrdersAction} className="hidden">
          <input type="hidden" name="q" value={qRaw} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="orders_limit" value={ordersLimit} />
        </form>
        <ImportedOrderSelectionScript formId={IMPORTED_ORDERS_FORM_ID} />

        {importedOrders.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <BulkImportedOrdersControl
              formId={IMPORTED_ORDERS_FORM_ID}
              importedOrderCount={importedOrders.length}
              defaultPurchaseDate={defaultPurchaseDate}
            />
          </div>
        ) : null}

        {importedOrders.length === 0 ? (
          <div className="app-empty mt-4">
            No imported orders need review.
          </div>
        ) : (
          <div className="mt-3 app-table-wrap xl:max-h-[calc(100vh-28rem)] xl:overflow-y-auto">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th w-12">
                      <input
                        form={IMPORTED_ORDERS_FORM_ID}
                        type="checkbox"
                        aria-label="Select all imported orders on this page"
                        data-imported-page-checkbox="true"
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                      />
                    </th>
                    <th className="app-th whitespace-nowrap">
                      <ImportedSortHeader
                        label="Date"
                        sortKey="created_at"
                        currentSortKey={ordersSortKey}
                        currentSortDir={ordersSortDir}
                        qRaw={qRaw}
                        receivedSortKey={sortKey}
                        receivedSortDir={sortDir}
                        page={page}
                        limit={limit}
                        ordersLimit={ordersLimit}
                      />
                    </th>
                    <th className="app-th whitespace-nowrap">
                      <ImportedSortHeader
                        label="Order #"
                        sortKey="order_number"
                        currentSortKey={ordersSortKey}
                        currentSortDir={ordersSortDir}
                        qRaw={qRaw}
                        receivedSortKey={sortKey}
                        receivedSortDir={sortDir}
                        page={page}
                        limit={limit}
                        ordersLimit={ordersLimit}
                      />
                    </th>
                    <th className="app-th whitespace-nowrap">
                      <ImportedSortHeader
                        label="Source"
                        sortKey="seller"
                        currentSortKey={ordersSortKey}
                        currentSortDir={ordersSortDir}
                        qRaw={qRaw}
                        receivedSortKey={sortKey}
                        receivedSortDir={sortDir}
                        page={page}
                        limit={limit}
                        ordersLimit={ordersLimit}
                      />
                    </th>
                    <th className="app-th min-w-[180px]">
                      <ImportedSortHeader
                        label="Purchase"
                        sortKey="product_name"
                        currentSortKey={ordersSortKey}
                        currentSortDir={ordersSortDir}
                        qRaw={qRaw}
                        receivedSortKey={sortKey}
                        receivedSortDir={sortDir}
                        page={page}
                        limit={limit}
                        ordersLimit={ordersLimit}
                      />
                    </th>
                    <th className="app-th whitespace-nowrap">
                      <ImportedSortHeader
                        label="Status"
                        sortKey="order_status"
                        currentSortKey={ordersSortKey}
                        currentSortDir={ordersSortDir}
                        qRaw={qRaw}
                        receivedSortKey={sortKey}
                        receivedSortDir={sortDir}
                        page={page}
                        limit={limit}
                        ordersLimit={ordersLimit}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {importedOrders.map((order) => {
                    const orderNumber = getImportedOrderNumber(order)
                    const importedDate = formatDate(order.created_at)
                    const seller = cleanText(order.seller || 'Unknown Seller')
                    const description = getImportedOrderDescription(order)
                    const orderStatus = cleanText(order.order_status || 'Open')
                    const orderHref = buildImportedOrderFocusHref(order)

                    return (
                      <tr key={order.id} data-imported-order-row-id={order.id} className="app-tr align-top">
                        <td className="app-td">
                          <input
                            form={IMPORTED_ORDERS_FORM_ID}
                            type="checkbox"
                            name="selected_imported_order_ids"
                            value={order.id}
                            aria-label={`Select imported order ${orderNumber}`}
                            data-imported-row-checkbox="true"
                            data-imported-order-total={Number(order.total ?? 0)}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                          />
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <Link href={orderHref} className="block text-zinc-100 hover:text-white hover:underline">
                            {importedDate}
                          </Link>
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <Link href={orderHref} className="block font-medium text-zinc-100 hover:text-white hover:underline">
                            {orderNumber}
                          </Link>
                        </td>
                        <td className="app-td">
                          <Link href={orderHref} className="block max-w-32 break-words text-zinc-100 hover:text-white hover:underline" title={seller}>
                            {seller}
                          </Link>
                        </td>
                        <td className="app-td">
                          <Link
                            href={orderHref}
                            className="block max-w-[340px] break-words text-zinc-100 hover:text-white hover:underline"
                            title={description}
                          >
                            {description}
                          </Link>
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <Link href={orderHref} className="block">
                            <span className="app-badge app-badge-warning">{orderStatus}</span>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      <div className="app-section">
        <div className="grid min-h-[3.25rem] grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">Orders Received</h2>
            <p className="mt-0.5 truncate whitespace-nowrap text-sm text-zinc-400">
              Received And Entered Into Inventory
            </p>
          </div>

          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 overflow-x-auto">
            <div className="shrink-0 whitespace-nowrap text-xs text-zinc-500">Page {page} • {breaks.length} shown</div>
            <div className="flex shrink-0 flex-nowrap items-center gap-1">
              {LIMIT_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={buildReceivedLimitHref({
                    q: qRaw,
                    sort: sortKey,
                    dir: sortDir,
                    limit: option,
                    ordersLimit,
                  })}
                  className={`app-chip ${limit === option ? 'app-chip-active' : 'app-chip-idle'}`}
                >
                  {option}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {breaks.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <BulkDeleteConfirmControl formId={BULK_BREAKS_FORM_ID} pageBreakCount={breaks.length} />
          </div>
        ) : null}

        <form id={BULK_BREAKS_FORM_ID} action={bulkDeleteBreaksAction} className="hidden">
          <input type="hidden" name="q" value={qRaw} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="orders_limit" value={ordersLimit} />
        </form>
        <BulkSelectionScript formId={BULK_BREAKS_FORM_ID} />

        <div className="mt-3 app-table-wrap xl:max-h-[calc(100vh-28rem)] xl:overflow-y-auto">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th w-12">
                    <input
                      form={BULK_BREAKS_FORM_ID}
                      type="checkbox"
                      aria-label="Select all breaks on this page"
                      data-bulk-page-checkbox="true"
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                    />
                  </th>
                  <th className="app-th whitespace-nowrap">
                    <SortHeader
                      label="Date"
                      sortKey="break_date"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                      ordersLimit={ordersLimit}
                    />
                  </th>
                  <th className="app-th whitespace-nowrap">
                    <SortHeader
                      label="Order #"
                      sortKey="order_number"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                      ordersLimit={ordersLimit}
                    />
                  </th>
                  <th className="app-th whitespace-nowrap">
                    <SortHeader
                      label="Source"
                      sortKey="source_name"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                      ordersLimit={ordersLimit}
                    />
                  </th>
                  <th className="app-th min-w-[220px]">
                    <SortHeader
                      label="Purchase"
                      sortKey="product_name"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                      ordersLimit={ordersLimit}
                    />
                  </th>
                  <th className="app-th whitespace-nowrap">
                    <SortHeader
                      label="Status"
                      sortKey="completionStatus"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                      ordersLimit={ordersLimit}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {breaks.map((item) => {
                  const breakLabel = cleanText(item.product_name || 'Untitled break')
                  const sourceLabel = cleanText(item.source_name || '—')
                  const orderLabel = cleanText(item.order_number || '—')
                  const breakHref = `/app/breaks/${item.id}`

                  return (
                    <tr key={item.id} data-break-row-id={item.id} className="app-tr align-top">
                      <td className="app-td">
                        <input
                          form={BULK_BREAKS_FORM_ID}
                          type="checkbox"
                          name="selected_break_ids"
                          value={item.id}
                          aria-label={`Select ${breakLabel}`}
                          data-break-bulk-row-checkbox="true"
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                        />
                      </td>

                      <td className="app-td whitespace-nowrap">
                        <Link href={breakHref} className="block text-zinc-100 hover:text-white hover:underline">
                          {formatDate(item.break_date)}
                        </Link>
                      </td>

                      <td className="app-td">
                        <Link href={breakHref} className="block max-w-36 break-words text-zinc-100 hover:text-white hover:underline" title={orderLabel}>
                          {orderLabel}
                        </Link>
                      </td>

                      <td className="app-td">
                        <Link href={breakHref} className="block max-w-32 break-words text-zinc-100 hover:text-white hover:underline" title={sourceLabel}>
                          {sourceLabel}
                        </Link>
                      </td>

                      <td className="app-td">
                        <Link
                          href={breakHref}
                          data-break-primary-title="true"
                          className="block max-w-[360px] break-words font-medium text-zinc-100 hover:text-white hover:underline"
                          title={breakLabel}
                        >
                          {breakLabel}
                        </Link>
                      </td>

                      <td className="app-td whitespace-nowrap">
                        <Link href={breakHref} className="block">
                          {renderStatusPill(item.completionStatus)}
                        </Link>
                      </td>
                    </tr>
                  )
                })}

                {breaks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                      No orders found for this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            Showing page {page} with up to {limit} received orders. Orders column shows up to {ordersLimit} unentered orders.
          </div>

          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildBreaksHref({
                  q: qRaw,
                  sort: sortKey,
                  dir: sortDir,
                  page: page - 1,
                  limit,
                  ordersLimit,
                })}
                className="app-button"
              >
                Previous
              </Link>
            ) : (
              <span className="app-button pointer-events-none opacity-50">Previous</span>
            )}

            {hasNextPage ? (
              <Link
                href={buildBreaksHref({
                  q: qRaw,
                  sort: sortKey,
                  dir: sortDir,
                  page: page + 1,
                  limit,
                  ordersLimit,
                })}
                className="app-button-primary"
              >
                Next
              </Link>
            ) : (
              <span className="app-button-primary pointer-events-none opacity-50">Next</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}