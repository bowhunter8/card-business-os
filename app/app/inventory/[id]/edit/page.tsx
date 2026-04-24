import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateInventoryItemAction } from '@/app/actions/inventory'
import { deleteInventoryItemAction } from '@/app/actions/breaks'

type InventoryItem = {
  id: string
  status: string
  item_type: string
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number
  available_quantity: number
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_unit: number | null
  estimated_value_total: number | null
  storage_location: string | null
  notes: string | null
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

export default async function EditInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; from?: string; break_id?: string }>
}) {
  const { id } = await params
  const pageParams = searchParams ? await searchParams : undefined
  const pageError = pageParams?.error
  const from = pageParams?.from
  const breakId = pageParams?.break_id

  const cameFromBreak = from === 'break' && typeof breakId === 'string' && breakId.length > 0
  const backHref = cameFromBreak ? `/app/breaks/${breakId}` : `/app/inventory/${id}`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const response = await supabase
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
      notes
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (response.error || !response.data) {
    notFound()
  }

  const item = response.data as InventoryItem

  const itemLine = [
    item.title || item.player_name || 'Untitled item',
    item.year,
    item.brand,
    item.set_name,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]
    .filter(Boolean)
    .join(' • ')

  const currentQuantity = Number(item.quantity ?? 0)
  const currentAvailable = Number(item.available_quantity ?? 0)
  const soldQuantity = Math.max(0, currentQuantity - currentAvailable)
  const canDelete = soldQuantity === 0

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">Edit Inventory Item</h1>
          <p className="app-subtitle mt-1">{itemLine}</p>
          <div className="mt-2">{renderStatusPill(item.status)}</div>
        </div>

        <Link href={backHref} className="app-button">
          {cameFromBreak ? 'Back to Break' : 'Back to Item'}
        </Link>
      </div>

      {pageError ? <div className="app-alert-error">{pageError}</div> : null}

      <div className="app-section p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-zinc-400">Make changes and save anytime.</div>

          <div className="flex flex-wrap gap-2">
            <Link href={backHref} className="app-button">
              Cancel
            </Link>

            <button type="submit" form="edit-inventory-form" className="app-button-primary">
              Save Item Changes
            </button>
          </div>
        </div>
      </div>

      {!canDelete ? (
        <div className="app-alert-info">
          This item has sales history, so delete is disabled. Reverse the sale first if this was a
          mistake.
        </div>
      ) : null}

      {item.status === 'giveaway' ? (
        <div className="app-alert-info">
          This item is marked as Giveaway. If it was marked through the giveaway workflow, it should
          also have a matching Advertising / Marketing expense record.
        </div>
      ) : null}

      <div className="app-section p-4">
        <form
          id="edit-inventory-form"
          action={updateInventoryItemAction}
          className="grid gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="inventory_item_id" value={item.id} />
          <input type="hidden" name="from" value={from ?? ''} />
          <input type="hidden" name="break_id" value={breakId ?? ''} />

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Title
            </label>
            <input name="title" defaultValue={item.title ?? ''} className="app-input" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Player
            </label>
            <input name="player_name" defaultValue={item.player_name ?? ''} className="app-input" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Year
            </label>
            <input
              name="year"
              type="number"
              defaultValue={item.year ?? undefined}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Brand
            </label>
            <input name="brand" defaultValue={item.brand ?? ''} className="app-input" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Set Name
            </label>
            <input name="set_name" defaultValue={item.set_name ?? ''} className="app-input" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Card Number
            </label>
            <input name="card_number" defaultValue={item.card_number ?? ''} className="app-input" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Parallel
            </label>
            <input
              name="parallel_name"
              defaultValue={item.parallel_name ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Team
            </label>
            <input name="team" defaultValue={item.team ?? ''} className="app-input" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Quantity
            </label>
            <input
              name="quantity"
              type="number"
              defaultValue={item.quantity ?? 1}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Status
            </label>
            <select name="status" defaultValue={item.status ?? 'available'} className="app-select">
              <option value="available">For Sale</option>
              <option value="listed">Listed</option>
              <option value="personal">Personal</option>
              <option value="junk">Junk</option>
              <option value="giveaway">Giveaway</option>
            </select>
            <div className="mt-1 text-xs text-zinc-500">
              Use the Mark as Giveaway button on the item detail page when you want the giveaway
              expense created automatically.
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Storage Location
            </label>
            <input
              name="storage_location"
              defaultValue={item.storage_location ?? ''}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Estimated Value Per Unit
            </label>
            <input
              name="estimated_value_unit"
              type="number"
              step="0.01"
              defaultValue={item.estimated_value_unit ?? 0}
              className="app-input"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Notes
            </label>
            <textarea
              name="notes"
              rows={4}
              defaultValue={item.notes ?? ''}
              className="app-textarea"
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap justify-end gap-2 pt-2">
            <Link href={backHref} className="app-button">
              Cancel
            </Link>
            <button type="submit" className="app-button-primary">
              Save Item Changes
            </button>
          </div>
        </form>

        {canDelete ? (
          <div className="mt-4 flex justify-end">
            <form action={deleteInventoryItemAction}>
              <input type="hidden" name="inventory_item_id" value={item.id} />
              <button className="app-button-danger">Delete Item</button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  )
}