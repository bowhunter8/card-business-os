import Link from 'next/link'
import { notFound } from 'next/navigation'
import Script from 'next/script'
import { createSaleAction } from '@/app/actions/sales'
import { createClient } from '@/lib/supabase/server'

type ShippingProfile = {
  id: string
  name: string
  shipping_charged_default: number | null
  supplies_cost_default: number | null
}

type InventoryItem = {
  id: string
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
  status: string | null
  item_type?: string | null
}

function money(value: number | null | undefined) {
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

  const { data: itemRaw, error: itemError } = await supabase
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
      status,
      item_type
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (itemError || !itemRaw) {
    notFound()
  }

  const item = itemRaw as InventoryItem
  const availableQty = Number(item.available_quantity ?? 0)

  const { data: shippingProfilesRaw } = await supabase
    .from('shipping_profiles')
    .select('id, name, shipping_charged_default, supplies_cost_default')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  const shippingProfiles: ShippingProfile[] = (shippingProfilesRaw ?? []) as ShippingProfile[]
  const itemLabel = buildItemLabel(item)
  const unitCost = Number(item.cost_basis_unit ?? 0)
  const totalQuantity = Number(item.quantity ?? 0)
  const isLotLike = availableQty > 1 || totalQuantity > 1

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <div className="mb-1">
            <Link href={`/app/inventory/${item.id}`} className="text-xs text-zinc-400 hover:underline">
              ← Back to Item
            </Link>
          </div>
          <h1 className="app-title">Sell Item</h1>
          <p className="app-subtitle mt-1 break-words">{itemLabel}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/app/inventory/${item.id}`} className="app-button">
            Back to Item
          </Link>
        </div>
      </div>

      {error ? <div className="app-alert-error">{error}</div> : null}

      {availableQty <= 0 ? (
        <div className="app-alert-warning">
          This item has no available quantity to sell.
        </div>
      ) : null}

      {isLotLike ? (
        <div className="app-alert-info">
          This item has quantity remaining. You can sell part of the lot by choosing how many to sell below.
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-5">
        <Detail label="Status" value={item.status || '—'} />
        <Detail label="Item Type" value={item.item_type || '—'} />
        <Detail label="Available" value={String(availableQty)} />
        <Detail label="Unit Cost" value={money(unitCost)} />
        <Detail label="Total Cost" value={money(item.cost_basis_total)} />
      </div>

      <form
        action={createSaleAction}
        className="app-section mt-0"
        id="sell-item-form"
      >
        <input type="hidden" name="inventory_item_id" value={item.id} />

        <div className="grid gap-3 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Sale Date">
                <input
                  name="sale_date"
                  type="date"
                  required
                  defaultValue={todayLocalInputValue()}
                  className="app-input"
                />
              </Field>

              <Field label="Quantity Sold">
                <input
                  id="quantity_sold"
                  name="quantity_sold"
                  type="number"
                  min={1}
                  max={availableQty > 0 ? availableQty : 1}
                  defaultValue={1}
                  required
                  className="app-input"
                  disabled={availableQty <= 0}
                />
              </Field>

              <Field label="After Sale">
                <input
                  id="remaining_after_sale"
                  type="text"
                  value={String(Math.max(availableQty - 1, 0))}
                  readOnly
                  className="app-input bg-zinc-900"
                />
              </Field>

              <div className="app-card-tight p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-400">Quick Qty</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="app-button"
                    data-set-qty="1"
                    disabled={availableQty <= 0}
                  >
                    Sell 1
                  </button>
                  <button
                    type="button"
                    className="app-button"
                    data-set-qty={String(availableQty > 0 ? availableQty : 1)}
                    disabled={availableQty <= 0}
                  >
                    Sell All
                  </button>
                </div>
              </div>
            </div>

            <div className="app-section-tight space-y-2.5">
              <div className="text-sm font-semibold">Sale Amounts</div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Item Sale Price">
                  <input
                    id="gross_sale"
                    name="gross_sale"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue="0.00"
                    required
                    className="app-input"
                    disabled={availableQty <= 0}
                  />
                </Field>

                <Field label="Shipping Charged">
                  <input
                    id="shipping_charged"
                    name="shipping_charged"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue="0.00"
                    className="app-input"
                    disabled={availableQty <= 0}
                  />
                </Field>

                <Field label="Platform Fees">
                  <input
                    id="platform_fees"
                    name="platform_fees"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue="0.00"
                    required
                    className="app-input"
                    disabled={availableQty <= 0}
                  />
                </Field>

                <Field label="Other Costs">
                  <input
                    id="other_costs"
                    name="other_costs"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue="0.00"
                    required
                    className="app-input"
                    disabled={availableQty <= 0}
                  />
                </Field>
              </div>
            </div>

            <div className="app-section-tight space-y-2.5">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="text-sm font-semibold">Shipping</div>
                <div className="text-xs text-zinc-400">
                  Profiles fill shipping charged + supplies. Actual postage stays manual.
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <Field label="Shipping Profile">
                  <select
                    id="shipping_profile_id"
                    name="shipping_profile_id"
                    defaultValue=""
                    className="app-select"
                    disabled={availableQty <= 0}
                  >
                    <option value="">No profile</option>
                    {shippingProfiles.map((profile) => (
                      <option
                        key={profile.id}
                        value={profile.id}
                        data-shipping-charged={String(Number(profile.shipping_charged_default ?? 0).toFixed(2))}
                        data-supplies-cost={String(Number(profile.supplies_cost_default ?? 0).toFixed(2))}
                      >
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Actual Postage">
                  <input
                    id="shipping_cost"
                    name="shipping_cost"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue="0.00"
                    required
                    className="app-input"
                    disabled={availableQty <= 0}
                  />
                </Field>

                <Field label="Supplies Cost">
                  <input
                    id="supplies_cost"
                    name="supplies_cost"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue="0.00"
                    required
                    className="app-input"
                    disabled={availableQty <= 0}
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Platform">
                <input
                  name="platform"
                  type="text"
                  placeholder="eBay, Whatnot, local, etc."
                  className="app-input"
                  disabled={availableQty <= 0}
                />
              </Field>

              <div />
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                Notes
              </label>
              <textarea
                name="notes"
                rows={3}
                className="app-textarea"
                disabled={availableQty <= 0}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Link href={`/app/inventory/${item.id}`} className="app-button">
                Cancel
              </Link>
              <button
                type="submit"
                className="app-button-primary"
                disabled={availableQty <= 0}
              >
                Record Sale
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="app-section-tight">
              <div className="text-sm font-semibold">Sale Preview</div>

              <div className="mt-3 grid gap-2">
                <PreviewRow label="Qty Sold" valueId="preview_qty_sold" defaultValue="1" />
                <PreviewRow
                  label="Remaining After Sale"
                  valueId="preview_remaining"
                  defaultValue={String(Math.max(availableQty - 1, 0))}
                />
                <PreviewRow label="Gross Sale" valueId="preview_gross" defaultValue={money(0)} />
                <PreviewRow label="Selling Costs" valueId="preview_costs" defaultValue={money(0)} />
                <PreviewRow label="Net Proceeds" valueId="preview_net" defaultValue={money(0)} />
                <PreviewRow label="COGS" valueId="preview_cogs" defaultValue={money(unitCost)} />
                <PreviewRow label="Profit" valueId="preview_profit" defaultValue={money(-unitCost)} />
              </div>
            </div>

            <div className="app-section-tight">
              <div className="text-sm font-semibold">How This Works</div>
              <div className="mt-2 space-y-1.5 text-sm leading-snug text-zinc-300">
                <p>
                  Item Sale Price + Shipping Charged = gross sale.
                </p>
                <p>
                  Platform fees + postage + supplies + other costs = selling costs.
                </p>
                <p>
                  Quantity sold × unit cost = cost of goods sold.
                </p>
                <p>
                  If available quantity stays above 0, the item remains active in inventory.
                </p>
              </div>
            </div>

            {isLotLike ? (
              <div className="app-section-tight">
                <div className="text-sm font-semibold">Lot Sell Shortcut</div>
                <div className="mt-2 text-sm leading-snug text-zinc-300">
                  This item behaves like a partial-quantity lot. Selling 1 of {availableQty} will reduce available quantity to{' '}
                  <span className="font-semibold text-zinc-100">{Math.max(availableQty - 1, 0)}</span>, not remove the whole item.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </form>

      <Script id="sell-item-form-live-preview" strategy="afterInteractive">
        {`
          (() => {
            const form = document.getElementById('sell-item-form');
            if (!form) return;

            const maxAvailable = ${JSON.stringify(availableQty)};
            const unitCost = ${JSON.stringify(unitCost)};

            const qtyInput = form.querySelector('#quantity_sold');
            const grossSaleInput = form.querySelector('#gross_sale');
            const shippingChargedInput = form.querySelector('#shipping_charged');
            const platformFeesInput = form.querySelector('#platform_fees');
            const shippingCostInput = form.querySelector('#shipping_cost');
            const suppliesCostInput = form.querySelector('#supplies_cost');
            const otherCostsInput = form.querySelector('#other_costs');
            const shippingProfileSelect = form.querySelector('#shipping_profile_id');
            const remainingField = form.querySelector('#remaining_after_sale');

            const previewQty = document.getElementById('preview_qty_sold');
            const previewRemaining = document.getElementById('preview_remaining');
            const previewGross = document.getElementById('preview_gross');
            const previewCosts = document.getElementById('preview_costs');
            const previewNet = document.getElementById('preview_net');
            const previewCogs = document.getElementById('preview_cogs');
            const previewProfit = document.getElementById('preview_profit');

            const quickQtyButtons = form.querySelectorAll('[data-set-qty]');

            const asNumber = (value) => {
              const num = Number(value ?? 0);
              return Number.isFinite(num) ? num : 0;
            };

            const clampQty = () => {
              if (!qtyInput) return 1;
              let qty = Math.floor(asNumber(qtyInput.value || 1));
              if (qty < 1) qty = 1;
              if (maxAvailable > 0 && qty > maxAvailable) qty = maxAvailable;
              qtyInput.value = String(qty);
              return qty;
            };

            const money = (value) => {
              try {
                return new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(Number(value ?? 0));
              } catch {
                return '$0.00';
              }
            };

            const updatePreview = () => {
              const qty = clampQty();
              const itemSalePrice = asNumber(grossSaleInput?.value);
              const shippingCharged = asNumber(shippingChargedInput?.value);
              const platformFees = asNumber(platformFeesInput?.value);
              const shippingCost = asNumber(shippingCostInput?.value);
              const suppliesCost = asNumber(suppliesCostInput?.value);
              const otherCosts = asNumber(otherCostsInput?.value);

              const remaining = Math.max(maxAvailable - qty, 0);
              const gross = Number((itemSalePrice + shippingCharged).toFixed(2));
              const sellingCosts = Number((platformFees + shippingCost + suppliesCost + otherCosts).toFixed(2));
              const net = Number((gross - sellingCosts).toFixed(2));
              const cogs = Number((unitCost * qty).toFixed(2));
              const profit = Number((net - cogs).toFixed(2));

              if (remainingField) remainingField.value = String(remaining);
              if (previewQty) previewQty.textContent = String(qty);
              if (previewRemaining) previewRemaining.textContent = String(remaining);
              if (previewGross) previewGross.textContent = money(gross);
              if (previewCosts) previewCosts.textContent = money(sellingCosts);
              if (previewNet) previewNet.textContent = money(net);
              if (previewCogs) previewCogs.textContent = money(cogs);
              if (previewProfit) previewProfit.textContent = money(profit);
            };

            if (shippingProfileSelect) {
              shippingProfileSelect.addEventListener('change', () => {
                const option = shippingProfileSelect.options[shippingProfileSelect.selectedIndex];
                if (!option) {
                  updatePreview();
                  return;
                }

                const shippingCharged = option.getAttribute('data-shipping-charged');
                const suppliesCost = option.getAttribute('data-supplies-cost');

                if (shippingChargedInput && shippingCharged !== null) {
                  shippingChargedInput.value = String(Number(shippingCharged).toFixed(2));
                }

                if (suppliesCostInput && suppliesCost !== null) {
                  suppliesCostInput.value = String(Number(suppliesCost).toFixed(2));
                }

                updatePreview();
              });
            }

            quickQtyButtons.forEach((button) => {
              button.addEventListener('click', () => {
                if (!qtyInput) return;
                const nextQty = button.getAttribute('data-set-qty') || '1';
                qtyInput.value = nextQty;
                updatePreview();
              });
            });

            [
              qtyInput,
              grossSaleInput,
              shippingChargedInput,
              platformFeesInput,
              shippingCostInput,
              suppliesCostInput,
              otherCostsInput,
            ].forEach((input) => {
              if (!input) return;
              input.addEventListener('input', updatePreview);
              input.addEventListener('change', updatePreview);
            });

            updatePreview();
          })();
        `}
      </Script>
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
      <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-metric-card p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-base font-semibold leading-tight">{value}</div>
    </div>
  )
}

function PreviewRow({
  label,
  valueId,
  defaultValue,
}: {
  label: string
  valueId: string
  defaultValue: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-sm text-zinc-400">{label}</div>
      <div id={valueId} className="text-sm font-semibold text-zinc-100">
        {defaultValue}
      </div>
    </div>
  )
}