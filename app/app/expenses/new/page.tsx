import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const CATEGORY_OPTIONS = [
  'Shipping Supplies',
  'Supplies',
  'Postage',
  'Platform Fees',
  'Software / Subscriptions',
  'Equipment',
  'Office Expense',
  'Advertising / Marketing',
  'Grading / Authentication',
  'Travel',
  'Education',
  'Other',
]

function normalizeCategory(value: string | null | undefined) {
  const incoming = String(value ?? '').trim()
  return CATEGORY_OPTIONS.includes(incoming) ? incoming : 'Shipping Supplies'
}

function categoryHelp(category: string) {
  if (category === 'Shipping Supplies') {
    return 'Examples: penny sleeves, top loaders, team bags, envelopes, bubble mailers, boxes, packing tape, thermal labels / label printer labels, packing paper, cardboard inserts, shipping label pouches.'
  }

  if (category === 'Supplies') {
    return 'Examples: storage boxes, binders, sorting trays, card dividers, card stands, desk supplies, inventory labels, sleeves for organizing inventory, cleaning cloths, storage totes.'
  }

  if (category === 'Postage') {
    return 'Examples: stamp rolls, USPS postage refills, bulk label postage purchases, prepaid shipping labels, postage meter refills.'
  }

  if (category === 'Platform Fees') {
    return 'Examples: eBay store subscription, promoted listing charges, Whatnot seller fees not tied to a specific sale, marketplace service fees, payment processing fees not already captured on individual sales.'
  }

  if (category === 'Software / Subscriptions') {
    return 'Examples: Card Ladder, QuickBooks, Beckett, TurboTax, inventory software, listing tools, website tools, cloud storage, bookkeeping apps, pricing/research subscriptions.'
  }

  if (category === 'Equipment') {
    return 'Examples: label printer, printer, digital scale, camera, light box, lights, tripod, shelves, desk equipment, barcode scanner, computer accessories used for the business.'
  }

  if (category === 'Office Expense') {
    return 'Examples: paper, ink, pens, folders, notebooks, printer toner, office labels, tape dispensers, basic office consumables used for the business.'
  }

  if (category === 'Advertising / Marketing') {
    return 'Examples: Whatnot giveaways, buyer appreciation giveaways, promo cards, stream promotion, ads, branded stickers, business cards, flyers, social media promotion, customer appreciation inserts.'
  }

  if (category === 'Grading / Authentication') {
    return 'Examples: PSA, SGC, Beckett, authentication fees, grading submission fees, grading shipping fees, card prep supplies for grading, submission kit costs.'
  }

  if (category === 'Travel') {
    return 'Examples: mileage notes, parking, tolls, lodging, meals during business travel, card show travel, sourcing trips, rideshare, baggage fees for business inventory travel.'
  }

  if (category === 'Education') {
    return 'Examples: pricing guides, business courses, paid research tools, market education, books, webinars, training materials, tax/bookkeeping education related to the business.'
  }

  if (category === 'Other') {
    return 'Examples: business storage locker fee, one-time convention table fee, bank fees, unusual business permits, one-off service charges. Add a clear custom category and notes.'
  }

  return 'Add the vendor, amount, receipt/order reference, and notes so this expense is easy to understand later.'
}

async function createExpenseAction(formData: FormData) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const expenseDate = String(formData.get('expense_date') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const customCategory = String(formData.get('custom_category') ?? '').trim()
  const vendor = String(formData.get('vendor') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const amountRaw = Number(String(formData.get('amount') ?? '0'))

  const finalCategory = customCategory || category

  if (!expenseDate || !finalCategory || !Number.isFinite(amountRaw) || amountRaw < 0) {
    redirect(`/app/expenses/new?category=${encodeURIComponent(category || 'Shipping Supplies')}&saved=error`)
  }

  const amount = Number(amountRaw.toFixed(2))

  const { error } = await supabase.from('expenses').insert({
    user_id: user.id,
    expense_date: expenseDate,
    category: finalCategory,
    vendor: vendor || null,
    amount,
    notes: notes || null,
  })

  if (error) {
    redirect(`/app/expenses/new?category=${encodeURIComponent(category || 'Shipping Supplies')}&saved=error`)
  }

  revalidatePath('/app/expenses')
  revalidatePath('/app/reports/tax/summary')

  redirect('/app/expenses?saved=1')
}

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string; saved?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const selectedCategory = normalizeCategory(params?.category)
  const saved = String(params?.saved ?? '')

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div>
          <div className="mb-1">
            <Link href="/app/expenses" className="text-xs text-zinc-400 hover:underline">
              ← Back to Expenses
            </Link>
          </div>
          <h1 className="app-title">Add Expense</h1>
          <p className="app-subtitle">
            Recording: <span className="font-medium text-zinc-100">{selectedCategory}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/expenses" className="app-button">
            Back to Expenses
          </Link>
          <Link href="/app/reports/tax/summary" className="app-button">
            Tax Summary
          </Link>
        </div>
      </div>

      {saved === 'error' ? (
        <div className="app-alert-error">
          Unable to save expense. Check the fields and try again.
        </div>
      ) : null}

      <div className="app-alert-info">
        {categoryHelp(selectedCategory)}
      </div>

      <form action={createExpenseAction} className="app-section p-4">
        <h2 className="text-lg font-semibold">Expense Details</h2>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Expense Date
            </label>
            <input
              type="date"
              name="expense_date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Category
            </label>
            <select name="category" defaultValue={selectedCategory} className="app-select">
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Custom Category (optional)
            </label>
            <input
              type="text"
              name="custom_category"
              placeholder="Example: Convention Table Fee"
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Vendor
            </label>
            <input
              type="text"
              name="vendor"
              placeholder="Amazon, Walmart, eBay..."
              className="app-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Amount
            </label>
            <input
              type="number"
              name="amount"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="app-input"
            />
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Notes
            </label>
            <textarea
              name="notes"
              rows={4}
              placeholder="Example: Amazon order #12345, 200 top loaders, 1000 penny sleeves, 50 padded mailers"
              className="app-textarea"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="app-button-primary">
            Save Expense
          </button>
          <Link href="/app/expenses" className="app-button">
            Cancel
          </Link>
        </div>

        <div className="mt-2 text-xs text-zinc-400">
          Use Custom Category only when a one-off expense does not fit cleanly into the standard
          categories. For normal tax reporting, leave it blank and use the dropdown category.
        </div>
      </form>
    </div>
  )
}