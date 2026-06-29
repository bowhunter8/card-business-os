import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'
import { updateInventoryListingAction } from '@/app/actions/inventory-listing'
import { updateInventoryItemAction } from '@/app/actions/inventory'
import DeleteInventoryItemButton from '../DeleteInventoryItemButton'
import EstimateValueHelper from './EstimateValueHelper'

type InventoryItem = {
  id: string
  status: string | null
  item_type: string | null
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
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_unit: number | null
  estimated_value_total: number | null
  storage_location: string | null
  notes: string | null
  source_type?: string | null
  source_break_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  listed_price?: number | null
  listed_platform?: string | null
  listed_date?: string | null
}

type SaleRow = {
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
  reversed_at?: string | null
  reversal_reason?: string | null
}

type FinalizedDisposalRow = {
  id: string
  created_at: string | null
  disposal_reason: string | null
  disposal_notes: string | null
  notes: string | null
}

type GiveawayAuditRow = {
  id: string
  created_at: string | null
  event_date: string | null
  amount: number | null
  quantity_change: number | null
  notes: string | null
}

type RelatedSourceInventoryItem = {
  id: string
  status: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number | null
  cost_basis_total: number | null
}

type RelatedBreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  format_type: string | null
  order_number: string | null
  cards_received: number | null
  created_at: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function moneyInput(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString()
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().slice(0, 10)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function buildDisplay(item: InventoryItem) {
  const parts = [
    item.player_name,
    item.year,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.notes,
  ]

  return parts.filter(Boolean).join(' • ')
}

function buildRelatedSourceItemDisplay(item: RelatedSourceInventoryItem) {
  const primary = item.title || item.player_name || 'Untitled item'
  const details = [
    item.year,
    item.brand,
    item.set_name,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]
    .filter(Boolean)
    .join(' • ')

  return details ? `${primary} • ${details}` : primary
}

function buildSourceTypeLabel(value: string | null | undefined) {
  if (!value) return 'Manual / Unknown'

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildBreakTitle(breakRow: RelatedBreakRow | null, fallbackId: string | null | undefined) {
  if (!breakRow) return fallbackId ? `Break ${fallbackId.slice(0, 8)}` : 'Related Break'

  const pieces = [breakRow.product_name, breakRow.source_name, breakRow.break_date]
    .map((piece) => String(piece || '').trim())
    .filter(Boolean)

  return pieces.length > 0 ? pieces.join(' • ') : `Break ${breakRow.id.slice(0, 8)}`
}

function readGiveawayDetail(notes: string | null | undefined, label: string) {
  if (!notes) return '—'

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nextLabels =
    'Giveaway Type|Business Purpose|Recipient Type|Campaign / Event|Related Order / Sale #|Notes|Do not also deduct'
  const pattern = new RegExp(`${escapedLabel}:\\s*(.*?)(?=\\s+(?:${nextLabels}):|\\s+Do not also deduct|$)`)
  const match = notes.match(pattern)

  return match?.[1]?.trim() || '—'
}

function giveawayQuantity(row: GiveawayAuditRow | null) {
  const quantity = Math.abs(Number(row?.quantity_change ?? 0))
  return Number.isFinite(quantity) && quantity > 0 ? String(quantity) : '—'
}

function renderStatusPill(status: string | null) {
  if (status === 'available') {
    return <span className="app-badge app-badge-success">For Sale</span>
  }

  if (status === 'listed') {
    return <span className="app-badge app-badge-info">Listed</span>
  }

  if (status === 'sold') {
    return <span className="app-badge app-badge-danger">Sold</span>
  }

  if (status === 'personal') {
    return <span className="app-badge app-badge-info">Personal</span>
  }

  if (status === 'junk') {
    return <span className="app-badge app-badge-neutral">Junk</span>
  }

  if (status === 'giveaway') {
    return <span className="app-badge app-badge-warning">Giveaway</span>
  }

  return (
    <span className="app-badge app-badge-neutral capitalize">
      {(status || 'unknown').replaceAll('_', ' ')}
    </span>
  )
}

function EditableField({
  label,
  name,
  defaultValue,
  type = 'text',
  step,
  min,
  formId,
  disabled = false,
}: {
  label: string
  name: string
  defaultValue: string | number
  type?: 'text' | 'number'
  step?: string | number
  min?: string | number
  formId: string
  disabled?: boolean
}) {
  return (
    <div className="app-metric-card p-3">
      <label className="text-xs font-medium uppercase tracking-wide text-zinc-400" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        form={formId}
        name={name}
        type={type}
        step={step}
        min={min}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`app-input mt-1.5 ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
      />
    </div>
  )
}

function ReadonlyMetric({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="app-metric-card p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-tight">{value}</div>
    </div>
  )
}

function EditableSelect({
  label,
  name,
  defaultValue,
  formId,
  disabled = false,
}: {
  label: string
  name: string
  defaultValue: string
  formId: string
  disabled?: boolean
}) {
  return (
    <div className="app-metric-card p-3">
      <label className="text-xs font-medium uppercase tracking-wide text-zinc-400" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        form={formId}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`app-select mt-1.5 ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
      >
        <option value="available">For Sale</option>
        <option value="listed">Listed</option>
        <option value="sold">Sold</option>
        <option value="personal">Personal</option>
        <option value="junk">Junk</option>
        <option value="giveaway">Giveaway</option>
      </select>
    </div>
  )
}

function EstimateValueMetric({
  item,
  formId,
}: {
  item: InventoryItem
  formId: string
}) {
  return (
    <div className="app-metric-card p-3 md:col-span-2">
      <input
        id="estimated_value_unit"
        form={formId}
        name="estimated_value_unit"
        type="hidden"
        defaultValue={item.estimated_value_unit ?? 0}
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-[140px]">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Estimated Value
          </div>
          <div className="mt-1 text-lg font-semibold leading-tight">
            {money(item.estimated_value_unit)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <EstimateValueHelper
            inputId="estimated_value_unit"
            item={{
              title: item.title,
              playerName: item.player_name,
              year: item.year,
              brand: item.brand,
              setName: item.set_name,
              cardNumber: item.card_number,
              parallel: item.parallel_name,
              team: item.team,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; success?: string; saleRecorded?: string; savedSale?: string; updatedSale?: string; deletedSale?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : undefined
  const errorMessage = query?.error

  const successMessage =
    query?.saleRecorded === '1' || query?.savedSale === '1'
      ? 'Sale recorded successfully. Inventory, sales records, tax tracking, and HITS Pulse™ trend data were updated.'
      : query?.updatedSale === '1'
        ? 'Sale updated successfully.'
        : query?.deletedSale === '1'
          ? 'Sale reversed successfully.'
          : query?.success

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [itemResponse, salesResponse, finalizedDisposalResponse, giveawayAuditResponse] = await Promise.all([
    supabase
      .from('inventory_items')
      .select(`
        id,
        status,
        item_type,
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
        cost_basis_unit,
        cost_basis_total,
        estimated_value_unit,
        estimated_value_total,
        storage_location,
        notes,
        source_type,
        source_break_id,
        created_at,
        updated_at,
        listed_price,
        listed_platform,
        listed_date
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),

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
        reversal_reason
      `)
      .eq('user_id', user.id)
      .eq('inventory_item_id', id)
      .order('sale_date', { ascending: false }),

    supabase
      .from('inventory_transactions')
      .select(`
        id,
        created_at,
        disposal_reason,
        disposal_notes,
        notes
      `)
      .eq('user_id', user.id)
      .eq('inventory_item_id', id)
      .eq('transaction_type', 'disposal_writeoff_review')
      .eq('finalized_for_tax', true)
      .order('created_at', { ascending: false })
      .limit(1),

    supabase
      .from('inventory_transactions')
      .select(`
        id,
        created_at,
        event_date,
        amount,
        quantity_change,
        notes
      `)
      .eq('user_id', user.id)
      .eq('inventory_item_id', id)
      .eq('transaction_type', 'adjustment')
      .eq('to_status', 'giveaway')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  if (itemResponse.error || !itemResponse.data) {
    notFound()
  }

  const item = itemResponse.data as InventoryItem
  const sales: SaleRow[] = (salesResponse.data ?? []) as SaleRow[]
  const finalizedDisposal =
    ((finalizedDisposalResponse.data ?? [])[0] as FinalizedDisposalRow | undefined) ?? null
  const giveawayAudit =
    ((giveawayAuditResponse.data ?? [])[0] as GiveawayAuditRow | undefined) ?? null

  const isFinalizedDisposal = Boolean(finalizedDisposal)

  const activeSales = sales.filter((sale) => !sale.reversed_at)

  const totalGross = activeSales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  const totalNet = activeSales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0)
  const totalProfit = activeSales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)
  const totalQtySold = activeSales.reduce((sum, row) => sum + Number(row.quantity_sold ?? 0), 0)

  const availableQuantity = Number(item.available_quantity ?? 0)
  const isGiveaway = item.status === 'giveaway'
  const isFinalizedGiveaway = isGiveaway && (Boolean(giveawayAudit) || availableQuantity <= 0)
  const isPlannedGiveaway = isGiveaway && !isFinalizedGiveaway
  const isLockedForBusinessEvent = isFinalizedDisposal || isFinalizedGiveaway
  const effectiveStatus =
    availableQuantity <= 0 && totalQtySold > 0 ? 'sold' : item.status

  const hasAvailableToSell = availableQuantity > 0 && !isGiveaway
  const canDelete = activeSales.length === 0
  const itemFormId = 'inventory-inline-edit-form'
  const itemName = buildDisplay(item) || item.title || item.player_name || 'Untitled item'
  const hasActiveSales = activeSales.length > 0
  const relatedBreakHref = item.source_break_id ? `/app/breaks/${item.source_break_id}` : ''
  const relatedBreakAddItemsHref = item.source_break_id
    ? `/app/breaks/${item.source_break_id}/add-cards`
    : ''
  const relatedBreakItemsHref = item.source_break_id
    ? `/app/breaks/${item.source_break_id}#break-items`
    : ''

  let relatedBreak: RelatedBreakRow | null = null
  let relatedSourceItems: RelatedSourceInventoryItem[] = []

  if (item.source_break_id) {
    const [relatedBreakResponse, relatedSourceItemsResponse] = await Promise.all([
      supabase
        .from('breaks')
        .select(`
          id,
          break_date,
          source_name,
          product_name,
          format_type,
          order_number,
          cards_received,
          created_at
        `)
        .eq('user_id', user.id)
        .eq('id', item.source_break_id)
        .maybeSingle(),

      supabase
        .from('inventory_items')
        .select(`
          id,
          status,
          title,
          player_name,
          year,
          brand,
          set_name,
          card_number,
          parallel_name,
          team,
          quantity,
          cost_basis_total
        `)
        .eq('user_id', user.id)
        .eq('source_break_id', item.source_break_id)
        .is('deleted_at', null)
        .neq('id', item.id)
        .order('created_at', { ascending: true })
        .limit(25),
    ])

    relatedBreak = (relatedBreakResponse.data as RelatedBreakRow | null) ?? null
    relatedSourceItems = (relatedSourceItemsResponse.data ?? []) as RelatedSourceInventoryItem[]
  }

  const relatedBreakTitle = buildBreakTitle(relatedBreak, item.source_break_id)

  return (
    <div className="app-page-wide min-h-[calc(100vh-6.5rem)] space-y-3 pb-8">
      <form id={itemFormId} action={updateInventoryItemAction}>
        <input type="hidden" name="inventory_item_id" value={item.id} />
      </form>

      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-zinc-400">
            <Link href="/app/inventory" className="hover:text-zinc-200 hover:underline">
              Inventory
            </Link>
            {item.source_break_id ? (
              <>
                <span>/</span>
                <Link href={relatedBreakHref} className="max-w-[20rem] truncate hover:text-zinc-200 hover:underline">
                  {relatedBreakTitle}
                </Link>
              </>
            ) : null}
            <span>/</span>
            <span className="max-w-[20rem] truncate text-zinc-500">
              {item.title || item.player_name || 'Inventory Item'}
            </span>
          </div>

          <h1 className="app-title text-2xl leading-tight">Inventory Item</h1>
          <p className="app-subtitle mt-1 text-sm leading-snug">
            {buildDisplay(item) || item.title || 'Untitled item'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {isPlannedGiveaway ? (
              <span className="app-badge app-badge-warning">Planned Giveaway</span>
            ) : (
              renderStatusPill(effectiveStatus)
            )}

            {!isLockedForBusinessEvent && hasAvailableToSell ? (
              <Link href={`/app/inventory/${item.id}/sell`} className="app-button-primary">
                Sell Item
              </Link>
            ) : null}

            {!isLockedForBusinessEvent && hasActiveSales ? (
              <a href="#sales-history" className="app-button">
                Reverse Sale
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          {isLockedForBusinessEvent ? (
            <span className="app-button pointer-events-none opacity-60">
              Locked
            </span>
          ) : (
            <>
              <button type="submit" form={itemFormId} className="app-button">
                Save Changes
              </button>

              <Link href={`/app/inventory/${item.id}/edit`} className="app-button">
                Edit Page
              </Link>
            </>
          )}

          {isFinalizedDisposal ? (
            <div className="rounded-full border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm font-medium text-amber-200">
              Locked For Tax Review
            </div>
          ) : isPlannedGiveaway ? (
            <Link
              href={`/app/inventory/${item.id}/giveaway`}
              className="app-button-warning"
            >
              Finalize Giveaway
            </Link>
          ) : !isLockedForBusinessEvent && hasAvailableToSell ? (
            <Link
              href={`/app/inventory/${item.id}/giveaway`}
              className="app-button-warning"
            >
              Mark as Giveaway
            </Link>
          ) : null}

          {canDelete && !isLockedForBusinessEvent ? (
            <DeleteInventoryItemButton itemId={item.id} itemName={itemName} />
          ) : null}
        </div>
      </div>

      {errorMessage ? <div className="app-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="app-alert-success">{successMessage}</div> : null}

      {item.source_break_id ? (
        <div className="app-section mt-0 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Original Source
              </div>
              <h2 className="mt-1 text-base font-semibold leading-tight">
                {relatedBreakTitle}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                This item was created from a saved break. Use these links to review the original break, continue entering items, or jump to the other items from the same break.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={relatedBreakHref} className="app-button">
                Open Break Details
              </Link>
              <Link href={relatedBreakAddItemsHref} className="app-button-primary">
                Continue Entering Items
              </Link>
              <Link href={relatedBreakItemsHref} className="app-button">
                View Break Items
              </Link>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <Detail label="Created From" value={buildSourceTypeLabel(item.source_type)} />
            <Detail label="Break Date" value={formatDate(relatedBreak?.break_date)} />
            <Detail label="Breaker / Source" value={relatedBreak?.source_name || '—'} />
            <Detail label="Order #" value={relatedBreak?.order_number || '—'} />
            <Detail label="Format" value={relatedBreak?.format_type || '—'} />
            <Detail label="Items Received" value={String(relatedBreak?.cards_received ?? '—')} />
            <Detail label="Created" value={formatDate(item.created_at)} />
            <Detail label="Last Updated" value={formatDate(item.updated_at)} />
          </div>

          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Item History
                </div>
                <div className="mt-1 text-sm text-zinc-300">
                  Created from break inventory entry. Cost basis and quantity are preserved on this item for sale, giveaway, personal, junk, or write-off tracking.
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                Source ID: {item.source_break_id}
              </div>
            </div>
          </div>

          {relatedSourceItems.length > 0 ? (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70">
              <div className="flex flex-col gap-1 border-b border-zinc-800 px-3 py-2 md:flex-row md:items-center md:justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Other Inventory Items From This Break
                </div>
                <div className="text-xs text-zinc-500">
                  Showing {relatedSourceItems.length} related item(s)
                </div>
              </div>
              <div className="divide-y divide-zinc-800">
                {relatedSourceItems.map((relatedItem) => (
                  <Link
                    key={relatedItem.id}
                    href={`/app/inventory/${relatedItem.id}`}
                    className="flex flex-col gap-1 px-3 py-2.5 transition hover:bg-zinc-900/70 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="break-words text-sm font-medium text-zinc-100">
                        {buildRelatedSourceItemDisplay(relatedItem)}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Qty {relatedItem.quantity ?? 0} • Cost {money(relatedItem.cost_basis_total)}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {renderStatusPill(relatedItem.status)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="app-alert-info mt-3">
              No other active inventory items were found with this same source break ID.
            </div>
          )}
        </div>
      ) : (
        <div className="app-alert-info">
          This item does not have a saved source break ID. It may have been created manually, imported, or created before source linking was added.
        </div>
      )}

      {(effectiveStatus === 'personal' || effectiveStatus === 'giveaway' || effectiveStatus === 'junk') ? (
        <div className="app-alert-warning">
          This status change affects tax reporting. Ensure this item is not also counted as an expense or inventory elsewhere to avoid double counting.
        </div>
      ) : null}


      {effectiveStatus === 'junk' ? (
        <div className="app-alert-info">
          This item is marked as Junk and is being kept for recordkeeping, not active selling.
        </div>
      ) : null}

      {effectiveStatus === 'personal' ? (
        <div className="app-alert-info">
          This item is marked as Personal Collection and is not currently part of your active sell inventory.
        </div>
      ) : null}

      {isPlannedGiveaway ? (
        <div className="app-alert-info">
          <div className="font-semibold">
            This item is planned as a Giveaway, but it has not been finalized yet.
          </div>
          <div className="mt-1 text-sm">
            It will stay under the Giveaway filter and cannot be sold accidentally. You can still edit item notes and details, then finalize it when the giveaway actually happens.
          </div>
        </div>
      ) : isFinalizedGiveaway ? (
        <div className="app-alert-info">
          <div className="font-semibold">
            This item has been finalized as a Giveaway and recorded as a marketing expense.
          </div>
          <div className="mt-1 text-sm">
            Selling, deletion, quantity changes, cost changes, and status changes are disabled to help preserve clean tax records.
          </div>
        </div>
      ) : null}

      {isPlannedGiveaway ? (
        <div className="app-section mt-0 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold leading-tight">
                Planned Giveaway
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                This item was set aside for a future giveaway. Finalize it after the giveaway happens to create the Advertising / Marketing expense and tax audit trail.
              </p>
            </div>

            <Link href={`/app/inventory/${item.id}/giveaway`} className="app-button-warning">
              Finalize Giveaway
            </Link>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <Detail label="Planned Quantity" value={String(item.available_quantity ?? 0)} />
            <Detail label="Planned Cost Basis" value={money(Number(item.available_quantity ?? 0) * Number(item.cost_basis_unit ?? 0))} />
            <Detail label="Source" value={buildSourceTypeLabel(item.source_type)} />
          </div>
        </div>
      ) : null}

      {isFinalizedGiveaway ? (
        <div className="app-section mt-0 p-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold leading-tight">
                Giveaway Details
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Read-only giveaway support details pulled from the audit trail.
              </p>
            </div>

            <span className="app-button pointer-events-none opacity-60">
              Tax Support
            </span>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <Detail label="Giveaway Date" value={formatDate(giveawayAudit?.event_date)} />
            <Detail label="Giveaway Type" value={readGiveawayDetail(giveawayAudit?.notes, 'Giveaway Type')} />
            <Detail label="Recipient Type" value={readGiveawayDetail(giveawayAudit?.notes, 'Recipient Type')} />
            <Detail label="Business Purpose" value={readGiveawayDetail(giveawayAudit?.notes, 'Business Purpose')} />
            <Detail label="Campaign / Event" value={readGiveawayDetail(giveawayAudit?.notes, 'Campaign / Event')} />
            <Detail label="Related Order / Sale #" value={readGiveawayDetail(giveawayAudit?.notes, 'Related Order / Sale #')} />
            <Detail label="Quantity Given Away" value={giveawayQuantity(giveawayAudit)} />
            <Detail label="Recorded Cost Basis" value={money(giveawayAudit?.amount)} />
            <Detail label="Recorded" value={formatDateTime(giveawayAudit?.created_at)} />
          </div>

          {giveawayAudit?.notes ? (
            <div className="mt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Giveaway Notes / Audit Trail
              </div>
              <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-200">
                {giveawayAudit.notes}
              </div>
            </div>
          ) : (
            <div className="app-alert-warning mt-3">
              No detailed giveaway audit note was found for this item. Older giveaway records may only show the Giveaway status and related expense entry.
            </div>
          )}
        </div>
      ) : null}

      {isFinalizedDisposal ? (
        <div className="app-alert-warning">
          <div className="font-semibold">
            This item has been written off for tax review and is now locked.
          </div>

          <div className="mt-1 text-sm">
            Selling, giveaway conversion, deletion, status changes, quantity changes, cost changes, and sale reversal actions are disabled to preserve audit-safe records.
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-400">
                Finalized
              </div>
              <div className="mt-1 text-sm">
                {formatDateTime(finalizedDisposal?.created_at)}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-400">
                Write-Off Reason
              </div>
              <div className="mt-1 text-sm">
                {finalizedDisposal?.disposal_reason || '—'}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-400">
                Write-Off Notes
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm">
                {finalizedDisposal?.disposal_notes ||
                  finalizedDisposal?.notes ||
                  '—'}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-4">
        {isFinalizedDisposal ? (
          <ReadonlyMetric label="Status" value="Written Off - Tax Locked" />
        ) : isFinalizedGiveaway ? (
          <ReadonlyMetric label="Status" value="Giveaway - Tax Locked" />
        ) : isPlannedGiveaway ? (
          <ReadonlyMetric label="Status" value="Planned Giveaway" />
        ) : (
          <EditableSelect
            label="Status"
            name="status"
            defaultValue={effectiveStatus ?? 'available'}
            formId={itemFormId}
          />
        )}

        <EditableField
          label="Quantity"
          name="quantity"
          type="number"
          min={1}
          defaultValue={item.quantity ?? 0}
          formId={itemFormId}
          disabled={isLockedForBusinessEvent}
        />

        <ReadonlyMetric label="Available" value={item.available_quantity ?? 0} />
        <ReadonlyMetric label="Qty Sold" value={totalQtySold} />
      </div>

      {hasActiveSales ? (
        <div className="app-alert-info">
          This item has active sale history. To reverse a sale, use the Sales History section below and reverse the specific sale row.
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-4">
        <EditableField
          label="Unit Cost"
          name="cost_basis_unit"
          type="number"
          step="0.01"
          min={0}
          defaultValue={moneyInput(item.cost_basis_unit)}
          formId={itemFormId}
          disabled={isLockedForBusinessEvent}
        />
        <ReadonlyMetric label="Total Cost" value={money(item.cost_basis_total)} />
        <EstimateValueMetric item={item} formId={itemFormId} />
      </div>

      <div className="app-section mt-0 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold leading-tight">Quick Edit Item</h2>

          {isLockedForBusinessEvent ? (
            <span className="app-button pointer-events-none opacity-60">
              Locked
            </span>
          ) : (
            <button type="submit" form={itemFormId} className="app-button">
              Save Changes
            </button>
          )}
        </div>

        <div className="mt-3 grid gap-2.5 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Title
            </label>
            <input
              form={itemFormId}
              name="title"
              disabled={isLockedForBusinessEvent}
              type="text"
              defaultValue={item.title ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Player / Item Name
            </label>
            <input
              form={itemFormId}
              name="player_name"
              disabled={isLockedForBusinessEvent}
              type="text"
              defaultValue={item.player_name ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Year
            </label>
            <input
              form={itemFormId}
              name="year"
              disabled={isLockedForBusinessEvent}
              type="number"
              defaultValue={item.year ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              #
            </label>
            <input
              form={itemFormId}
              name="card_number"
              disabled={isLockedForBusinessEvent}
              type="text"
              defaultValue={item.card_number ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Brand
            </label>
            <input
              form={itemFormId}
              name="brand"
              disabled={isLockedForBusinessEvent}
              type="text"
              defaultValue={item.brand ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Parallel
            </label>
            <input
              form={itemFormId}
              name="parallel_name"
              disabled={isLockedForBusinessEvent}
              type="text"
              defaultValue={item.parallel_name ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Team
            </label>
            <input
              form={itemFormId}
              name="team"
              disabled={isLockedForBusinessEvent}
              type="text"
              defaultValue={item.team ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Storage Location
            </label>
            <input
              form={itemFormId}
              name="storage_location"
              disabled={isLockedForBusinessEvent}
              type="text"
              defaultValue={item.storage_location ?? ''}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Notes
            </label>
            <textarea
              form={itemFormId}
              name="notes"
              disabled={isLockedForBusinessEvent}
              rows={3}
              defaultValue={item.notes ?? ''}
              className={`app-textarea ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>
        </div>
      </div>

      <div className="app-section mt-0 p-4">
        <h2 className="text-base font-semibold leading-tight">Listing Details</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Detail label="Listed Price" value={item.listed_price != null ? money(item.listed_price) : '—'} />
          <Detail label="Listed Platform" value={item.listed_platform || '—'} />
          <Detail label="Listed Date" value={formatDate(item.listed_date)} />
        </div>

        <form action={updateInventoryListingAction} className="mt-3 grid gap-2.5 md:grid-cols-3">
          <input type="hidden" name="inventory_item_id" value={item.id} />

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Listed Price
            </label>
            <input
              name="listed_price"
              disabled={isLockedForBusinessEvent || isGiveaway}
              type="number"
              min={0}
              step="0.01"
              defaultValue={item.listed_price != null ? Number(item.listed_price).toFixed(2) : ''}
              placeholder="0.00"
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Listed Platform
            </label>
            <input
              name="listed_platform"
              disabled={isLockedForBusinessEvent || isGiveaway}
              type="text"
              defaultValue={item.listed_platform ?? ''}
              placeholder="eBay, Whatnot, Facebook, local..."
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Listed Date
            </label>
            <input
              name="listed_date"
              disabled={isLockedForBusinessEvent || isGiveaway}
              type="date"
              defaultValue={formatDateInput(item.listed_date)}
              className={`app-input ${isLockedForBusinessEvent ? 'cursor-not-allowed opacity-70' : ''}`}
            />
          </div>

          <div className="md:col-span-3 flex justify-end pt-1">
            {isLockedForBusinessEvent || isGiveaway ? (
              <span className="app-button pointer-events-none opacity-60">
                Listing Locked
              </span>
            ) : (
              <button type="submit" className="app-button">
                Save Listing Details
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="app-section mt-0 p-4">
        <h2 className="text-base font-semibold leading-tight">Item Details</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Detail label="Year" value={item.year?.toString() || '—'} />
          <Detail label="Player / Item Name" value={item.player_name || '—'} />
          <Detail label="#" value={item.card_number || '—'} />
          <Detail label="Brand" value={item.brand || '—'} />
          <Detail label="Parallel" value={item.parallel_name || '—'} />
          <Detail label="Team" value={item.team || '—'} />
          <Detail label="Item Type" value={item.item_type || '—'} />
          <Detail label="Location" value={item.storage_location || '—'} />
        </div>

        {item.notes ? (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Notes</div>
            <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm leading-relaxed">
              {item.notes}
            </div>
          </div>
        ) : null}
      </div>

      <div className="app-section mt-0 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold leading-tight">Record Trail</h2>
            <p className="mt-1 text-sm text-zinc-400">
              System record details for this inventory item.
            </p>
          </div>

          {item.source_break_id ? (
            <div className="flex flex-wrap gap-2">
              <Link href={relatedBreakHref} className="app-button">
                Break Details
              </Link>
              <Link href={relatedBreakAddItemsHref} className="app-button-primary">
                Add More Items
              </Link>
              <Link href={relatedBreakItemsHref} className="app-button">
                View Break Items
              </Link>
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Detail label="Source Type" value={buildSourceTypeLabel(item.source_type)} />
          <Detail label="Source Break" value={item.source_break_id ? relatedBreakTitle : '—'} />
          <Detail label="Created" value={formatDate(item.created_at)} />
          <Detail label="Updated" value={formatDate(item.updated_at)} />
        </div>
      </div>

      <div id="sales-history" className="app-table-wrap mt-0 overflow-hidden scroll-mt-24">
        <div className="border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-base font-semibold leading-tight">Sales History</h2>
          <p className="mt-1 text-xs leading-snug text-zinc-400">
            Reverse individual sales here. This is safest for partial quantity lots because each sale may belong to a different buyer or transaction.
          </p>
        </div>

        {sales.length === 0 ? (
          <div className="px-4 py-5 text-sm text-zinc-400">No sales recorded for this item.</div>
        ) : (
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th py-2">Status</th>
                  <th className="app-th py-2">Sale Date</th>
                  <th className="app-th py-2">Qty</th>
                  <th className="app-th py-2">Gross</th>
                  <th className="app-th py-2">Net</th>
                  <th className="app-th py-2">COGS</th>
                  <th className="app-th py-2">Profit</th>
                  <th className="app-th py-2">Platform</th>
                  <th className="app-th py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const reversed = !!sale.reversed_at

                  return (
                    <tr key={sale.id} className="app-tr">
                      <td className="app-td py-2.5">
                        {reversed ? (
                          <div className="leading-tight">
                            <div className="text-yellow-300">Reversed</div>
                            <div className="text-xs text-zinc-500">
                              {formatDateTime(sale.reversed_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-300">Active</span>
                        )}
                      </td>
                      <td className="app-td py-2.5">{sale.sale_date || '—'}</td>
                      <td className="app-td py-2.5">{sale.quantity_sold ?? 0}</td>
                      <td className="app-td py-2.5">{money(sale.gross_sale)}</td>
                      <td className="app-td py-2.5">{money(sale.net_proceeds)}</td>
                      <td className="app-td py-2.5">{money(sale.cost_of_goods_sold)}</td>
                      <td className="app-td py-2.5">{money(sale.profit)}</td>
                      <td className="app-td py-2.5">{sale.platform || '—'}</td>
                      <td className="app-td py-2.5">
                        {reversed ? (
                          <div className="text-xs text-zinc-500">
                            {sale.reversal_reason || 'Already reversed'}
                          </div>
                        ) : isLockedForBusinessEvent ? (
                          <div className="text-xs text-amber-300">
                            Locked after giveaway or write-off review
                          </div>
                        ) : (
                          <form action={reverseSaleAction} className="space-y-1.5">
                            <input type="hidden" name="sale_id" value={sale.id} />
                            <input type="hidden" name="inventory_item_id" value={item.id} />
                            <textarea
                              name="reversal_reason"
                              rows={2}
                              placeholder="Optional reversal reason"
                              className="app-textarea min-w-[200px]"
                            />
                            <button type="submit" className="app-button-danger">
                              Reverse This Sale
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-2 border-t border-zinc-800 p-4 md:grid-cols-3">
          <Detail label="Total Gross" value={money(totalGross)} />
          <Detail label="Total Net" value={money(totalNet)} />
          <Detail label="Total Profit" value={money(totalProfit)} />
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card-tight p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-base font-semibold leading-tight">{value}</div>
    </div>
  )
}
