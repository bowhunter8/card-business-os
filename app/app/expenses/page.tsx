import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type ExpenseRow = {
  id: string
  expense_date: string
  category: string
  vendor: string | null
  amount: number | null
  notes: string | null
  created_at: string
}

const CATEGORY_OPTIONS = [
  'Shipping Supplies',
  'Supplies',
  'Postage',
  'Software / Subscriptions',
  'Equipment',
  'Office Expense',
  'Advertising / Marketing',
  'Grading / Authentication',
  'Travel',
  'Education',
  'Other',
]

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
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
  const vendor = String(formData.get('vendor') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const amountRaw = Number(String(formData.get('amount') ?? '0'))

  if (!expenseDate || !category || !Number.isFinite(amountRaw) || amountRaw < 0) {
    redirect('/app/expenses?saved=error')
  }

  const amount = Number(amountRaw.toFixed(2))

  const { error } = await supabase.from('expenses').insert({
    user_id: user.id,
    expense_date: expenseDate,
    category,
    vendor: vendor || null,
    amount,
    notes: notes || null,
  })

  if (error) {
    redirect('/app/expenses?saved=error')
  }

  revalidatePath('/app/expenses')
  revalidatePath('/app/reports/tax/summary')
  redirect('/app/expenses?saved=1')
}

async function deleteExpenseAction(formData: FormData) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const expenseId = String(formData.get('expense_id') ?? '').trim()
  if (!expenseId) return

  await supabase
    .from('expenses')
    .delete()
    .eq('user_id', user.id)
    .eq('id', expenseId)

  revalidatePath('/app/expenses')
  revalidatePath('/app/reports/tax/summary')
  redirect('/app/expenses?saved=deleted')
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="app-card-tight p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

function GuideCard({
  title,
  description,
  examples,
}: {
  title: string
  description: string
  examples: string
}) {
  return (
    <div className="app-card-tight p-3">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-zinc-400">{description}</div>
      <div className="mt-2 text-sm text-zinc-300">{examples}</div>
    </div>
  )
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const saved = String(params?.saved ?? '')

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('expenses')
    .select(`
      id,
      expense_date,
      category,
      vendor,
      amount,
      notes,
      created_at
    `)
    .eq('user_id', user.id)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  const expenses = (data ?? []) as ExpenseRow[]

  const totalExpenses = expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const shippingSuppliesExpenses = expenses.reduce((sum, row) => {
    const category = String(row.category ?? '').toLowerCase()
    if (category === 'shipping supplies') {
      return sum + Number(row.amount ?? 0)
    }
    return sum
  }, 0)

  const generalSuppliesExpenses = expenses.reduce((sum, row) => {
    const category = String(row.category ?? '').toLowerCase()
    if (category === 'supplies') {
      return sum + Number(row.amount ?? 0)
    }
    return sum
  }, 0)

  const postageExpenses = expenses.reduce((sum, row) => {
    const category = String(row.category ?? '').toLowerCase()
    if (category === 'postage') {
      return sum + Number(row.amount ?? 0)
    }
    return sum
  }, 0)

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div>
          <h1 className="app-title">Supplies & Expense Tracker</h1>
          <p className="app-subtitle">
            Record bulk supply purchases and other business expenses for tax reporting.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/reports/tax/summary" className="app-button">
            Tax Summary
          </Link>
          <Link href="/app/utilities" className="app-button">
            Back to Utilities
          </Link>
        </div>
      </div>

      {saved === '1' ? (
        <div className="app-alert-success">Expense saved.</div>
      ) : null}

      {saved === 'deleted' ? (
        <div className="app-alert-success">Expense deleted.</div>
      ) : null}

      {saved === 'error' ? (
        <div className="app-alert-error">Unable to save expense. Check the fields and try again.</div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tracked Expenses" value={money(totalExpenses)} />
        <MetricCard label="Shipping Supplies" value={money(shippingSuppliesExpenses)} />
        <MetricCard label="Supplies" value={money(generalSuppliesExpenses)} />
        <MetricCard label="Postage" value={money(postageExpenses)} />
      </div>

      <form action={createExpenseAction} className="app-section p-4">
        <h2 className="text-lg font-semibold">Add Expense</h2>

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
            <select name="category" defaultValue="Shipping Supplies" className="app-select">
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
              rows={3}
              placeholder="Example: 200 top loaders, 1000 penny sleeves, 50 padded mailers"
              className="app-textarea"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="app-button-primary">
            Save Expense
          </button>
        </div>

        <div className="mt-2 text-xs text-zinc-400">
          Use this page for bulk supply purchases and other business expenses that are not already
          captured in an individual sale.
        </div>
      </form>

      <div className="app-section p-4">
        <h2 className="text-lg font-semibold">Category Guide</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Use consistent categories so reports stay clean and easy to understand later.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <GuideCard
            title="Shipping Supplies"
            description="Use for items that directly go into packing and shipping an order."
            examples="Examples: penny sleeves, top loaders, team bags, envelopes, bubble mailers, boxes, packing tape, labels."
          />

          <GuideCard
            title="Supplies"
            description="Use for general business consumables that are not part of the mailed package itself."
            examples="Examples: storage boxes, binders, sorting trays, dividers, card stands, desk supplies."
          />

          <GuideCard
            title="Postage"
            description="Use only if you buy postage separately in bulk and want to log it here."
            examples="Examples: stamp rolls, postage refills, bulk label postage purchases."
          />

          <GuideCard
            title="Software / Subscriptions"
            description="Use for recurring tools or software used in the business."
            examples="Examples: Card Ladder, QuickBooks, listing tools, website tools, storage subscriptions."
          />

          <GuideCard
            title="Equipment"
            description="Use for longer-lasting gear or hardware used in the business."
            examples="Examples: printer, label printer, scale, camera, lights, shelves, desk equipment."
          />

          <GuideCard
            title="Advertising / Marketing"
            description="Use for promotion and customer-acquisition related costs."
            examples="Examples: ads, promo cards, stream promotion, branding materials."
          />

          <GuideCard
            title="Grading / Authentication"
            description="Use for grading-related services and related handling fees."
            examples="Examples: PSA, SGC, Beckett, authentication services, grading submission fees."
          />

          <GuideCard
            title="Other"
            description="Use only when nothing else fits well. Add a clear note if you use this."
            examples='Example note: "business storage locker fee" or "one-time convention table fee."'
          />
        </div>

        <div className="mt-3 app-alert-info">
          Recommended default: top loaders, penny sleeves, team bags, envelopes, and mailers should
          usually go under <span className="font-medium">Shipping Supplies</span>.
        </div>
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recorded Expenses</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              These entries feed into your tax reporting.
            </p>
          </div>

          <div className="text-xs text-zinc-500">{expenses.length} record(s)</div>
        </div>

        {error ? (
          <div className="app-alert-error mt-4">Expense load error: {error.message}</div>
        ) : null}

        {!error && expenses.length === 0 ? (
          <div className="app-empty mt-4">
            No expenses recorded yet.
          </div>
        ) : null}

        {!error && expenses.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="app-card-tight p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="app-badge app-badge-info">{expense.category}</span>
                    </div>

                    <div className="mt-2 text-lg font-semibold">{money(expense.amount)}</div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Date: {formatDate(expense.expense_date)}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Vendor: {expense.vendor || '—'}
                    </div>

                    {expense.notes ? (
                      <div className="mt-2 text-sm text-zinc-400">
                        Notes: {expense.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={deleteExpenseAction}>
                      <input type="hidden" name="expense_id" value={expense.id} />
                      <button type="submit" className="app-button-danger">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}