import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSaleAction } from '@/app/actions/sales'
import { createClient } from '@/lib/supabase/server'

type ShippingProfile = {
  id: string
  name: string
  shipping_charged_default: number | null
  supplies_cost_default: number | null
}

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function buildItemLabel(item: {
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
}) {
  return [
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
}

function todayLocalInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default async function SellInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select(`
      id,
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
      status
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (itemError || !item) {
    notFound()
  }

  const { data: shippingProfilesRaw } = await supabase
    .from('shipping_profiles')
    .select('id, name, shipping_charged_default, supplies_cost_default')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  const shippingProfiles: ShippingProfile[] = (shippingProfilesRaw ?? []) as ShippingProfile[]
  const itemLabel = buildItemLabel(item)

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Sell Inventory Item</h1>
          <p className="mt-2 text-zinc-400">{itemLabel}</p>
        </div>

        <Link
          href={`/app/inventory/${item.id}`}
          className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          Back to Item
        </Link>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Detail label="Status" value={item.status || '—'} />
        <Detail label="Available Quantity" value={String(item.available_quantity ?? 0)} />
        <Detail label="Unit Cost Basis" value={money(item.cost_basis_unit)} />
        <Detail label="Total Cost Basis" value={money(item.cost_basis_total)} />
      </div>

      <form
        action={createSaleAction}
        className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2"
      >
        <input type="hidden" name="inventory_item_id" value={item.id} />

        <Field label="Sale Date">
          <input
            name="sale_date"
            type="date"
            required
            defaultValue={todayLocalInputValue()}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Quantity Sold">
          <input
            name="quantity_sold"
            type="number"
            min={1}
            max={item.available_quantity ?? 1}
            defaultValue={1}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Shipping Profile">
          <select
            name="shipping_profile_id"
            defaultValue=""
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          >
            <option value="">No profile</option>
            {shippingProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Item Sale Price">
          <input
            name="gross_sale"
            type="number"
            min={0}
            step="0.01"
            defaultValue="0.00"
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Shipping Charged">
          <input
            name="shipping_charged"
            type="number"
            min={0}
            step="0.01"
            defaultValue="0.00"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Platform Fees">
          <input
            name="platform_fees"
            type="number"
            min={0}
            step="0.01"
            defaultValue="0.00"
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Actual Postage Cost">
          <input
            name="shipping_cost"
            type="number"
            min={0}
            step="0.01"
            defaultValue="0.00"
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Supplies Cost">
          <input
            name="supplies_cost"
            type="number"
            min={0}
            step="0.01"
            defaultValue="0.00"
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Other Costs">
          <input
            name="other_costs"
            type="number"
            min={0}
            step="0.01"
            defaultValue="0.00"
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <Field label="Platform">
          <input
            name="platform"
            type="text"
            placeholder="eBay, Whatnot, etc."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </Field>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-zinc-300">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2 flex justify-end gap-3 pt-2">
          <Link
            href={`/app/inventory/${item.id}`}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200">
            Record Sale
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-300">{label}</label>
      {children}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  )
}