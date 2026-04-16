import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'
import { updateInventoryListingAction } from '@/app/actions/inventory-listing'
import { updateInventoryItemAction } from '@/app/actions/inventory'
import { deleteInventoryItemAction } from '@/app/actions/breaks'

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
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
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
    <div className="app-metric-card">
      <label className="text-sm text-zinc-400" htmlFor={name}>
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
        className="app-input mt-2"
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
    <div className="app-metric-card">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
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
    <div className="app-metric-card">
      <label className="text-sm text-zinc-400" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        form={formId}
        name={name}
        defaultValue={defaultValue}
        className="app-select mt-2"
      >
        <option value="available">For Sale</option>
        <option value="listed">Listed</option>
        <option value="personal">Personal</option>
        <option value="junk">Junk</option>
      </select>
    </div>
  )
}

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : undefined
  const errorMessage = query?.error
  const successMessage = query?.success

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const itemResponse = await supabase
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
    .single()

  if (itemResponse.error || !itemResponse.data) {
    notFound()
  }

  const item = itemResponse.data as InventoryItem

  const salesResponse = await supabase
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
    .eq('inventory_item_id', item.id)
    .order('sale_date', { ascending: false })

  const sales: SaleRow[] = (salesResponse.data ?? []) as SaleRow[]

  const activeSales = sales.filter((sale) => !sale.reversed_at)

  const totalGross = activeSales.reduce(
    (sum, row) => sum + Number(row.gross_sale ?? 0),
    0
  )
  const totalNet = activeSales.reduce(
    (sum, row) => sum + Number(row.net_proceeds ?? 0),
    0
  )
  const totalProfit = activeSales.reduce(
    (sum, row) => sum + Number(row.profit ?? 0),
    0
  )
  const totalQtySold = activeSales.reduce(
    (sum, row) => sum + Number(row.quantity_sold ?? 0),
    0
  )

  const availableQuantity = Number(item.available_quantity ?? 0)
  const hasAvailableToSell = availableQuantity > 0
  const latestActiveSale = activeSales[0] ?? null
  const canDelete = activeSales.length === 0
  const itemFormId = 'inventory-inline-edit-form'

  return (
    <div className="app-page-wide">
      <form id={itemFormId} action={updateInventoryItemAction}>
        <input type="hidden" name="inventory_item_id" value={item.id} />
      </form>

      <div className="app-page-header">
        <div>
          <div className="mb-1">
            <Link href="/app/inventory" className="text-sm text-zinc-400 hover:underline">
              ← Back to Inventory
            </Link>
          </div>

          <h1 className="app-title">Inventory Item</h1>
          <p className="app-subtitle">
            {buildDisplay(item) || item.title || 'Untitled item'}
          </p>
          <div className="mt-2">{renderStatusPill(item.status)}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" form={itemFormId} className="app-button">
            Save Changes
          </button>

          <Link href={`/app/inventory/${item.id}/edit`} className="app-button">
            Edit Page
          </Link>

          {hasAvailableToSell ? (
            <Link href={`/app/inventory/${item.id}/sell`} className="app-button-primary">
              Sell Item
            </Link>
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
            <form action={deleteInventoryItemAction}>
              <input type="hidden" name="inventory_item_id" value={item.id} />
              <input type="hidden" name="return_to" value="inventory" />
              <input type="hidden" name="break_id" value={item.source_break_id ?? ''} />
              <button type="submit" className="app-button-danger">
                Delete Item
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {errorMessage ? <div className="app-alert-error mt-4">{errorMessage}</div> : null}
      {successMessage ? <div className="app-alert-success mt-4">{successMessage}</div> : null}

      {!canDelete ? (
        <div className="app-alert-warning mt-4">
          This item cannot be deleted while it has active sales. Reverse the sale first.
        </div>
      ) : null}

      {item.status === 'junk' ? (
        <div className="app-alert-info mt-4">
          This item is marked as Junk and is being kept for recordkeeping, not active selling.
        </div>
      ) : null}

      {item.status === 'personal' ? (
        <div className="app-alert-info mt-4">
          This item is marked as Personal Collection and is not currently part of your active sell inventory.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
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

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <ReadonlyMetric label="Unit Cost" value={money(item.cost_basis_unit)} />
        <ReadonlyMetric label="Total Cost" value={money(item.cost_basis_total)} />

        <EditableField
          label="Est. Value / Unit"
          name="estimated_value_unit"
          type="number"
          step="0.01"
          min={0}
          defaultValue={item.estimated_value_unit ?? 0}
          formId={itemFormId}
        />

        <ReadonlyMetric label="Est. Value Total" value={money(item.estimated_value_total)} />
      </div>

      <div className="app-section mt-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">Quick Edit Item</h2>

          <button type="submit" form={itemFormId} className="app-button">
            Save Changes
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Title</label>
            <input
              form={itemFormId}
              name="title"
              type="text"
              defaultValue={item.title ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Player</label>
            <input
              form={itemFormId}
              name="player_name"
              type="text"
              defaultValue={item.player_name ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Year</label>
            <input
              form={itemFormId}
              name="year"
              type="number"
              defaultValue={item.year ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Set</label>
            <input
              form={itemFormId}
              name="set_name"
              type="text"
              defaultValue={item.set_name ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Card #</label>
            <input
              form={itemFormId}
              name="card_number"
              type="text"
              defaultValue={item.card_number ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Brand</label>
            <input
              form={itemFormId}
              name="brand"
              type="text"
              defaultValue={item.brand ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Parallel</label>
            <input
              form={itemFormId}
              name="parallel_name"
              type="text"
              defaultValue={item.parallel_name ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Team</label>
            <input
              form={itemFormId}
              name="team"
              type="text"
              defaultValue={item.team ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Storage Location</label>
            <input
              form={itemFormId}
              name="storage_location"
              type="text"
              defaultValue={item.storage_location ?? ''}
              className="app-input"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-sm text-zinc-300">Notes</label>
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

      <div className="app-section mt-4">
        <h2 className="text-lg font-semibold">Listing Details</h2>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Detail
            label="Listed Price"
            value={item.listed_price != null ? money(item.listed_price) : '—'}
          />
          <Detail label="Listed Platform" value={item.listed_platform || '—'} />
          <Detail label="Listed Date" value={formatDate(item.listed_date)} />
        </div>

        <form action={updateInventoryListingAction} className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="inventory_item_id" value={item.id} />

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Listed Price</label>
            <input
              name="listed_price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={
                item.listed_price != null ? Number(item.listed_price).toFixed(2) : ''
              }
              placeholder="0.00"
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Listed Platform</label>
            <input
              name="listed_platform"
              type="text"
              defaultValue={item.listed_platform ?? ''}
              placeholder="eBay, Whatnot, Facebook, local..."
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Listed Date</label>
            <input
              name="listed_date"
              type="date"
              defaultValue={formatDateInput(item.listed_date)}
              className="app-input"
            />
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button type="submit" className="app-button">
              Save Listing Details
            </button>
          </div>
        </form>
      </div>

      <div className="app-section mt-4">
        <h2 className="text-lg font-semibold">Card Details</h2>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Detail label="Year" value={item.year?.toString() || '—'} />
          <Detail label="Set" value={item.set_name || '—'} />
          <Detail label="Player" value={item.player_name || '—'} />
          <Detail label="Card #" value={item.card_number || '—'} />
          <Detail label="Brand" value={item.brand || '—'} />
          <Detail label="Parallel" value={item.parallel_name || '—'} />
          <Detail label="Team" value={item.team || '—'} />
          <Detail label="Item Type" value={item.item_type || '—'} />
          <Detail label="Location" value={item.storage_location || '—'} />
        </div>

        {item.notes ? (
          <div className="mt-3">
            <div className="text-sm text-zinc-400">Notes</div>
            <div className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              {item.notes}
            </div>
          </div>
        ) : null}
      </div>

      <div className="app-section mt-4">
        <h2 className="text-lg font-semibold">Record Trail</h2>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Detail label="Source Type" value={item.source_type || '—'} />
          <Detail label="Source Break ID" value={item.source_break_id || '—'} />
          <Detail label="Created" value={formatDate(item.created_at)} />
          <Detail label="Updated" value={formatDate(item.updated_at)} />
        </div>

        {item.source_break_id ? (
          <div className="mt-3">
            <Link
              href={`/app/breaks/${item.source_break_id}`}
              className="text-sm text-zinc-300 hover:underline"
            >
              View Related Break
            </Link>
          </div>
        ) : null}
      </div>

      <div className="app-table-wrap mt-4">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-lg font-semibold">Sales History</h2>
        </div>

        {sales.length === 0 ? (
          <div className="px-4 py-6 text-zinc-400">No sales recorded for this item.</div>
        ) : (
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">Status</th>
                  <th className="app-th">Sale Date</th>
                  <th className="app-th">Qty</th>
                  <th className="app-th">Gross</th>
                  <th className="app-th">Net</th>
                  <th className="app-th">COGS</th>
                  <th className="app-th">Profit</th>
                  <th className="app-th">Platform</th>
                  <th className="app-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const reversed = !!sale.reversed_at

                  return (
                    <tr key={sale.id} className="app-tr">
                      <td className="app-td">
                        {reversed ? (
                          <div>
                            <div className="text-yellow-300">Reversed</div>
                            <div className="text-xs text-zinc-500">
                              {formatDateTime(sale.reversed_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-300">Active</span>
                        )}
                      </td>
                      <td className="app-td">{sale.sale_date || '—'}</td>
                      <td className="app-td">{sale.quantity_sold ?? 0}</td>
                      <td className="app-td">{money(sale.gross_sale)}</td>
                      <td className="app-td">{money(sale.net_proceeds)}</td>
                      <td className="app-td">{money(sale.cost_of_goods_sold)}</td>
                      <td className="app-td">{money(sale.profit)}</td>
                      <td className="app-td">{sale.platform || '—'}</td>
                      <td className="app-td">
                        {reversed ? (
                          <div className="text-xs text-zinc-500">
                            {sale.reversal_reason || 'Already reversed'}
                          </div>
                        ) : (
                          <form action={reverseSaleAction} className="space-y-2">
                            <input type="hidden" name="sale_id" value={sale.id} />
                            <input type="hidden" name="inventory_item_id" value={item.id} />
                            <textarea
                              name="reversal_reason"
                              rows={2}
                              placeholder="Optional reversal reason"
                              className="app-textarea min-w-[220px]"
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

        <div className="grid gap-3 border-t border-zinc-800 p-4 md:grid-cols-3">
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
    <div className="app-card-tight">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}