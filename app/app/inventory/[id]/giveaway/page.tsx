import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { markAsGiveawayAction } from '@/app/actions/inventory-giveaway'

type InventoryItem = {
  id: string
  status: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_unit: number | null
  estimated_value_total: number | null
  notes: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function todayLocalInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDisplay(item: InventoryItem) {
  const parts = [
    item.player_name,
    item.year,
    item.brand,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]

  return parts.filter(Boolean).join(' • ')
}

export default async function GiveawayItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : undefined

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      id,
      status,
      title,
      player_name,
      year,
      brand,
      card_number,
      parallel_name,
      team,
      quantity,
      available_quantity,
      cost_basis_unit,
      cost_basis_total,
      estimated_value_unit,
      estimated_value_total,
      notes
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    notFound()
  }

  const item = data as InventoryItem
  const availableQuantity = Number(item.available_quantity ?? 0)
  const quantity = Number(item.quantity ?? 0)
  const unitCost = Number(item.cost_basis_unit ?? 0)
  const totalCost = Number(item.cost_basis_total ?? 0)

  const giveawayCostBasis =
    availableQuantity > 0 && unitCost > 0
      ? availableQuantity * unitCost
      : availableQuantity > 0 && quantity > 0 && totalCost > 0
        ? (totalCost / quantity) * availableQuantity
        : totalCost

  const itemName = buildDisplay(item) || item.title || item.player_name || 'Untitled item'
  const isGiveawayStatus = item.status === 'giveaway'
  const isPlannedGiveaway = isGiveawayStatus && availableQuantity > 0
  const isCompletedGiveaway = isGiveawayStatus && availableQuantity <= 0
  const canRecordGiveaway = availableQuantity > 0
  const pageTitle = isPlannedGiveaway ? 'Finalize Giveaway' : 'Record Giveaway'
  const primaryButtonLabel = isPlannedGiveaway ? 'Finalize Giveaway' : 'Record Giveaway'

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <div className="mb-1">
            <Link href={`/app/inventory/${item.id}`} className="text-xs text-zinc-400 hover:underline">
              ← Back to Item
            </Link>
          </div>

          <h1 className="app-title">{pageTitle}</h1>
          <p className="app-subtitle">
            {isPlannedGiveaway
              ? 'Add the final giveaway details before creating the advertising / marketing record.'
              : 'Capture the business purpose before removing this item from sellable inventory.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/app/inventory/${item.id}`} className="app-button">
            Cancel
          </Link>
        </div>
      </div>

      {query?.error ? (
        <div className="app-alert-error">
          {query.error}
        </div>
      ) : null}

      {isPlannedGiveaway ? (
        <div className="app-alert-info">
          This item is marked as a planned giveaway. Finalize it when the giveaway actually happens.
        </div>
      ) : null}

      {isCompletedGiveaway ? (
        <div className="app-alert-info">
          This giveaway has already been finalized.
        </div>
      ) : null}

      {!isCompletedGiveaway && availableQuantity <= 0 ? (
        <div className="app-alert-warning">
          This item has no available quantity to give away.
        </div>
      ) : null}

      <div className="sticky top-3 z-40 rounded-2xl border border-zinc-800 bg-zinc-950/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-100">
              {isPlannedGiveaway ? 'Ready to finalize this planned giveaway?' : 'Ready to record this giveaway?'}
            </div>
            <div className="text-xs text-zinc-400">
              Save the giveaway details without scrolling to the bottom.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              form="giveaway-form"
              disabled={!canRecordGiveaway}
              className="app-button-warning disabled:cursor-not-allowed disabled:opacity-50"
            >
              {primaryButtonLabel}
            </button>

            <Link href={`/app/inventory/${item.id}`} className="app-button">
              Cancel
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form id="giveaway-form" action={markAsGiveawayAction} className="app-section space-y-4 p-5">
          <input type="hidden" name="inventory_item_id" value={item.id} />
          <input type="hidden" name="giveaway_item_name" value={itemName} />
          <input type="hidden" name="giveaway_cost_basis" value={giveawayCostBasis.toFixed(2)} />
          <input type="hidden" name="giveaway_quantity" value={String(availableQuantity)} />

          <div>
            <h2 className="text-lg font-semibold">Giveaway Details</h2>
            <p className="mt-1 text-sm text-zinc-400">
              These details help support the advertising / marketing purpose of the giveaway.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">
                Giveaway Date *
              </label>
              <input
                name="giveaway_date"
                type="date"
                required
                defaultValue={todayLocalInputValue()}
                disabled={!canRecordGiveaway}
                className="app-input disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">
                Giveaway Type *
              </label>
              <select
                name="giveaway_type"
                required
                defaultValue="buyer_appreciation"
                disabled={!canRecordGiveaway}
                className="app-select disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="buyer_appreciation">Buyer Appreciation</option>
                <option value="livestream_giveaway">Livestream Giveaway</option>
                <option value="social_media_promotion">Social Media Promotion</option>
                <option value="customer_retention">Customer Retention</option>
                <option value="contest_prize">Contest Prize</option>
                <option value="show_or_event">Show / Event Giveaway</option>
                <option value="community_outreach">Community Outreach</option>
                <option value="promotional_item">Promotional Item</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">
                Recipient Type
              </label>
              <select
                name="recipient_type"
                defaultValue="viewer_or_customer"
                disabled={!canRecordGiveaway}
                className="app-select disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="viewer_or_customer">Viewer / Customer</option>
                <option value="buyer">Buyer</option>
                <option value="repeat_customer">Repeat Customer</option>
                <option value="prospective_customer">Prospective Customer</option>
                <option value="event_attendee">Event Attendee</option>
                <option value="community_group">Community Group</option>
                <option value="not_recorded">Not Recorded</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">
                Campaign / Event
              </label>
              <input
                name="campaign_event"
                type="text"
                disabled={!canRecordGiveaway}
                placeholder="Friday night stream, trade show, customer promo..."
                className="app-input disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">
                Related Order / Sale #
              </label>
              <input
                name="related_order"
                type="text"
                disabled={!canRecordGiveaway}
                placeholder="Optional order, invoice, or stream reference"
                className="app-input disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">
                Quantity Given Away
              </label>
              <input
                name="display_quantity"
                type="number"
                value={availableQuantity}
                readOnly
                className="app-input cursor-not-allowed bg-zinc-900 opacity-80"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">
              Business Purpose *
            </label>

            <select
              name="business_purpose"
              required
              defaultValue="customer_retention"
              disabled={!canRecordGiveaway}
              className="app-select disabled:cursor-not-allowed disabled:opacity-70"
            >
              <option value="customer_retention">Customer Retention</option>
              <option value="buyer_appreciation">Buyer Appreciation</option>
              <option value="new_customer_acquisition">New Customer Acquisition</option>
              <option value="stream_promotion">Stream Promotion</option>
              <option value="whatnot_promotion">Whatnot Promotion</option>
              <option value="card_show_promotion">Card Show Promotion</option>
              <option value="social_media_promotion">Social Media Promotion</option>
              <option value="brand_awareness">Brand Awareness</option>
              <option value="community_outreach">Community Outreach</option>
              <option value="contest_prize_support">Contest Prize Support</option>
              <option value="other">Other (requires notes)</option>
            </select>

            <p className="mt-1 text-xs text-zinc-500">
              Select the primary business reason for the giveaway. This keeps tax records and CPA reports consistent.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">
              Notes
            </label>
            <textarea
              name="giveaway_notes"
              rows={3}
              disabled={!canRecordGiveaway}
              placeholder="Required when Business Purpose is Other. Optional for all other purposes."
              className="app-textarea disabled:cursor-not-allowed disabled:opacity-70"
            />
          </div>

          <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-100">
            <div className="font-semibold">Tax-safe reminder</div>
            <div className="mt-1 leading-6">
              Finalizing this giveaway will move the remaining cost basis into Advertising / Marketing. Do not also deduct this item as COGS, disposal, donation, or another separate expense.
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Link href={`/app/inventory/${item.id}`} className="app-button">
              Cancel
            </Link>

            <button
              type="submit"
              disabled={!canRecordGiveaway}
              className="app-button-warning disabled:cursor-not-allowed disabled:opacity-50"
            >
              {primaryButtonLabel}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="app-section p-5">
            <h2 className="text-lg font-semibold">Item Summary</h2>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-400">Item</div>
                <div className="mt-1 font-semibold text-zinc-100">{itemName}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="app-card-tight p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Status</div>
                  <div className="mt-1 font-semibold capitalize">
                    {isPlannedGiveaway
                      ? 'Planned Giveaway'
                      : isCompletedGiveaway
                        ? 'Completed Giveaway'
                        : (item.status || 'unknown').replaceAll('_', ' ')}
                  </div>
                </div>

                <div className="app-card-tight p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Available</div>
                  <div className="mt-1 font-semibold">{availableQuantity}</div>
                </div>

                <div className="app-card-tight p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Unit Cost</div>
                  <div className="mt-1 font-semibold">{money(item.cost_basis_unit)}</div>
                </div>

                <div className="app-card-tight p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Giveaway Cost Basis</div>
                  <div className="mt-1 font-semibold">{money(giveawayCostBasis)}</div>
                </div>

                <div className="app-card-tight p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Estimated Value</div>
                  <div className="mt-1 font-semibold">{money(item.estimated_value_unit)}</div>
                </div>
              </div>
            </div>
          </section>

          <section className={isPlannedGiveaway ? 'app-alert-warning' : 'app-alert-info'}>
            <div className="font-semibold">What happens next?</div>
            <div className="mt-1 text-sm leading-6">
              {isCompletedGiveaway
                ? 'This giveaway has already been finalized and should already have tax support records.'
                : 'HITS will finalize this giveaway, remove it from available inventory, create an Advertising / Marketing expense, and add an audit trail record.'}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
