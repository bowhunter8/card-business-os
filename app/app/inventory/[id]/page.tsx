import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'
import { updateInventoryListingAction } from '@/app/actions/inventory-listing'
import { updateInventoryItemAction } from '@/app/actions/inventory'
import { markAsGiveawayAction } from '@/app/actions/inventory-giveaway'
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

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
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
    item.set_name,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.notes,
  ]

  return parts.filter(Boolean).join(' • ')
}

function renderStatusPill(status: string | null) {
  if (status === 'available') {
    return <span className="app-badge app-badge-success">For Sale</span>
  }

  if (status === 'listed') {
    return <span className="app-badge app-badge-info">Listed</span>
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
}: {
  label: string
  name: string
  defaultValue: string | number
  type?: 'text' | 'number'
  step?: string | number
  min?: string | number
  formId: string
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
        className="app-input mt-1.5"
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
}: {
  label: string
  name: string
  defaultValue: string
  formId: string
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
        className="app-select mt-1.5"
      >
        <option value="available">For Sale</option>
        <option value="listed">Listed</option>
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
  searchParams?: Promise<{ error?: string; success?: string; savedSale?: string; updatedSale?: string; deletedSale?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : undefined
  const errorMessage = query?.error

  const successMessage =
    query?.savedSale === '1'
      ? 'Sale recorded successfully.'
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

  const [itemResponse, salesResponse] = await Promise.all([
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
  ])

  if (itemResponse.error || !itemResponse.data) {
    notFound()
  }

  const item = itemResponse.data as InventoryItem
  const sales: SaleRow[] = (salesResponse.data ?? []) as SaleRow[]

  const activeSales = sales.filter((sale) => !sale.reversed_at)

  const totalGross = activeSales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  const totalNet = activeSales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0)
  const totalProfit = activeSales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)
  const totalQtySold = activeSales.reduce((sum, row) => sum + Number(row.quantity_sold ?? 0), 0)

  const availableQuantity = Number(item.available_quantity ?? 0)
  const hasAvailableToSell = availableQuantity > 0
  const latestActiveSale = activeSales[0] ?? null
  const canDelete = activeSales.length === 0
  const itemFormId = 'inventory-inline-edit-form'
  const itemName = buildDisplay(item) || item.title || item.player_name || 'Untitled item'

  return (
    <div className="app-page-wide space-y-3">
      <form id={itemFormId} action={updateInventoryItemAction}>
        <input type="hidden" name="inventory_item_id" value={item.id} />
      </form>

      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <div className="mb-1">
            <Link href="/app/inventory" className="text-xs text-zinc-400 hover:underline">
              ← Back to Inventory
            </Link>
          </div>

          <h1 className="app-title text-2xl leading-tight">Inventory Item</h1>
          <p className="app-subtitle mt-1 text-sm leading-snug">
            {buildDisplay(item) || item.title || 'Untitled item'}
          </p>
          <div className="mt-1.5">{renderStatusPill(item.status)}</div>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <button type="submit" form={itemFormId} className="app-button">
            Save Changes
          </button>

          <Link href={`/app/inventory/${item.id}/edit`} className="app-button">
            Edit Page
          </Link>

          {hasAvailableToSell ? (
            <>
              <Link href={`/app/inventory/${item.id}/sell`} className="app-button-primary">
                Sell Item
              </Link>

              <form action={markAsGiveawayAction}>
                <input type="hidden" name="inventory_item_id" value={item.id} />
                <button type="submit" className="app-button-warning">
                  Mark as Giveaway
                </button>
              </form>
            </>
          ) : latestActiveSale ? (
            <form action={reverseSaleAction}>
              <input type="hidden" name="sale_id" value={latestActiveSale.id} />
              <input type="hidden" name="inventory_item_id" value={item.id} />
              <input
                type="hidden"
                name="reversal_reason"
                value="Quick reverse from inventory item header"
              />
              <button type="submit" className="app-button-danger">
                Reverse Sale
              </button>
            </form>
          ) : null}

          {canDelete ? (
            <DeleteInventoryItemButton itemId={item.id} itemName={itemName} />
          ) : null}
        </div>
      </div>

      {errorMessage ? <div className="app-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="app-alert-success">{successMessage}</div> : null}

      {(item.status === 'personal' || item.status === 'giveaway' || item.status === 'junk') ? (
        <div className="app-alert-warning">
          This status change affects tax reporting. Ensure this item is not also counted as an expense or inventory elsewhere to avoid double counting.
        </div>
      ) : null}


      {item.status === 'junk' ? (
        <div className="app-alert-info">
          This item is marked as Junk and is being kept for recordkeeping, not active selling.
        </div>
      ) : null}

      {item.status === 'personal' ? (
        <div className="app-alert-info">
          This item is marked as Personal Collection and is not currently part of your active sell inventory.
        </div>
      ) : null}

      {item.status === 'giveaway' ? (
        <div className="app-alert-info">
          This item has been marked as a Giveaway and recorded as a marketing expense.
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-4">
        <EditableSelect
          label="Status"
          name="status"
          defaultValue={item.status ?? 'available'}
          formId={itemFormId}
        />

        <EditableField
          label="Quantity"
          name="quantity"
          type="number"
          min={1}
          defaultValue={item.quantity ?? 0}
          formId={itemFormId}
        />

        <ReadonlyMetric label="Available" value={item.available_quantity ?? 0} />
        <ReadonlyMetric label="Qty Sold" value={totalQtySold} />
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <ReadonlyMetric label="Unit Cost" value={money(item.cost_basis_unit)} />
        <ReadonlyMetric label="Total Cost" value={money(item.cost_basis_total)} />
        <EstimateValueMetric item={item} formId={itemFormId} />
      </div>

      <div className="app-section mt-0 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold leading-tight">Quick Edit Item</h2>

          <button type="submit" form={itemFormId} className="app-button">
            Save Changes
          </button>
        </div>

        <div className="mt-3 grid gap-2.5 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Title
            </label>
            <input
              form={itemFormId}
              name="title"
              type="text"
              defaultValue={item.title ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Item Name
            </label>
            <input
              form={itemFormId}
              name="player_name"
              type="text"
              defaultValue={item.player_name ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Year
            </label>
            <input
              form={itemFormId}
              name="year"
              type="number"
              defaultValue={item.year ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Set
            </label>
            <input
              form={itemFormId}
              name="set_name"
              type="text"
              defaultValue={item.set_name ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Item #
            </label>
            <input
              form={itemFormId}
              name="card_number"
              type="text"
              defaultValue={item.card_number ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Brand
            </label>
            <input
              form={itemFormId}
              name="brand"
              type="text"
              defaultValue={item.brand ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Parallel
            </label>
            <input
              form={itemFormId}
              name="parallel_name"
              type="text"
              defaultValue={item.parallel_name ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Team
            </label>
            <input
              form={itemFormId}
              name="team"
              type="text"
              defaultValue={item.team ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Storage Location
            </label>
            <input
              form={itemFormId}
              name="storage_location"
              type="text"
              defaultValue={item.storage_location ?? ''}
              className="app-input"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Notes
            </label>
            <textarea
              form={itemFormId}
              name="notes"
              rows={3}
              defaultValue={item.notes ?? ''}
              className="app-textarea"
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
              type="number"
              min={0}
              step="0.01"
              defaultValue={item.listed_price != null ? Number(item.listed_price).toFixed(2) : ''}
              placeholder="0.00"
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Listed Platform
            </label>
            <input
              name="listed_platform"
              type="text"
              defaultValue={item.listed_platform ?? ''}
              placeholder="eBay, Whatnot, Facebook, local..."
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-300">
              Listed Date
            </label>
            <input
              name="listed_date"
              type="date"
              defaultValue={formatDateInput(item.listed_date)}
              className="app-input"
            />
          </div>

          <div className="md:col-span-3 flex justify-end pt-1">
            <button type="submit" className="app-button">
              Save Listing Details
            </button>
          </div>
        </form>
      </div>

      <div className="app-section mt-0 p-4">
        <h2 className="text-base font-semibold leading-tight">Item Details</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Detail label="Year" value={item.year?.toString() || '—'} />
          <Detail label="Set" value={item.set_name || '—'} />
          <Detail label="Item Name" value={item.player_name || '—'} />
          <Detail label="Item #" value={item.card_number || '—'} />
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
        <h2 className="text-base font-semibold leading-tight">Record Trail</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Detail label="Source Type" value={item.source_type || '—'} />
          <Detail label="Source Break ID" value={item.source_break_id || '—'} />
          <Detail label="Created" value={formatDate(item.created_at)} />
          <Detail label="Updated" value={formatDate(item.updated_at)} />
        </div>

        {item.source_break_id ? (
          <div className="mt-2">
            <Link
              href={`/app/breaks/${item.source_break_id}`}
              className="text-sm text-zinc-300 hover:underline"
            >
              View Related Break
            </Link>
          </div>
        ) : null}
      </div>

      <div className="app-table-wrap mt-0 overflow-hidden">
        <div className="border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-base font-semibold leading-tight">Sales History</h2>
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
                              Reverse Sale
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
