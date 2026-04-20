import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

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

function escapeLike(value: string) {
  return value.replace(/[%_]/g, '')
}

function extractOrderNumbers(input: string): string[] {
  if (!input) return []
  return Array.from(new Set(input.match(/\d{6,}/g) || []))
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
  return breakRow.product_name || breakRow.source_name || breakRow.order_number || 'Untitled break'
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
    <div className="app-section p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p>
        </div>

        <div className="text-xs text-zinc-500">{count} hit(s)</div>
      </div>

      <div className="mt-4 grid gap-3">{children}</div>
    </div>
  )
}

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim()
  const q = escapeLike(qRaw)
  const extractedNumbers = extractOrderNumbers(qRaw)
  const isMultiOrderSearch = extractedNumbers.length > 0

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
          .order('processed_date', { ascending: false }),

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
          .order('break_date', { ascending: false }),

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
          .limit(100),

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
          .limit(100),

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
          .limit(100),
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
          .limit(100)

        salesFromInventoryMatches = (salesFromInventoryResponse.data ?? []) as SaleSearchRow[]
        salesError = salesFromInventoryResponse.error?.message ?? null
      }

      const salesMap = new Map<string, SaleSearchRow>()

      for (const sale of [...salesDirectMatches, ...salesFromInventoryMatches]) {
        salesMap.set(sale.id, sale)
      }

      matchingSales = Array.from(salesMap.values())

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
            Paste order numbers, copied email text, or search normally across orders, breaks, inventory, and sold items.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/whatnot-orders" className="app-button">
            Whatnot Orders
          </Link>
          <Link href="/app/breaks" className="app-button">
            Breaks
          </Link>
          <Link href="/app/inventory" className="app-button">
            Inventory
          </Link>
        </div>
      </div>

      {qRaw ? (
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
            <Link href="/app/search" className="app-button">
              Clear Results
            </Link>
          </div>
        </div>
      ) : (
        <div className="app-section p-4">
          <div className="text-sm text-zinc-300">
            Use the global search bar at the top of the app to search across orders, breaks, inventory, and sold items.
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
          title="Matching Whatnot Orders"
          subtitle={
            isMultiOrderSearch
              ? 'Exact order-number matches from pasted order text.'
              : 'Matching staging and linked Whatnot orders.'
          }
          count={matchingOrders.length}
        >
          {matchingOrders.map((order) => (
            <div key={order.id} className="app-card-tight p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {order.break_id ? (
                      <span className="app-badge app-badge-success">Linked</span>
                    ) : (
                      <span className="app-badge app-badge-warning">Staging</span>
                    )}
                  </div>

                  <div className="mt-2 text-lg font-semibold">
                    {order.product_name || 'Untitled order'}
                  </div>

                  <div className="mt-2 text-sm text-zinc-300">Seller: {order.seller || '—'}</div>
                  <div className="mt-1 text-sm text-zinc-300">Buyer: {order.buyer || '—'}</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Order #: {order.order_numeric_id || order.order_id || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Date: {order.processed_date_display || order.processed_date || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Status: {order.order_status || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">Qty: {order.quantity ?? '—'}</div>
                  <div className="mt-1 text-sm text-zinc-300">Total: {money(order.total)}</div>

                  {order.source_file_name ? (
                    <div className="mt-1 text-xs text-zinc-500">
                      Source file: {order.source_file_name}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={buildFocusHref(order)} className="app-button">
                    Open Order
                  </Link>

                  {order.break_id ? (
                    <>
                      <Link href={`/app/breaks/${order.break_id}`} className="app-button">
                        Break Details
                      </Link>
                      <Link href={`/app/breaks/${order.break_id}/edit`} className="app-button">
                        Edit Break
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && matchingBreaks.length > 0 ? (
        <ResultSection
          title="Matching Breaks"
          subtitle="Search hits from order number, breaker/source, product, format, and notes."
          count={matchingBreaks.length}
        >
          {matchingBreaks.map((breakRow) => (
            <div key={breakRow.id} className="app-card-tight p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {breakRow.reversed_at ? (
                      <span className="app-badge app-badge-danger">Reversed</span>
                    ) : (
                      <span className="app-badge app-badge-info">Active</span>
                    )}
                  </div>

                  <div className="mt-2 text-lg font-semibold">
                    {buildBreakDisplay(breakRow)}
                  </div>

                  <div className="mt-2 text-sm text-zinc-300">
                    Breaker / Source: {breakRow.source_name || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Order #: {breakRow.order_number || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Format: {breakRow.format_type || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Break date: {breakRow.break_date || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Cost: {money(breakRow.total_cost)}
                  </div>

                  {breakRow.notes ? (
                    <div className="mt-2 text-sm text-zinc-400">
                      Notes: {breakRow.notes}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/app/breaks/${breakRow.id}`} className="app-button">
                    Break Details
                  </Link>
                  <Link href={`/app/breaks/${breakRow.id}/edit`} className="app-button">
                    Edit Break
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && matchingInventory.length > 0 ? (
        <ResultSection
          title="Matching Inventory Items"
          subtitle="Search hits from item title, player name, set, item number, team, notes, and related inventory fields."
          count={matchingInventory.length}
        >
          {matchingInventory.map((item) => (
            <div key={item.id} className="app-card-tight p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-lg font-semibold">
                    {buildInventoryDisplay(item) || item.title || 'Untitled inventory item'}
                  </div>

                  <div className="mt-2 text-sm text-zinc-300">Type: {item.item_type || '—'}</div>
                  <div className="mt-1 text-sm text-zinc-300">Status: {item.status || '—'}</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Qty: {item.quantity ?? '—'} / Available: {item.available_quantity ?? '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Cost basis: {money(item.cost_basis_total)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Est. value: {money(item.estimated_value_total)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Source type: {item.source_type || '—'}
                  </div>

                  {item.notes ? (
                    <div className="mt-2 text-sm text-zinc-400">Notes: {item.notes}</div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/app/inventory/${item.id}`} className="app-button">
                    Open Item
                  </Link>

                  <Link href="/app/inventory" className="app-button">
                    Open Inventory
                  </Link>

                  {item.source_break_id ? (
                    <Link href={`/app/breaks/${item.source_break_id}`} className="app-button">
                      Source Break
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && matchingSales.length > 0 ? (
        <ResultSection
          title="Matching Sold Items / Sales"
          subtitle="Search hits from sold item details, sold item notes, sale notes, and platform fields."
          count={matchingSales.length}
        >
          {matchingSales.map((sale) => (
            <div key={sale.id} className="app-card-tight p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="app-badge app-badge-success">Sold</span>

                    {sale.inventory_items?.status ? (
                      <span className="app-badge app-badge-neutral">
                        {sale.inventory_items.status}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 text-lg font-semibold">
                    {buildSoldItemDisplay(sale)}
                  </div>

                  <div className="mt-2 text-sm text-zinc-300">
                    Sale date: {sale.sale_date || '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Qty sold: {sale.quantity_sold ?? '—'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Gross sale: {money(sale.gross_sale)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Profit: {money(sale.profit)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Platform: {sale.platform || '—'}
                  </div>

                  {sale.inventory_items?.notes ? (
                    <div className="mt-2 text-sm text-zinc-400">
                      Item notes: {sale.inventory_items.notes}
                    </div>
                  ) : null}

                  {sale.notes ? (
                    <div className="mt-1 text-sm text-zinc-400">
                      Sale notes: {sale.notes}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {sale.inventory_item_id ? (
                    <Link href={`/app/inventory/${sale.inventory_item_id}`} className="app-button">
                      Open Item
                    </Link>
                  ) : null}

                  {sale.inventory_items?.source_break_id ? (
                    <Link
                      href={`/app/breaks/${sale.inventory_items.source_break_id}`}
                      className="app-button"
                    >
                      Source Break
                    </Link>
                  ) : null}

                  <Link href="/app/inventory" className="app-button">
                    Open Inventory
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </ResultSection>
      ) : null}
    </div>
  )
}