import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addBreakChecklistCardsAction } from '@/app/actions/breaks'
import BreakCardEntryGrid from './BreakCardEntryGrid'
import ChecklistBreakEntry from './ChecklistBreakEntry'

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

type ChecklistOption = {
  id: string
  name: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  sport: string | null
}

type ChecklistSection = {
  id: string
  checklist_id: string
  name: string
  sort_order: number | null
}

type ChecklistItem = {
  id: string
  checklist_id: string
  section_id: string
  card_number: string
  player_name: string
  printed_team: string | null
  parallel_name: string | null
  variation: string | null
  rookie_flag: boolean
  auto_flag: boolean
  relic_flag: boolean
  serial_flag: boolean
  print_run: number | null
  quantity_required: number
  sort_order: number | null
  notes: string | null
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

  const match = String(text).match(
    /\b(?:19|20)\d{2}(?:\s*[-/]\s*\d{2,4})?\b/
  )

  return match ? match[0].replace(/\s+/g, '') : ''
}

function extractSetFromText(text: string | null | undefined, year: string) {
  if (!text) return ''
  if (!year) return String(text).trim()

  return String(text)
    .replace(/\b(?:19|20)\d{2}(?:\s*[-/]\s*\d{2,4})?\b/, '')
    .replace(/\s+/g, ' ')
    .trim()
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

async function loadChecklistItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checklistIds: string[]
) {
  const rows: ChecklistItem[] = []
  const pageSize = 500

  for (const checklistId of checklistIds) {
    let from = 0

    while (true) {
      const to = from + pageSize - 1

      const { data, error } = await supabase
        .from('checklist_items')
        .select(
          'id, checklist_id, section_id, card_number, player_name, printed_team, parallel_name, variation, rookie_flag, auto_flag, relic_flag, serial_flag, print_run, quantity_required, sort_order, notes'
        )
        .eq('checklist_id', checklistId)
        .order('sort_order', { ascending: true })
        .range(from, to)

      if (error) {
        throw new Error(`Unable to load checklist items: ${error.message}`)
      }

      const batch = (data ?? []) as ChecklistItem[]
      rows.push(...batch)

      if (batch.length < pageSize) break
      from += pageSize
    }
  }

  return rows
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
    entry_mode?: string
  }>
}) {
  const { id } = await params
  const pageParams = searchParams ? await searchParams : undefined
  const pageError = pageParams?.error
  const entryMode = pageParams?.entry_mode === 'checklist' ? 'checklist' : 'manual'

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

  const [
    breakResponse,
    linkedOrdersResponse,
    existingItemsResponse,
    checklistResponse,
  ] = await Promise.all([
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

    supabase
      .from('inventory_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('source_type', 'break')
      .eq('source_break_id', id),

    supabase
      .from('checklists')
      .select(
        'id, name, year, manufacturer, brand, product_name, sport'
      )
      .or(`visibility.eq.global,owner_user_id.eq.${user.id}`)
      .order('year', { ascending: false })
      .order('name', { ascending: true }),
  ])

  if (breakResponse.error || !breakResponse.data) {
    notFound()
  }

  if (checklistResponse.error) {
    throw new Error(`Unable to load checklists: ${checklistResponse.error.message}`)
  }

  const item = breakResponse.data as BreakRow
  const linkedOrders = (linkedOrdersResponse.data ?? []) as LinkedWhatnotOrderRow[]
  const checklists = (checklistResponse.data ?? []) as ChecklistOption[]
  const checklistIds = checklists.map((checklist) => checklist.id)

  let checklistSections: ChecklistSection[] = []
  let checklistItems: ChecklistItem[] = []

  if (entryMode === 'checklist' && checklistIds.length > 0) {
    const { data: sectionsData, error: sectionsError } = await supabase
      .from('checklist_sections')
      .select('id, checklist_id, name, sort_order')
      .in('checklist_id', checklistIds)
      .order('sort_order', { ascending: true })

    if (sectionsError) {
      throw new Error(`Unable to load checklist sections: ${sectionsError.message}`)
    }

    checklistSections = (sectionsData ?? []) as ChecklistSection[]
    checklistItems = await loadChecklistItems(supabase, checklistIds)
  }

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
      ? Math.min(Math.max(1, Number(pageParams.row_count)), 2000)
      : itemsReceived > 0
        ? Math.min(itemsReceived, 50)
        : 1

  const droppedOversizedRestore =
    Boolean(pageParams?.restore) && safeRestore == null

  const existingInventoryItems = existingItemsResponse.data ?? []
  const existingItemsCount = existingInventoryItems.length
  const alreadyEnteredCount = existingInventoryItems.reduce(
    (sum, inventoryItem) => sum + Math.max(0, Number(inventoryItem.quantity ?? 0)),
    0
  )
  const remainingCount = Math.max(0, itemsReceived - alreadyEnteredCount)
  const hasExistingItems = existingItemsCount > 0

  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Add Items From Break</h1>
          <p className="app-subtitle">
            Enter items manually or use HITS checklists to quickly record cards received from this break.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/app/breaks/${item.id}`}
            className="app-button-secondary"
          >
            Back to Break
          </Link>
        </div>
      </div>

      {pageError ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>{pageError}</div>
            <Link
              href={`/app/breaks/${item.id}/edit`}
              className="app-button-danger whitespace-nowrap"
            >
              Edit Items Received
            </Link>
          </div>
        </div>
      ) : null}

      {droppedOversizedRestore ? (
        <div className="mt-4 rounded-xl border border-yellow-900 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-200">
          A previous restore payload was too large to safely reload on this page.
          Your break still exists, but large card-entry recovery should not rely on the URL.
        </div>
      ) : null}

      {hasExistingItems ? (
        <div className="mt-4 rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
          This break already has items entered. This page opens as an add-more form so existing inventory is preserved.
        </div>
      ) : null}

      {entryMode === 'manual' ? (
        <div className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          Autosave is enabled for Manual Entry. Large entries should stay recoverable in this browser even if the page refreshes or errors.
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 md:grid-cols-6">
        <div className="app-card-tight p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Break</div>
          <div
            className="mt-1 truncate text-sm font-semibold leading-tight"
            title={item.product_name || 'Untitled break'}
          >
            {item.product_name || 'Untitled break'}
          </div>
        </div>

        <div className="app-card-tight p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Date</div>
          <div className="mt-1 truncate text-sm font-semibold leading-tight">{item.break_date}</div>
        </div>

        <div className="app-card-tight p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Source</div>
          <div
            className="mt-1 truncate text-sm font-semibold leading-tight"
            title={item.source_name || '—'}
          >
            {item.source_name || '—'}
          </div>
        </div>

        <div className="app-card-tight p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Order #</div>
          <div
            className="mt-1 truncate text-sm font-semibold leading-tight"
            title={item.order_number || '—'}
          >
            {item.order_number || '—'}
          </div>
        </div>

        <div className="app-card-tight p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Total Cost</div>
          <div className="mt-1 truncate text-sm font-semibold leading-tight">{money(item.total_cost)}</div>
        </div>

        <Link
          href={`/app/breaks/${item.id}/edit`}
          className="app-card-tight p-2.5 transition hover:bg-zinc-800/70"
        >
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Items Received</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold leading-tight">{itemsReceived}</span>
            <span className="whitespace-nowrap text-[11px] text-zinc-500">Edit</span>
          </div>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-2">
        <Link
          href={`/app/breaks/${item.id}/add-cards?entry_mode=manual`}
          className={entryMode === 'manual' ? 'app-button-primary' : 'app-button'}
        >
          Manual Entry
        </Link>

        <Link
          href={`/app/breaks/${item.id}/add-cards?entry_mode=checklist`}
          className={entryMode === 'checklist' ? 'app-button-primary' : 'app-button'}
        >
          Checklist Entry
        </Link>
      </div>

      {entryMode === 'manual' ? (
        <form
          id={`manual-break-entry-form-${item.id}`}
          action={addBreakChecklistCardsAction}
          className="app-card mt-6"
        >
          <input type="hidden" name="break_id" value={item.id} />
          <input type="hidden" name="cards_received" value={itemsReceived} />
          <input type="hidden" name="entry_mode" value="manual" />

          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
            <span>
              Saved: <span className="font-semibold text-emerald-300">{alreadyEnteredCount}</span>
            </span>
            <span>·</span>
            <span>
              Received: <span className="font-semibold text-zinc-100">{itemsReceived}</span>
            </span>
            <span>·</span>
            <span>
              Remaining before this entry: <span className="font-semibold text-zinc-100">{remainingCount}</span>
            </span>
          </div>

          <div className="sticky top-[72px] z-40 mb-5 flex justify-end rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-3 backdrop-blur">
            <button
              type="submit"
              className="app-button-primary"
            >
              Save All Items To Inventory
            </button>
          </div>

          <BreakCardEntryGrid
            breakId={item.id}
            rowCount={rowCount}
            defaultYear={defaultYear}
            defaultSet={defaultSet}
            initialRows={restoredRows}
            forceFresh={hasExistingItems}
            cardsReceived={itemsReceived}
            alreadyEnteredCount={alreadyEnteredCount}
          />

          <div className="mt-5 flex justify-end gap-3">
            <Link
              href={`/app/breaks/${item.id}`}
              className="app-button-secondary"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="app-button-primary"
            >
              Save All Items To Inventory
            </button>
          </div>
        </form>
      ) : (
        <div className="app-card mt-6">
          <ChecklistBreakEntry
            breakId={item.id}
            cardsReceived={itemsReceived}
            checklists={checklists}
            sections={checklistSections}
            items={checklistItems}
          />
        </div>
      )}
    </div>
  )
}
