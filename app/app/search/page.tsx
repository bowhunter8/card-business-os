import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SelectAllCheckbox from './SelectAllCheckbox'
import CancelDetailsButton from './CancelDetailsButton'

type WhatnotOrderRow = {
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
}

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  order_number: string | null
  product_name: string | null
  format_type: string | null
  notes: string | null
  total_cost: number | null
  reversed_at: string | null
}

type InventoryItemRow = {
  id: string
  source_break_id: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number | null
  available_quantity: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
  status: string | null
  item_type: string | null
  notes: string | null
  source_type: string | null
}

type SaleInventoryItemRow = {
  id: string
  source_break_id: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  status: string | null
  item_type: string | null
  notes: string | null
}

type SaleSearchRow = {
  id: string
  sale_date: string | null
  quantity_sold: number | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  platform: string | null
  notes: string | null
  reversed_at: string | null
  inventory_item_id: string | null
  inventory_items?: SaleInventoryItemRow | null
}

const SECTION_LIMIT = 50
const BULK_ORDERS_FORM_ID = 'bulk-delete-orders-form'
const BULK_BREAKS_FORM_ID = 'bulk-delete-breaks-form'
const BULK_INVENTORY_FORM_ID = 'bulk-delete-inventory-form'

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function buildFocusHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams()

  if (order.id) params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)

  return `/app/whatnot-orders/focus?${params.toString()}`
}

function buildSearchRedirect(q: string, statusKey: string, statusValue: string) {
  const params = new URLSearchParams()

  if (q.trim()) params.set('q', q.trim())
  params.set(statusKey, statusValue)

  return `/app/search?${params.toString()}#search-status`
}

function readFormIds(formData: FormData, fieldName: string) {
  return formData
    .getAll(fieldName)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

async function deleteOrderAction(formData: FormData) {
  'use server'

  const orderId = String(formData.get('order_id') ?? '').trim()
  const isLinked = String(formData.get('is_linked') ?? '') === '1'
  const q = String(formData.get('q') ?? '').trim()

  if (!orderId) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Missing order ID.'))
  }

  if (isLinked) {
    redirect(
      buildSearchRedirect(
        q,
        'delete_error',
        'This order is linked to a break. Roll back or unlink the break first, then delete the order.'
      )
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
    .from('whatnot_orders')
    .delete()
    .eq('id', orderId)
    .eq('user_id', user.id)
    .is('break_id', null)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/whatnot-orders')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted', 'order'))
}

async function deleteInventoryItemAction(formData: FormData) {
  'use server'

  const itemId = String(formData.get('item_id') ?? '').trim()
  const q = String(formData.get('q') ?? '').trim()

  if (!itemId) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Missing inventory item ID.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', user.id)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted', 'inventory'))
}

async function deleteBreakAction(formData: FormData) {
  'use server'

  const breakId = String(formData.get('break_id') ?? '').trim()
  const q = String(formData.get('q') ?? '').trim()

  if (!breakId) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Missing break ID.'))
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
    .eq('id', breakId)
    .eq('user_id', user.id)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(buildSearchRedirect(q, 'deleted', 'break'))
}

async function bulkDeleteOrdersAction(formData: FormData) {
  'use server'

  const orderIds = readFormIds(formData, 'selected_order_ids')
  const q = String(formData.get('q') ?? '').trim()

  if (orderIds.length === 0) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Select at least one unassigned order to delete.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('whatnot_orders')
    .delete()
    .eq('user_id', user.id)
    .is('break_id', null)
    .in('id', orderIds)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/whatnot-orders')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted_count', `${orderIds.length} unassigned order(s)`))
}

async function bulkDeleteInventoryItemsAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const q = String(formData.get('q') ?? '').trim()

  if (itemIds.length === 0) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Select at least one inventory item to delete.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('user_id', user.id)
    .in('id', itemIds)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted_count', `${itemIds.length} inventory item(s)`))
}

async function bulkDeleteBreaksAction(formData: FormData) {
  'use server'

  const breakIds = readFormIds(formData, 'selected_break_ids')
  const q = String(formData.get('q') ?? '').trim()

  if (breakIds.length === 0) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Select at least one break to delete.'))
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
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(buildSearchRedirect(q, 'deleted_count', `${breakIds.length} break(s)`))
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, '')
}

function extractOrderNumbers(input: string): string[] {
  if (!input) return []

  const cleaned = input
    .replace(/order\s*id/gi, ' ')
    .replace(/order\s*date/gi, ' ')
    .replace(/sold\s*by/gi, ' ')
    .replace(/quantity/gi, ' ')
    .replace(/category/gi, ' ')
    .replace(/subtotal/gi, ' ')
    .replace(/shipping/gi, ' ')
    .replace(/tax(?:es)?/gi, ' ')
    .replace(/total/gi, ' ')
    .replace(/usd/gi, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^0-9\s]/g, ' ')

  const matches = cleaned.match(/\d{6,}/g) || []
  const unique = Array.from(new Set(matches))

  return unique
    .sort((a, b) => a.length - b.length)
    .slice(0, 25)
}

function cleanText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function buildInventoryDisplay(item: InventoryItemRow) {
  const parts = [
    item.year,
    item.set_name,
    item.player_name || item.title,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]

  return parts.filter(Boolean).join(' • ')
}

function buildBreakDisplay(breakRow: BreakRow) {
  return cleanText(
    breakRow.product_name || breakRow.source_name || breakRow.order_number || 'Untitled break'
  )
}

function buildSoldItemDisplay(sale: SaleSearchRow) {
  const item = sale.inventory_items
  if (!item) return 'Untitled sold item'

  const parts = [
    item.year,
    item.set_name,
    item.player_name || item.title,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]

  return parts.filter(Boolean).join(' • ') || item.title || item.player_name || 'Untitled sold item'
}

function statusBadgeClasses(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()

  if (normalized === 'linked' || normalized === 'complete' || normalized === 'sold') {
    return 'app-badge app-badge-success'
  }

  if (normalized === 'staging' || normalized === 'unassigned' || normalized === 'open') {
    return 'app-badge app-badge-warning'
  }

  if (
    normalized === 'active' ||
    normalized === 'in progress' ||
    normalized === 'personal' ||
    normalized === 'listed'
  ) {
    return 'app-badge app-badge-info'
  }

  if (normalized === 'reversed' || normalized === 'junk') {
    return 'app-badge app-badge-neutral'
  }

  return 'app-badge app-badge-neutral'
}

function SearchSummaryCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="app-card-tight p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-base font-semibold leading-tight">{value}</div>
    </div>
  )
}

function ResultSection({
  title,
  subtitle,
  count,
  children,
}: {
  title: string
  subtitle: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="app-section">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p>
        </div>

        <div className="text-xs text-zinc-500">{count} hit(s)</div>
      </div>

      <div className="mt-4">{children}</div>
    </div>
  )
}

function DeleteConfirmControl({
  itemType,
  itemName,
  hiddenIdName,
  hiddenIdValue,
  q,
  action,
}: {
  itemType: 'inventory item' | 'break'
  itemName: string
  hiddenIdName: string
  hiddenIdValue: string
  q: string
  action: (formData: FormData) => Promise<void>
}) {
  return (
    <details className="group relative">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete
      </summary>

      <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
        <div className="text-sm font-semibold text-red-200">Confirm delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete this {itemType}: <span className="text-zinc-200">{itemName}</span>
        </div>

        <form action={action} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name={hiddenIdName} value={hiddenIdValue} />
          <input type="hidden" name="q" value={q} />

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

function DeleteOrderConfirmControl({
  orderId,
  orderLabel,
  isLinked,
  q,
}: {
  orderId: string
  orderLabel: string
  isLinked: boolean
  q: string
}) {
  if (isLinked) {
    return (
      <div className="max-w-[190px] whitespace-normal rounded-xl border border-amber-900/50 bg-amber-950/20 px-2 py-1 text-[11px] leading-snug text-amber-300">
        Linked order — roll back the break first.
      </div>
    )
  }

  return (
    <details className="group relative">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete
      </summary>

      <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
        <div className="text-sm font-semibold text-red-200">Confirm delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete this unassigned order: <span className="text-zinc-200">{orderLabel}</span>
        </div>

        <form action={deleteOrderAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="is_linked" value={isLinked ? '1' : '0'} />
          <input type="hidden" name="q" value={q} />

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

function BulkDeleteConfirmControl({
  label,
  formId,
}: {
  label: string
  formId: string
}) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Check the rows you want to remove, then confirm below.
          </div>
        </div>

        <details className="group">
          <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
            Delete Selected
          </summary>

          <div className="mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
            <div className="text-sm font-semibold text-red-200">Confirm bulk delete?</div>
            <div className="mt-1 text-xs leading-relaxed text-zinc-400">
              This will delete the selected {label}. This cannot be undone from this screen.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                form={formId}
                className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
              >
                Yes, Delete Selected
              </button>

              <CancelDetailsButton />
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    deleted?: string
    deleted_count?: string
    delete_error?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim()
  const q = escapeLike(qRaw)
  const extractedNumbers = extractOrderNumbers(qRaw)
  const deleted = String(params?.deleted ?? '').trim()
  const deletedCount = String(params?.deleted_count ?? '').trim()
  const deleteError = String(params?.delete_error ?? '').trim()

  const isLikelyReceiptPaste =
    extractedNumbers.length > 0 &&
    qRaw.length > 30 &&
    /order|sold|quantity|date|category/i.test(qRaw)

  const isMultiOrderSearch = extractedNumbers.length > 0 || isLikelyReceiptPaste

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let matchingOrders: WhatnotOrderRow[] = []
  let matchingBreaks: BreakRow[] = []
  let matchingInventory: InventoryItemRow[] = []
  let matchingSales: SaleSearchRow[] = []
  let ordersError: string | null = null
  let breaksError: string | null = null
  let inventoryError: string | null = null
  let salesError: string | null = null

  if (qRaw) {
    if (isMultiOrderSearch) {
      const ordersResponse = await supabase
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
          source_file_name
        `)
        .eq('user_id', user.id)
        .in('order_numeric_id', extractedNumbers)
        .order('processed_date', { ascending: false })
        .limit(SECTION_LIMIT)

      matchingOrders = (ordersResponse.data ?? []) as WhatnotOrderRow[]
      ordersError = ordersResponse.error?.message ?? null
    } else {
      const orderQuery = `%${q}%`
      const breakQuery = `%${q}%`
      const inventoryQuery = `%${q}%`
      const salesQuery = `%${q}%`

      const [
        ordersResponse,
        breaksResponse,
        inventoryResponse,
        soldInventoryResponse,
        salesDirectResponse,
      ] = await Promise.all([
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
            source_file_name
          `)
          .eq('user_id', user.id)
          .or(
            [
              `order_id.ilike.${orderQuery}`,
              `order_numeric_id.ilike.${orderQuery}`,
              `buyer.ilike.${orderQuery}`,
              `seller.ilike.${orderQuery}`,
              `product_name.ilike.${orderQuery}`,
              `order_status.ilike.${orderQuery}`,
              `source_file_name.ilike.${orderQuery}`,
            ].join(',')
          )
          .order('processed_date', { ascending: false })
          .limit(SECTION_LIMIT),

        supabase
          .from('breaks')
          .select(`
            id,
            break_date,
            source_name,
            order_number,
            product_name,
            format_type,
            notes,
            total_cost,
            reversed_at
          `)
          .eq('user_id', user.id)
          .or(
            [
              `order_number.ilike.${breakQuery}`,
              `source_name.ilike.${breakQuery}`,
              `product_name.ilike.${breakQuery}`,
              `format_type.ilike.${breakQuery}`,
              `notes.ilike.${breakQuery}`,
            ].join(',')
          )
          .order('break_date', { ascending: false })
          .limit(SECTION_LIMIT),

        supabase
          .from('inventory_items')
          .select(`
            id,
            source_break_id,
            title,
            player_name,
            year,
            brand,
            set_name,
            card_number,
            parallel_name,
            team,
            quantity,
            available_quantity,
            cost_basis_total,
            estimated_value_total,
            status,
            item_type,
            notes,
            source_type
          `)
          .eq('user_id', user.id)
          .or(
            [
              `title.ilike.${inventoryQuery}`,
              `player_name.ilike.${inventoryQuery}`,
              `brand.ilike.${inventoryQuery}`,
              `set_name.ilike.${inventoryQuery}`,
              `card_number.ilike.${inventoryQuery}`,
              `parallel_name.ilike.${inventoryQuery}`,
              `team.ilike.${inventoryQuery}`,
              `status.ilike.${inventoryQuery}`,
              `item_type.ilike.${inventoryQuery}`,
              `notes.ilike.${inventoryQuery}`,
            ].join(',')
          )
          .limit(SECTION_LIMIT),

        supabase
          .from('inventory_items')
          .select(`
            id,
            source_break_id,
            title,
            player_name,
            year,
            brand,
            set_name,
            card_number,
            parallel_name,
            team,
            quantity,
            available_quantity,
            cost_basis_total,
            estimated_value_total,
            status,
            item_type,
            notes,
            source_type
          `)
          .eq('user_id', user.id)
          .eq('status', 'sold')
          .or(
            [
              `title.ilike.${inventoryQuery}`,
              `player_name.ilike.${inventoryQuery}`,
              `brand.ilike.${inventoryQuery}`,
              `set_name.ilike.${inventoryQuery}`,
              `card_number.ilike.${inventoryQuery}`,
              `parallel_name.ilike.${inventoryQuery}`,
              `team.ilike.${inventoryQuery}`,
              `item_type.ilike.${inventoryQuery}`,
              `notes.ilike.${inventoryQuery}`,
            ].join(',')
          )
          .limit(SECTION_LIMIT),

        supabase
          .from('sales')
          .select(`
            id,
            sale_date,
            quantity_sold,
            gross_sale,
            platform_fees,
            shipping_cost,
            other_costs,
            net_proceeds,
            cost_of_goods_sold,
            profit,
            platform,
            notes,
            reversed_at,
            inventory_item_id
          `)
          .eq('user_id', user.id)
          .is('reversed_at', null)
          .or(
            [
              `platform.ilike.${salesQuery}`,
              `notes.ilike.${salesQuery}`,
            ].join(',')
          )
          .order('sale_date', { ascending: false })
          .limit(SECTION_LIMIT),
      ])

      matchingOrders = (ordersResponse.data ?? []) as WhatnotOrderRow[]
      matchingBreaks = (breaksResponse.data ?? []) as BreakRow[]
      matchingInventory = (inventoryResponse.data ?? []) as InventoryItemRow[]

      const soldInventoryMatches = (soldInventoryResponse.data ?? []) as InventoryItemRow[]
      const soldInventoryIds = soldInventoryMatches.map((item) => item.id)

      const salesDirectMatches = (salesDirectResponse.data ?? []) as SaleSearchRow[]
      let salesFromInventoryMatches: SaleSearchRow[] = []

      if (soldInventoryIds.length > 0) {
        const salesFromInventoryResponse = await supabase
          .from('sales')
          .select(`
            id,
            sale_date,
            quantity_sold,
            gross_sale,
            platform_fees,
            shipping_cost,
            other_costs,
            net_proceeds,
            cost_of_goods_sold,
            profit,
            platform,
            notes,
            reversed_at,
            inventory_item_id
          `)
          .eq('user_id', user.id)
          .is('reversed_at', null)
          .in('inventory_item_id', soldInventoryIds)
          .order('sale_date', { ascending: false })
          .limit(SECTION_LIMIT)

        salesFromInventoryMatches = (salesFromInventoryResponse.data ?? []) as SaleSearchRow[]
        salesError = salesFromInventoryResponse.error?.message ?? null
      }

      const salesMap = new Map<string, SaleSearchRow>()
      for (const sale of [...salesDirectMatches, ...salesFromInventoryMatches]) {
        salesMap.set(sale.id, sale)
      }

      matchingSales = Array.from(salesMap.values()).slice(0, SECTION_LIMIT)

      const salesInventoryIds = Array.from(
        new Set(
          matchingSales
            .map((sale) => sale.inventory_item_id)
            .filter((value): value is string => Boolean(value))
        )
      )

      if (salesInventoryIds.length > 0) {
        const relatedInventoryResponse = await supabase
          .from('inventory_items')
          .select(`
            id,
            source_break_id,
            title,
            player_name,
            year,
            brand,
            set_name,
            card_number,
            parallel_name,
            team,
            status,
            item_type,
            notes
          `)
          .eq('user_id', user.id)
          .in('id', salesInventoryIds)

        const relatedInventoryRows = (relatedInventoryResponse.data ?? []) as SaleInventoryItemRow[]
        const relatedInventoryMap = new Map<string, SaleInventoryItemRow>()

        for (const item of relatedInventoryRows) {
          relatedInventoryMap.set(item.id, item)
        }

        matchingSales = matchingSales.map((sale) => ({
          ...sale,
          inventory_items: sale.inventory_item_id
            ? relatedInventoryMap.get(sale.inventory_item_id) ?? null
            : null,
        }))

        salesError = salesError || relatedInventoryResponse.error?.message || null
      }

      if (/^\d{4}$/.test(qRaw)) {
        matchingInventory = matchingInventory.filter(
          (item) => String(item.year ?? '') === qRaw
        )

        matchingSales = matchingSales.filter(
          (sale) => String(sale.inventory_items?.year ?? '') === qRaw
        )
      }

      ordersError = ordersResponse.error?.message ?? null
      breaksError = breaksResponse.error?.message ?? null
      inventoryError = inventoryResponse.error?.message ?? null
      salesError =
        salesError ||
        salesDirectResponse.error?.message ||
        soldInventoryResponse.error?.message ||
        null
    }
  }

  const totalHits =
    matchingOrders.length + matchingBreaks.length + matchingInventory.length + matchingSales.length

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div>
          <h1 className="app-title">Search</h1>
          <p className="app-subtitle">
            Paste order numbers, copied email text, or search across orders, breaks, inventory, and sold items.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/whatnot-orders" className="app-button whitespace-nowrap">
            Imported Orders
          </Link>
          <Link href="/app/breaks" className="app-button whitespace-nowrap">
            Breaks
          </Link>
          <Link href="/app/inventory" className="app-button whitespace-nowrap">
            Inventory
          </Link>
        </div>
      </div>

      <div id="search-status" className="scroll-mt-28 space-y-3">
        {deleted ? (
          <div className="app-alert-success">
            Deleted {deleted === 'break' ? 'break' : deleted === 'order' ? 'unassigned order' : 'inventory item'} successfully.
          </div>
        ) : null}

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

      {qRaw ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <SearchSummaryCard label="Total Hits" value={totalHits} />
            <SearchSummaryCard label="Orders" value={matchingOrders.length} />
            <SearchSummaryCard label="Breaks" value={matchingBreaks.length} />
            <SearchSummaryCard label="Inventory" value={matchingInventory.length} />
            <SearchSummaryCard label="Sales" value={matchingSales.length} />
          </div>

          <div className="app-section p-4">
            <div className="text-sm text-zinc-300">
              {ordersError || breaksError || inventoryError || salesError
                ? 'Search ran with an error.'
                : `Found ${totalHits} result(s) for "${qRaw}"`}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Use the global search bar at the top of the app to run a new search.
            </div>
            <div className="mt-3">
              <Link href="/app/search" className="app-button whitespace-nowrap">
                Clear Results
              </Link>
            </div>
          </div>
        </>
      ) : (
        <div className="app-section p-4">
          <div className="text-sm text-zinc-300">
            Use the global search bar at the top of the app to search across orders, breaks, inventory, and sold items.
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Multi-order paste search still works. Paste copied order text or a block of order numbers.
          </div>
        </div>
      )}

      {ordersError ? <div className="app-alert-error">Order search error: {ordersError}</div> : null}
      {breaksError ? <div className="app-alert-error">Break search error: {breaksError}</div> : null}
      {inventoryError ? <div className="app-alert-error">Inventory search error: {inventoryError}</div> : null}
      {salesError ? <div className="app-alert-error">Sold item search error: {salesError}</div> : null}

      {qRaw &&
      !ordersError &&
      !breaksError &&
      !inventoryError &&
      !salesError &&
      totalHits === 0 ? (
        <div className="app-empty">No matching results found.</div>
      ) : null}

      {matchingOrders.length > 0 ? (
        <ResultSection
          title="Matching Imported Orders"
          subtitle={
            isMultiOrderSearch
              ? 'Exact order-number matches from pasted order text.'
              : 'Matching staging and linked imported orders.'
          }
          count={matchingOrders.length}
        >
          <form id={BULK_ORDERS_FORM_ID} action={bulkDeleteOrdersAction} className="hidden">
            <input type="hidden" name="q" value={qRaw} />
          </form>

          <BulkDeleteConfirmControl label="unassigned orders" formId={BULK_ORDERS_FORM_ID} />

          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th w-16">
                      <SelectAllCheckbox
                        formId={BULK_ORDERS_FORM_ID}
                        fieldName="selected_order_ids"
                        label="Select all unassigned orders"
                      />
                    </th>
                    <th className="app-th">Order #</th>
                    <th className="app-th">Date</th>
                    <th className="app-th">Purchased From</th>
                    <th className="app-th">Description</th>
                    <th className="app-th">Status</th>
                    <th className="app-th text-right">Total</th>
                    <th className="app-th min-w-[220px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingOrders.map((order) => {
                    const orderNumber = cleanText(order.order_numeric_id || order.order_id || '—')
                    const seller = cleanText(order.seller || '—')
                    const description = cleanText(order.product_name || 'Untitled order')
                    const isLinked = Boolean(order.break_id)
                    const statusLabel = isLinked ? 'Linked' : 'Staging'

                    return (
                      <tr key={order.id} className="app-tr align-top">
                        <td className="app-td">
                          {!isLinked ? (
                            <input
                              form={BULK_ORDERS_FORM_ID}
                              type="checkbox"
                              name="selected_order_ids"
                              value={order.id}
                              aria-label={`Select order ${orderNumber || order.id}`}
                              className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                            />
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="app-td whitespace-nowrap">{orderNumber || '—'}</td>
                        <td className="app-td whitespace-nowrap">
                          {formatDate(order.processed_date_display || order.processed_date)}
                        </td>
                        <td className="app-td">
                          <div className="max-w-40 truncate" title={seller}>
                            {seller || '—'}
                          </div>
                        </td>
                        <td className="app-td">
                          <div className="max-w-80 truncate" title={description}>
                            {description}
                          </div>
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <span className={statusBadgeClasses(statusLabel)}>{statusLabel}</span>
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(order.total)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Link href={buildFocusHref(order)} className="app-button whitespace-nowrap">
                              Open
                            </Link>
                            {order.break_id ? (
                              <Link href={`/app/breaks/${order.break_id}`} className="app-button whitespace-nowrap">
                                Break
                              </Link>
                            ) : null}
                            <DeleteOrderConfirmControl
                              orderId={order.id}
                              orderLabel={orderNumber || order.id}
                              isLinked={isLinked}
                              q={qRaw}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && matchingBreaks.length > 0 ? (
        <ResultSection
          title="Matching Breaks"
          subtitle="Search hits from order number, source, product, format, and notes."
          count={matchingBreaks.length}
        >
          <form id={BULK_BREAKS_FORM_ID} action={bulkDeleteBreaksAction} className="hidden">
            <input type="hidden" name="q" value={qRaw} />
          </form>

          <BulkDeleteConfirmControl label="breaks" formId={BULK_BREAKS_FORM_ID} />

          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th w-16">
                      <SelectAllCheckbox
                        formId={BULK_BREAKS_FORM_ID}
                        fieldName="selected_break_ids"
                        label="Select all breaks"
                      />
                    </th>
                    <th className="app-th">Date</th>
                    <th className="app-th">Break</th>
                    <th className="app-th">Source</th>
                    <th className="app-th">Order #</th>
                    <th className="app-th">Status</th>
                    <th className="app-th text-right">Cost</th>
                    <th className="app-th min-w-[220px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingBreaks.map((breakRow) => {
                    const breakLabel = buildBreakDisplay(breakRow)
                    const sourceLabel = cleanText(breakRow.source_name || '—')
                    const orderLabel = cleanText(breakRow.order_number || '—')
                    const statusLabel = breakRow.reversed_at ? 'Reversed' : 'Active'

                    return (
                      <tr key={breakRow.id} className="app-tr align-top">
                        <td className="app-td whitespace-nowrap">
                          <input
                            form={BULK_BREAKS_FORM_ID}
                            type="checkbox"
                            name="selected_break_ids"
                            value={breakRow.id}
                            aria-label={`Select ${breakLabel}`}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                          />
                        </td>
                        <td className="app-td whitespace-nowrap">{formatDate(breakRow.break_date)}</td>
                        <td className="app-td">
                          <div className="max-w-80 truncate" title={breakLabel}>
                            {breakLabel}
                          </div>
                        </td>
                        <td className="app-td">
                          <div className="max-w-40 truncate" title={sourceLabel}>
                            {sourceLabel}
                          </div>
                        </td>
                        <td className="app-td">
                          <div className="max-w-52 truncate" title={orderLabel}>
                            {orderLabel || '—'}
                          </div>
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <span className={statusBadgeClasses(statusLabel)}>{statusLabel}</span>
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(breakRow.total_cost)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Link href={`/app/breaks/${breakRow.id}`} className="app-button whitespace-nowrap">
                              Details
                            </Link>
                            <Link href={`/app/breaks/${breakRow.id}/edit`} className="app-button whitespace-nowrap">
                              Edit
                            </Link>
                            <DeleteConfirmControl
                              itemType="break"
                              itemName={breakLabel}
                              hiddenIdName="break_id"
                              hiddenIdValue={breakRow.id}
                              q={qRaw}
                              action={deleteBreakAction}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && matchingInventory.length > 0 ? (
        <ResultSection
          title="Matching Inventory Items"
          subtitle="Search hits from title, player, set, number, team, notes, and related inventory fields."
          count={matchingInventory.length}
        >
          <form id={BULK_INVENTORY_FORM_ID} action={bulkDeleteInventoryItemsAction} className="hidden">
            <input type="hidden" name="q" value={qRaw} />
          </form>

          <BulkDeleteConfirmControl label="inventory items" formId={BULK_INVENTORY_FORM_ID} />

          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th w-16">
                      <SelectAllCheckbox
                        formId={BULK_INVENTORY_FORM_ID}
                        fieldName="selected_inventory_ids"
                        label="Select all inventory items"
                      />
                    </th>
                    <th className="app-th">Item</th>
                    <th className="app-th">Status</th>
                    <th className="app-th">Qty</th>
                    <th className="app-th">Available</th>
                    <th className="app-th text-right">Cost</th>
                    <th className="app-th text-right">Est. Value</th>
                    <th className="app-th min-w-[220px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingInventory.map((item) => {
                    const display = buildInventoryDisplay(item) || item.title || 'Untitled inventory item'
                    const statusLabel = cleanText(item.status || '—')

                    return (
                      <tr key={item.id} className="app-tr align-top">
                        <td className="app-td whitespace-nowrap">
                          <input
                            form={BULK_INVENTORY_FORM_ID}
                            type="checkbox"
                            name="selected_inventory_ids"
                            value={item.id}
                            aria-label={`Select ${display}`}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                          />
                        </td>
                        <td className="app-td">
                          <div className="max-w-96 truncate" title={display}>
                            {display}
                          </div>
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <span className={statusBadgeClasses(statusLabel)}>{statusLabel || '—'}</span>
                        </td>
                        <td className="app-td whitespace-nowrap">{item.quantity ?? '—'}</td>
                        <td className="app-td whitespace-nowrap">{item.available_quantity ?? '—'}</td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(item.cost_basis_total)}
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(item.estimated_value_total)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Link href={`/app/inventory/${item.id}`} className="app-button whitespace-nowrap">
                              Open
                            </Link>
                            {item.source_break_id ? (
                              <Link href={`/app/breaks/${item.source_break_id}`} className="app-button whitespace-nowrap">
                                Break
                              </Link>
                            ) : null}
                            <DeleteConfirmControl
                              itemType="inventory item"
                              itemName={display}
                              hiddenIdName="item_id"
                              hiddenIdValue={item.id}
                              q={qRaw}
                              action={deleteInventoryItemAction}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && matchingSales.length > 0 ? (
        <ResultSection
          title="Matching Sold Items / Sales"
          subtitle="Search hits from sold item details, sold item notes, sale notes, and platform fields."
          count={matchingSales.length}
        >
          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th">Date</th>
                    <th className="app-th">Item</th>
                    <th className="app-th">Platform</th>
                    <th className="app-th">Qty</th>
                    <th className="app-th text-right">Gross</th>
                    <th className="app-th text-right">Profit</th>
                    <th className="app-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingSales.map((sale) => {
                    const display = buildSoldItemDisplay(sale)
                    const platform = cleanText(sale.platform || '—')

                    return (
                      <tr key={sale.id} className="app-tr">
                        <td className="app-td whitespace-nowrap">{formatDate(sale.sale_date)}</td>
                        <td className="app-td">
                          <div className="max-w-96 truncate" title={display}>
                            {display}
                          </div>
                        </td>
                        <td className="app-td whitespace-nowrap">{platform || '—'}</td>
                        <td className="app-td whitespace-nowrap">{sale.quantity_sold ?? '—'}</td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(sale.gross_sale)}
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(sale.profit)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            {sale.inventory_item_id ? (
                              <Link href={`/app/inventory/${sale.inventory_item_id}`} className="app-button whitespace-nowrap">
                                Item
                              </Link>
                            ) : null}
                            {sale.inventory_items?.source_break_id ? (
                              <Link
                                href={`/app/breaks/${sale.inventory_items.source_break_id}`}
                                className="app-button whitespace-nowrap"
                              >
                                Break
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}
    </div>
  )
}