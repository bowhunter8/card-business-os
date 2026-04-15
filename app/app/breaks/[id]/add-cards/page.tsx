import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addBreakCardsAction } from '@/app/actions/breaks'
import BreakCardEntryGrid from './BreakCardEntryGrid'

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  total_cost: number | null
  allocation_method: string | null
  order_number?: string | null
  cards_received?: number | null
}

type LinkedWhatnotOrderRow = {
  id: string
  product_name: string | null
}

type EntryRow = {
  year: string
  set_name: string
  player_name: string
  card_number: string
  item_type: string
  quantity: string
  status: string
  notes: string
}

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function getCurrentYear() {
  return String(new Date().getFullYear())
}

function extractYearFromText(text: string | null | undefined) {
  if (!text) return ''
  const match = String(text).match(/\b(19|20)\d{2}\b/)
  return match ? match[0] : ''
}

function extractSetFromText(text: string | null | undefined, year: string) {
  if (!text) return ''
  if (!year) return String(text).trim()
  return String(text).replace(year, '').replace(/\s+/g, ' ').trim()
}

function resolveDefaultYear(
  breakProductName: string | null,
  linkedOrderProductNames: string[]
) {
  const fromBreak = extractYearFromText(breakProductName)
  if (fromBreak) return fromBreak

  for (const name of linkedOrderProductNames) {
    const fromOrder = extractYearFromText(name)
    if (fromOrder) return fromOrder
  }

  return getCurrentYear()
}

function resolveDefaultSet(
  breakProductName: string | null,
  linkedOrderProductNames: string[],
  resolvedYear: string
) {
  const fromBreak = extractSetFromText(breakProductName, resolvedYear)
  if (fromBreak) return fromBreak

  for (const name of linkedOrderProductNames) {
    const fromOrder = extractSetFromText(name, resolvedYear)
    if (fromOrder) return fromOrder
  }

  return ''
}

function parseRestoreRows(value: string | undefined): EntryRow[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed.map((row) => ({
      year: String(row?.year ?? ''),
      set_name: String(row?.set_name ?? ''),
      player_name: String(row?.player_name ?? ''),
      card_number: String(row?.card_number ?? ''),
      item_type: String(row?.item_type ?? 'single_card'),
      quantity: String(row?.quantity ?? '1'),
      status: String(row?.status ?? 'available'),
      notes: String(row?.notes ?? ''),
    }))
  } catch {
    return []
  }
}

export default async function AddBreakCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    error?: string
    restore?: string
    row_count?: string
    cards_received?: string
  }>
}) {
  const { id } = await params
  const pageParams = searchParams ? await searchParams : undefined
  const pageError = pageParams?.error

  const safeRestore =
    pageParams?.restore && pageParams.restore.length <= 12000
      ? pageParams.restore
      : undefined

  const restoredRows = parseRestoreRows(safeRestore)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [breakResponse, linkedOrdersResponse] = await Promise.all([
    supabase
      .from('breaks')
      .select(`
        id,
        break_date,
        source_name,
        product_name,
        format_type,
        teams,
        total_cost,
        allocation_method,
        order_number,
        cards_received
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),

    supabase
      .from('whatnot_orders')
      .select(`
        id,
        product_name
      `)
      .eq('user_id', user.id)
      .eq('break_id', id),
  ])

  if (breakResponse.error || !breakResponse.data) {
    notFound()
  }

  const item = breakResponse.data as BreakRow
  const linkedOrders = (linkedOrdersResponse.data ?? []) as LinkedWhatnotOrderRow[]

  const linkedOrderProductNames = linkedOrders
    .map((row) => row.product_name || '')
    .filter(Boolean)

  const defaultYear = resolveDefaultYear(item.product_name, linkedOrderProductNames)
  const defaultSet = resolveDefaultSet(
    item.product_name,
    linkedOrderProductNames,
    defaultYear
  )

  const itemsReceived =
    pageParams?.cards_received != null
      ? Math.max(0, Number(pageParams.cards_received))
      : Math.max(0, Number(item.cards_received ?? 0))

  const rowCount =
    pageParams?.row_count != null
      ? Math.min(Math.max(1, Number(pageParams.row_count)), 100)
      : itemsReceived > 0
        ? Math.min(itemsReceived, 50)
        : 1

  const droppedOversizedRestore =
    Boolean(pageParams?.restore) && safeRestore == null

  return (
    <div className="max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Add Items From Break</h1>
          <p className="mt-2 text-zinc-400">
            Enter items or lots from this break, choose for sale, personal, or junk, and quantity will count toward the total items received.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/app/breaks/${item.id}`}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to Break
          </Link>
        </div>
      </div>

      {pageError ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {pageError}
        </div>
      ) : null}

      {droppedOversizedRestore ? (
        <div className="mt-4 rounded-xl border border-yellow-900 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-200">
          A previous restore payload was too large to safely reload on this page.
          Your break still exists, but large card-entry recovery should not rely on the URL.
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
        Autosave is enabled on this page. Large entries should now stay recoverable in this browser even if the page refreshes or errors.
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Break</div>
          <div className="mt-2 text-lg font-semibold">
            {item.product_name || 'Untitled break'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Date</div>
          <div className="mt-2 text-lg font-semibold">{item.break_date}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Source</div>
          <div className="mt-2 text-lg font-semibold">
            {item.source_name || '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Order #</div>
          <div className="mt-2 text-lg font-semibold">
            {item.order_number || '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Total Cost</div>
          <div className="mt-2 text-lg font-semibold">{money(item.total_cost)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Items Received</div>
          <div className="mt-2 text-lg font-semibold">{itemsReceived}</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="text-sm font-medium text-zinc-200">How this works</div>
        <div className="mt-2 space-y-1 text-sm text-zinc-400">
          <p>Use Single Item for individual items and Lot for grouped items like team lots.</p>
          <p>Defaults are Single Item, Qty 1, and For Sale.</p>
          <p>Default year is pulled from the break title first, then linked Whatnot order titles, and falls back to the current year.</p>
          <p>Blank rows are ignored completely.</p>
          <p>Only rows you actually fill in count toward the total items received.</p>
          <p>If you want a lot, enter it explicitly, such as Blue Jays Lot with Qty 10.</p>
          <p>Quantity counts toward the total items received for this break.</p>
          <p>Choose each row as For Sale, Personal Collection, or Junk during entry.</p>
          <p>Junk items remain tracked for recordkeeping but are not available for sale.</p>
          <p>Autosave keeps your in-progress entry in this browser for this break.</p>
          <p>If total entered quantity is too high, small restore payloads can still stay on the page so you can fix them instead of starting over.</p>
          <p>Large entries should not rely on URL restore anymore.</p>
          <p>Equal break cost is split across the total quantity you entered.</p>
          <p>Speed mode: Tab works normally, and Enter/Return moves to the next row’s Item / Player / Lot Name field.</p>
        </div>
      </div>

      <form
        action={addBreakCardsAction}
        className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
      >
        <input type="hidden" name="break_id" value={item.id} />
        <input type="hidden" name="card_count" value={rowCount} />
        <input type="hidden" name="cards_received" value={itemsReceived} />

        <div className="mb-5 text-sm text-zinc-400">
          This break has <span className="font-medium text-zinc-200">{itemsReceived}</span> item(s) received, and only the quantities from filled rows will count toward that total.
        </div>

        <div className="sticky top-[72px] z-40 mb-5 flex justify-end rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-3 backdrop-blur">
          <button
            type="submit"
            className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Add Items To Inventory
          </button>
        </div>

        <BreakCardEntryGrid
          breakId={item.id}
          rowCount={rowCount}
          defaultYear={defaultYear}
          defaultSet={defaultSet}
          initialRows={restoredRows}
        />

        <div className="mt-5 flex justify-end gap-3">
          <Link
            href={`/app/breaks/${item.id}`}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Add Items To Inventory
          </button>
        </div>
      </form>
    </div>
  )
}