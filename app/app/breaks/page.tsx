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

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/,/g, ' ')
}

function getCompletionStatus(received: number, entered: number, reversedAt?: string | null) {
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
  const q = cleanSearchTerm(params?.q ?? '')
  const normalizedQ = q.toLowerCase()

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

  const allBreaks: BreakRow[] = (breaksResponse.data ?? []) as BreakRow[]
  const breakInventoryRows: BreakInventoryRow[] = (breakInventoryResponse.data ??
    []) as BreakInventoryRow[]
  const error = breaksResponse.error || breakInventoryResponse.error

  const enteredMap = new Map<string, number>()
  for (const row of breakInventoryRows) {
    const breakId = row.source_break_id
    if (!breakId) continue
    enteredMap.set(
      breakId,
      (enteredMap.get(breakId) ?? 0) + Number(row.quantity ?? 0)
    )
  }

  const breaksWithProgress = allBreaks.map((item) => {
    const received = Number(item.cards_received ?? 0)
    const entered = enteredMap.get(item.id) ?? 0
    const remaining = Math.max(0, received - entered)
    const completionStatus = getCompletionStatus(received, entered, item.reversed_at)

    return {
      ...item,
      received,
      entered,
      remaining,
      completionStatus,
    }
  })

  const breaks = breaksWithProgress.filter((item) => {
    if (!q) return true

    if (normalizedQ === 'open') {
      return !item.reversed_at && (item.received <= 0 || item.entered < item.received)
    }

    if (normalizedQ === 'complete') {
      return !item.reversed_at && item.received > 0 && item.entered >= item.received
    }

    if (normalizedQ === 'reversed') {
      return !!item.reversed_at
    }

    const haystack = [
      item.order_number,
      item.source_name,
      item.product_name,
      item.format_type,
      item.notes,
      item.completionStatus,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQ)
  })

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Breaks</h1>
          <p className="mt-2 text-zinc-400">
            View and manage your recorded breaks.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/app/search"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Global Search
          </Link>
          <Link
            href="/app/breaks/new"
            className="inline-flex rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Add Break
          </Link>
        </div>
      </div>

      <form method="get" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder='Search breaks here, or use Global Search to search staging too'
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>
            {q ? (
              <Link
                href="/app/breaks"
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>

        {q ? (
          <div className="mt-3 text-sm text-zinc-400">
            Showing break results for <span className="text-zinc-200">"{q}"</span>. Need the whole app?{' '}
            <Link href={`/app/search?q=${encodeURIComponent(q)}`} className="text-zinc-200 underline">
              Search everywhere
            </Link>
          </div>
        ) : null}
      </form>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading breaks: {error.message}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
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
                    <div className="text-xs text-zinc-500">{item.format_type || '—'}</div>
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
                    {q ? 'No breaks match your search.' : 'No breaks recorded yet.'}
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