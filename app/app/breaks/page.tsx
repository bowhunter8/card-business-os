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

type SortKey =
  | 'break_date'
  | 'product_name'
  | 'source_name'
  | 'order_number'
  | 'completionStatus'
  | 'entered'
  | 'received'
  | 'remaining'
  | 'total_cost'

type SortDir = 'asc' | 'desc'

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

function getSortValue(item: BreakViewRow, key: SortKey) {
  switch (key) {
    case 'break_date':
      return item.break_date || ''
    case 'product_name':
      return item.product_name || ''
    case 'source_name':
      return item.source_name || ''
    case 'order_number':
      return item.order_number || ''
    case 'completionStatus':
      return item.completionStatus || ''
    case 'entered':
      return item.entered
    case 'received':
      return item.received
    case 'remaining':
      return item.remaining
    case 'total_cost':
      return Number(item.total_cost ?? 0)
    default:
      return ''
  }
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function sortRows(rows: BreakViewRow[], sortKey: SortKey, sortDir: SortDir) {
  return [...rows].sort((left, right) => {
    const result = compareValues(
      getSortValue(left, sortKey),
      getSortValue(right, sortKey)
    )

    return sortDir === 'asc' ? result : -result
  })
}

function getNextSortDir(currentKey: SortKey, currentDir: SortDir, nextKey: SortKey): SortDir {
  if (currentKey !== nextKey) return 'asc'
  return currentDir === 'asc' ? 'desc' : 'asc'
}

function getSortIndicator(currentKey: SortKey, currentDir: SortDir, key: SortKey) {
  if (currentKey !== key) return '↕'
  return currentDir === 'asc' ? '↑' : '↓'
}

function SortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  qRaw,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  currentSortDir: SortDir
  qRaw: string
}) {
  const params = new URLSearchParams()

  if (qRaw) {
    params.set('q', qRaw)
  }

  params.set('sort', sortKey)
  params.set('dir', getNextSortDir(currentSortKey, currentSortDir, sortKey))

  return (
    <Link
      href={`/app/breaks?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:text-zinc-100"
    >
      <span>{label}</span>
      <span className="text-xs">{getSortIndicator(currentSortKey, currentSortDir, sortKey)}</span>
    </Link>
  )
}

export default async function BreaksPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; sort?: string; dir?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim().toLowerCase()

  const requestedSort = String(params?.sort ?? 'break_date').trim() as SortKey
  const requestedDir = String(params?.dir ?? 'desc').trim() as SortDir

  const sortKey: SortKey = [
    'break_date',
    'product_name',
    'source_name',
    'order_number',
    'completionStatus',
    'entered',
    'received',
    'remaining',
    'total_cost',
  ].includes(requestedSort)
    ? requestedSort
    : 'break_date'

  const sortDir: SortDir = requestedDir === 'asc' ? 'asc' : 'desc'

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

  const filteredBreaks =
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

  const breaks = sortRows(filteredBreaks, sortKey, sortDir)

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
    <div className="max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{pageTitle}</h1>
          <p className="mt-1 text-sm text-zinc-400">{pageDescription}</p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/app/breaks/new"
            className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
          >
            Add Break
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/breaks"
          className={`rounded-lg border px-4 py-1.5 text-sm hover:bg-zinc-800 ${
            qRaw === ''
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          All
        </Link>
        <Link
          href="/app/breaks?q=active"
          className={`rounded-lg border px-4 py-1.5 text-sm hover:bg-zinc-800 ${
            qRaw === 'active'
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          Active
        </Link>
        <Link
          href="/app/breaks?q=open"
          className={`rounded-lg border px-4 py-1.5 text-sm hover:bg-zinc-800 ${
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
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-3"
      >
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            name="q"
            placeholder="Search breaks, orders, players, teams..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs text-zinc-500">
          This opens a clean results page instead of filtering the table.
        </div>
      </form>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading breaks: {error.message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-sm text-zinc-400">All Breaks</div>
          <div className="mt-1.5 text-2xl font-semibold">{allRows.length}</div>
        </div>

        <Link
          href="/app/breaks?q=active"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Active</div>
          <div className="mt-1.5 text-2xl font-semibold">{activeCount}</div>
        </Link>

        <Link
          href="/app/breaks?q=open"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Open</div>
          <div className="mt-1.5 text-2xl font-semibold">{openCount}</div>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Date"
                    sortKey="break_date"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Product"
                    sortKey="product_name"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Source"
                    sortKey="source_name"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Order #"
                    sortKey="order_number"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Status"
                    sortKey="completionStatus"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Entered"
                    sortKey="entered"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Received"
                    sortKey="received"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Remaining"
                    sortKey="remaining"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Total Cost"
                    sortKey="total_cost"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {breaks.map((item) => (
                <tr key={item.id} className="border-t border-zinc-800 align-top">
                  <td className="px-3 py-2.5">{item.break_date}</td>
                  <td className="px-3 py-2.5 font-medium">
                    <div className="leading-snug">{item.product_name || 'Untitled break'}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {item.format_type || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{item.source_name || '—'}</td>
                  <td className="px-3 py-2.5">{item.order_number || '—'}</td>
                  <td className="px-3 py-2.5">
                    {item.completionStatus === 'Complete' ? (
                      <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-300">
                        Complete
                      </span>
                    ) : item.completionStatus === 'In Progress' ? (
                      <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-0.5 text-xs text-blue-300">
                        In Progress
                      </span>
                    ) : item.completionStatus === 'Reversed' ? (
                      <span className="rounded-full border border-yellow-800 bg-yellow-950/40 px-2 py-0.5 text-xs text-yellow-300">
                        Reversed
                      </span>
                    ) : (
                      <span className="rounded-full border border-orange-800 bg-orange-950/40 px-2 py-0.5 text-xs text-orange-300">
                        Open
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{item.entered}</td>
                  <td className="px-3 py-2.5">{item.received}</td>
                  <td className="px-3 py-2.5">{item.remaining}</td>
                  <td className="px-3 py-2.5">{money(item.total_cost)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/app/breaks/${item.id}`}
                        className="inline-flex rounded-lg border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
                      >
                        Details
                      </Link>
                      {!item.reversed_at ? (
                        <>
                          <Link
                            href={`/app/breaks/${item.id}/edit`}
                            className="inline-flex rounded-lg border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/app/breaks/${item.id}/add-cards`}
                            className="inline-flex rounded-lg border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
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
                  <td colSpan={10} className="px-4 py-8 text-center text-zinc-400">
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