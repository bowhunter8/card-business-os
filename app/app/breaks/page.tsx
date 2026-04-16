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
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">{pageTitle}</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <div className="flex gap-2">
          <Link href="/app/breaks/new" className="app-button-primary">
            Add Break
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/breaks"
          className={`app-chip ${qRaw === '' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          All
        </Link>
        <Link
          href="/app/breaks?q=active"
          className={`app-chip ${qRaw === 'active' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Active
        </Link>
        <Link
          href="/app/breaks?q=open"
          className={`app-chip ${qRaw === 'open' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Open
        </Link>
      </div>

      <form method="get" action="/app/search" className="app-search-panel">
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            name="q"
            placeholder="Search breaks, orders, players, teams..."
            className="app-input"
          />
          <div className="flex gap-2">
            <button type="submit" className="app-button-primary">
              Search
            </button>
          </div>
        </div>

        <div className="mt-1.5 text-xs text-zinc-500">
          This opens a clean results page instead of filtering the table.
        </div>
      </form>

      {error ? (
        <div className="app-alert-error">
          Error loading breaks: {error.message}
        </div>
      ) : null}

      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">All Breaks</div>
          <div className="mt-1 text-2xl font-semibold">{allRows.length}</div>
        </div>

        <Link href="/app/breaks?q=active" className="app-metric-card transition hover:bg-zinc-800">
          <div className="text-sm text-zinc-400">Active</div>
          <div className="mt-1 text-2xl font-semibold">{activeCount}</div>
        </Link>

        <Link href="/app/breaks?q=open" className="app-metric-card transition hover:bg-zinc-800">
          <div className="text-sm text-zinc-400">Open</div>
          <div className="mt-1 text-2xl font-semibold">{openCount}</div>
        </Link>
      </div>

      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th">
                  <SortHeader
                    label="Date"
                    sortKey="break_date"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Product"
                    sortKey="product_name"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Source"
                    sortKey="source_name"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Order #"
                    sortKey="order_number"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Status"
                    sortKey="completionStatus"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Entered"
                    sortKey="entered"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Received"
                    sortKey="received"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Remaining"
                    sortKey="remaining"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">
                  <SortHeader
                    label="Total Cost"
                    sortKey="total_cost"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    qRaw={qRaw}
                  />
                </th>
                <th className="app-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {breaks.map((item) => (
                <tr key={item.id} className="app-tr">
                  <td className="app-td whitespace-nowrap">{item.break_date}</td>
                  <td className="app-td font-medium">
                    <div className="leading-snug">{item.product_name || 'Untitled break'}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {item.format_type || '—'}
                    </div>
                  </td>
                  <td className="app-td">{item.source_name || '—'}</td>
                  <td className="app-td">
                    <div className="max-w-[300px] break-words leading-snug">
                      {item.order_number || '—'}
                    </div>
                  </td>
                  <td className="app-td">
                    {item.completionStatus === 'Complete' ? (
                      <span className="app-badge app-badge-success">Complete</span>
                    ) : item.completionStatus === 'In Progress' ? (
                      <span className="app-badge app-badge-info">In Progress</span>
                    ) : item.completionStatus === 'Reversed' ? (
                      <span className="app-badge app-badge-warning">Reversed</span>
                    ) : (
                      <span className="app-badge app-badge-warning">Open</span>
                    )}
                  </td>
                  <td className="app-td">{item.entered}</td>
                  <td className="app-td">{item.received}</td>
                  <td className="app-td">{item.remaining}</td>
                  <td className="app-td whitespace-nowrap">{money(item.total_cost)}</td>
                  <td className="app-td">
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={`/app/breaks/${item.id}`} className="app-button">
                        Details
                      </Link>
                      {!item.reversed_at ? (
                        <>
                          <Link href={`/app/breaks/${item.id}/edit`} className="app-button">
                            Edit
                          </Link>
                          <Link href={`/app/breaks/${item.id}/add-cards`} className="app-button">
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