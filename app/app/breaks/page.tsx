import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  order_number: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  total_cost: number | null
  allocation_method: string | null
  notes?: string | null
  reversed_at?: string | null
  cards_received?: number | null
}

type BreakInventoryRow = {
  source_break_id: string | null
  quantity: number | null
}

type BreakViewRow = BreakRow & {
  received: number
  entered: number
  remaining: number
  completionStatus: 'Open' | 'In Progress' | 'Complete' | 'Reversed'
}

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function getCompletionStatus(
  received: number,
  entered: number,
  reversedAt?: string | null
): 'Open' | 'In Progress' | 'Complete' | 'Reversed' {
  if (reversedAt) return 'Reversed'
  if (received <= 0) return 'Open'
  if (entered <= 0) return 'Open'
  if (entered < received) return 'In Progress'
  return 'Complete'
}

export default async function BreaksPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim().toLowerCase()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [breaksResponse, breakInventoryResponse] = await Promise.all([
    supabase
      .from('breaks')
      .select(`
        id,
        break_date,
        source_name,
        order_number,
        product_name,
        format_type,
        teams,
        total_cost,
        allocation_method,
        notes,
        reversed_at,
        cards_received
      `)
      .eq('user_id', user.id)
      .order('break_date', { ascending: false }),

    supabase
      .from('inventory_items')
      .select('source_break_id, quantity')
      .eq('user_id', user.id)
      .eq('source_type', 'break'),
  ])

  const allBreaks = (breaksResponse.data ?? []) as BreakRow[]
  const breakInventoryRows = (breakInventoryResponse.data ?? []) as BreakInventoryRow[]
  const error = breaksResponse.error || breakInventoryResponse.error

  const enteredMap = new Map<string, number>()
  for (const row of breakInventoryRows) {
    if (!row.source_break_id) continue
    enteredMap.set(
      row.source_break_id,
      (enteredMap.get(row.source_break_id) ?? 0) + Number(row.quantity ?? 0)
    )
  }

  const allRows: BreakViewRow[] = []
  let activeCount = 0
  let openCount = 0

  for (const item of allBreaks) {
    const received = Number(item.cards_received ?? 0)
    const entered = enteredMap.get(item.id) ?? 0
    const remaining = Math.max(0, received - entered)
    const completionStatus = getCompletionStatus(received, entered, item.reversed_at)

    const row: BreakViewRow = {
      ...item,
      received,
      entered,
      remaining,
      completionStatus,
    }

    allRows.push(row)

    if (!item.reversed_at) {
      activeCount += 1
      if (completionStatus === 'Open' || completionStatus === 'In Progress') {
        openCount += 1
      }
    }
  }

  const breaks =
    qRaw === 'active'
      ? allRows.filter((item) => !item.reversed_at)
      : qRaw === 'open'
        ? allRows.filter(
            (item) =>
              !item.reversed_at &&
              (item.completionStatus === 'Open' ||
                item.completionStatus === 'In Progress')
          )
        : allRows

  const pageTitle =
    qRaw === 'active'
      ? 'Breaks — Active'
      : qRaw === 'open'
        ? 'Breaks — Open'
        : 'Breaks'

  const pageDescription =
    qRaw === 'active'
      ? 'Showing active breaks that have not been reversed.'
      : qRaw === 'open'
        ? 'Showing breaks that still need card entry.'
        : 'View and manage your recorded breaks.'

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{pageTitle}</h1>
          <p className="mt-2 text-zinc-400">{pageDescription}</p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/app/breaks/new"
            className="inline-flex rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Add Break
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/app/breaks"
          className={`rounded-xl border px-4 py-2 text-sm hover:bg-zinc-800 ${
            qRaw === ''
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          All
        </Link>
        <Link
          href="/app/breaks?q=active"
          className={`rounded-xl border px-4 py-2 text-sm hover:bg-zinc-800 ${
            qRaw === 'active'
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          Active
        </Link>
        <Link
          href="/app/breaks?q=open"
          className={`rounded-xl border px-4 py-2 text-sm hover:bg-zinc-800 ${
            qRaw === 'open'
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          Open
        </Link>
      </div>

      <form
        method="get"
        action="/app/search"
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            placeholder="Search breaks, orders, players, teams..."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-zinc-500">
          This opens a clean results page instead of filtering the table.
        </div>
      </form>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading breaks: {error.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">All Breaks</div>
          <div className="mt-2 text-3xl font-semibold">{allRows.length}</div>
        </div>

        <Link
          href="/app/breaks?q=active"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Active</div>
          <div className="mt-2 text-3xl font-semibold">{activeCount}</div>
        </Link>

        <Link
          href="/app/breaks?q=open"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Open</div>
          <div className="mt-2 text-3xl font-semibold">{openCount}</div>
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Order #</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Entered</th>
                <th className="px-4 py-3 text-left font-medium">Received</th>
                <th className="px-4 py-3 text-left font-medium">Remaining</th>
                <th className="px-4 py-3 text-left font-medium">Total Cost</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {breaks.map((item) => (
                <tr key={item.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">{item.break_date}</td>
                  <td className="px-4 py-3 font-medium">
                    <div>{item.product_name || 'Untitled break'}</div>
                    <div className="text-xs text-zinc-500">
                      {item.format_type || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">{item.source_name || '—'}</td>
                  <td className="px-4 py-3">{item.order_number || '—'}</td>
                  <td className="px-4 py-3">
                    {item.completionStatus === 'Complete' ? (
                      <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300">
                        Complete
                      </span>
                    ) : item.completionStatus === 'In Progress' ? (
                      <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-1 text-xs text-blue-300">
                        In Progress
                      </span>
                    ) : item.completionStatus === 'Reversed' ? (
                      <span className="rounded-full border border-yellow-800 bg-yellow-950/40 px-2 py-1 text-xs text-yellow-300">
                        Reversed
                      </span>
                    ) : (
                      <span className="rounded-full border border-orange-800 bg-orange-950/40 px-2 py-1 text-xs text-orange-300">
                        Open
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{item.entered}</td>
                  <td className="px-4 py-3">{item.received}</td>
                  <td className="px-4 py-3">{item.remaining}</td>
                  <td className="px-4 py-3">{money(item.total_cost)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/app/breaks/${item.id}`}
                        className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                      >
                        Details
                      </Link>
                      {!item.reversed_at ? (
                        <>
                          <Link
                            href={`/app/breaks/${item.id}/edit`}
                            className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/app/breaks/${item.id}/add-cards`}
                            className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                          >
                            Add Cards
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

              {breaks.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-zinc-400">
                    No breaks found for this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}