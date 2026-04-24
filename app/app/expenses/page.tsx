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
    <Link
      href={`/app/expenses/new?category=${encodeURIComponent(title)}`}
      className="app-card-tight block p-3 transition hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-zinc-500">Add expense →</div>
      </div>
      <div className="mt-1 text-sm text-zinc-400">{description}</div>
      <div className="mt-2 text-sm text-zinc-300">{examples}</div>
    </Link>
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
            Choose a category below to record a business expense for tax reporting.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/expenses/new" className="app-button-primary">
            Add Expense
          </Link>
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

      <div className="app-section p-4">
        <h2 className="text-lg font-semibold">Add by Category</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Click a category to open a focused expense entry page with that category already selected.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <GuideCard
            title="Shipping Supplies"
            description="Use for items that directly go into packing and shipping an order."
            examples="Examples: penny sleeves, top loaders, team bags, envelopes, bubble mailers, boxes, packing tape, thermal labels / label printer labels."
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
            title="Platform Fees"
            description="Use for selling-platform charges that are not already captured on individual sales."
            examples="Examples: store subscriptions, promoted listing charges, account-level platform charges, marketplace service fees."
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
            title="Office Expense"
            description="Use for ordinary office-related business costs."
            examples="Examples: paper, ink, pens, folders, small desk items, business office consumables."
          />

          <GuideCard
            title="Advertising / Marketing"
            description="Use for promotion and customer-acquisition related costs."
            examples="Examples: Whatnot giveaways, buyer appreciation giveaways, ads, promo cards, stream promotion, branding materials."
          />

          <GuideCard
            title="Grading / Authentication"
            description="Use for grading-related services and related handling fees."
            examples="Examples: PSA, SGC, Beckett, authentication services, grading submission fees."
          />

          <GuideCard
            title="Travel"
            description="Use for business travel tied to sourcing, shows, or selling."
            examples="Examples: mileage notes, parking, tolls, lodging, show-related travel costs."
          />

          <GuideCard
            title="Education"
            description="Use for learning resources directly related to the business."
            examples="Examples: pricing guides, business courses, paid research tools, market education."
          />

          <GuideCard
            title="Other"
            description="Use when nothing else fits well, or use a Custom Category for a clearly named one-off expense."
            examples='Examples: "business storage locker fee," "one-time convention table fee," or another occasional oddball business expense.'
          />
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