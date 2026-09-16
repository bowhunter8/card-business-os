'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  buildSearchTokens,
  buildSearchableText,
  matchesAllSearchTokens,
} from '@/lib/searchAliases'

export type ChecklistMyInventoryChecklist = {
  id: string
  name: string | null
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
}

export type ChecklistMyInventorySection = {
  id: string
  name: string | null
}

export type ChecklistMyInventoryItem = {
  id: string
  section_id: string | null
  card_number: string | null
  player_name: string | null
  printed_team: string | null
  parallel_name: string | null
  variation: string | null
  rookie_flag: boolean | null
  auto_flag: boolean | null
  relic_flag: boolean | null
  serial_flag: boolean | null
  print_run: string | number | null
  notes: string | null
  sort_order: number | null
}

export type ChecklistMyInventoryMatchItem = {
  id: string
  title: string | null
  player_name: string | null
  status: string | null
  quantity: number | null
  available_quantity: number | null
  notes: string | null
  cost_basis_unit: number | null
}

export type ChecklistMyInventoryMatch = {
  checklist_item_id: string
  inventory_item_id: string
  match_score: number
  match_type: string
  is_preferred: boolean
  inventory_items:
    | ChecklistMyInventoryMatchItem
    | ChecklistMyInventoryMatchItem[]
    | null
}

type OwnershipFilter = 'all' | 'owned' | 'missing'

type ChecklistMyInventoryProps = {
  checklist: ChecklistMyInventoryChecklist
  sections: ChecklistMyInventorySection[]
  items: ChecklistMyInventoryItem[]
  matches: ChecklistMyInventoryMatch[]
  onClose?: () => void
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeText(value: unknown) {
  return cleanText(value).toLowerCase()
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function joinedInventoryRow(match: ChecklistMyInventoryMatch) {
  return Array.isArray(match.inventory_items)
    ? match.inventory_items[0] ?? null
    : match.inventory_items
}

function physicalQuantity(inventory: ChecklistMyInventoryMatchItem) {
  const status = normalizeText(inventory.status)
  const available = Math.max(0, Number(inventory.available_quantity ?? 0))
  const quantity = Math.max(0, Number(inventory.quantity ?? 0))

  if (status === 'personal' || status === 'junk') {
    return quantity > 0 ? quantity : available
  }

  return available
}

function strongMatch(match: ChecklistMyInventoryMatch) {
  // My Inventory is a physical-inventory browser, so include the matcher's
  // deliberately protected special-variant family matches (score 59).
  // The normal Checklist ownership UI keeps its existing stricter behavior.
  return match.is_preferred || Number(match.match_score ?? 0) >= 59
}

function inventorySearchText(
  inventory: ChecklistMyInventoryMatchItem,
  item?: ChecklistMyInventoryItem,
  sectionName?: string
) {
  return [
    inventory.title,
    inventory.player_name,
    inventory.notes,
    inventory.status,
    item?.card_number,
    item?.player_name,
    item?.printed_team,
    item?.parallel_name,
    item?.variation,
    item?.notes,
    item?.print_run,
    item?.rookie_flag ? 'rookie rc' : '',
    item?.auto_flag ? 'auto autograph' : '',
    item?.relic_flag ? 'relic' : '',
    item?.serial_flag ? 'serial numbered' : '',
    sectionName,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function checklistSearchText(
  item: ChecklistMyInventoryItem,
  sectionName: string
) {
  return [
    item.card_number,
    item.player_name,
    item.printed_team,
    item.parallel_name,
    item.variation,
    item.notes,
    item.print_run,
    item.rookie_flag ? 'rookie rc' : '',
    item.auto_flag ? 'auto autograph' : '',
    item.relic_flag ? 'relic' : '',
    item.serial_flag ? 'serial numbered' : '',
    sectionName,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function ChecklistMyInventory({
  checklist,
  sections,
  items,
  matches,
  onClose,
}: ChecklistMyInventoryProps) {
  const [notesSearch, setNotesSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [ownershipFilter, setOwnershipFilter] =
    useState<OwnershipFilter>('all')
  const [compareFullChecklist, setCompareFullChecklist] = useState(false)

  const sectionNameById = useMemo(() => {
    const map = new Map<string, string>()

    for (const section of sections) {
      map.set(section.id, cleanText(section.name) || 'Uncategorized')
    }

    return map
  }, [sections])

  const matchesByChecklistItemId = useMemo(() => {
    const map = new Map<string, ChecklistMyInventoryMatch[]>()

    for (const match of matches) {
      if (!strongMatch(match)) continue

      const inventory = joinedInventoryRow(match)
      if (!inventory || physicalQuantity(inventory) <= 0) continue

      if (!map.has(match.checklist_item_id)) {
        map.set(match.checklist_item_id, [])
      }

      map.get(match.checklist_item_id)?.push(match)
    }

    return map
  }, [matches])

  const teams = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => cleanText(item.printed_team))
          .filter(Boolean)
      )
    ).sort(compareText)
  }, [items])

  const orderedSections = useMemo(() => {
    return [...sections].sort((a, b) =>
      compareText(cleanText(a.name), cleanText(b.name))
    )
  }, [sections])

  const rows = useMemo(() => {
    const query = normalizeText(notesSearch)
    const searchTokens = buildSearchTokens(notesSearch)

    return items
      .map((item) => {
        const itemMatches = matchesByChecklistItemId.get(item.id) ?? []
        const inventories = itemMatches
          .map((match) => ({
            match,
            inventory: joinedInventoryRow(match),
          }))
          .filter(
            (
              row
            ): row is {
              match: ChecklistMyInventoryMatch
              inventory: ChecklistMyInventoryMatchItem
            } => row.inventory !== null
          )

        const sectionName = item.section_id
          ? sectionNameById.get(item.section_id) || 'Uncategorized'
          : 'Uncategorized'

        const matchingInventories = query
          ? inventories.filter(({ inventory }) =>
              matchesAllSearchTokens(
                buildSearchableText([
                  inventorySearchText(inventory, item, sectionName),
                ]),
                searchTokens
              )
            )
          : inventories

        const checklistMatchesQuery = query
          ? matchesAllSearchTokens(
              buildSearchableText([checklistSearchText(item, sectionName)]),
              searchTokens
            )
          : true

        const treatmentOwned = query
          ? matchingInventories.length > 0
          : inventories.length > 0

        const normalOwned = inventories.length > 0
        const owned = query && compareFullChecklist
          ? treatmentOwned
          : normalOwned

        return {
          item,
          sectionName,
          inventories,
          matchingInventories,
          checklistMatchesQuery,
          owned,
        }
      })
      .filter((row) => {
        if (teamFilter && cleanText(row.item.printed_team) !== teamFilter) {
          return false
        }

        if (
          sectionFilter &&
          (row.item.section_id || '__uncategorized__') !== sectionFilter
        ) {
          return false
        }

        if (notesSearch.trim()) {
          if (compareFullChecklist) {
            // In comparison mode every checklist identity remains visible.
            // A card is "Owned" only when one of its matched physical inventory
            // records contains the requested treatment/search text.
          } else if (
            row.matchingInventories.length === 0 &&
            !row.checklistMatchesQuery
          ) {
            return false
          }
        }

        if (ownershipFilter === 'owned' && !row.owned) return false
        if (ownershipFilter === 'missing' && row.owned) return false

        return true
      })
      .sort((a, b) => {
        const aSort =
          typeof a.item.sort_order === 'number'
            ? a.item.sort_order
            : Number.MAX_SAFE_INTEGER
        const bSort =
          typeof b.item.sort_order === 'number'
            ? b.item.sort_order
            : Number.MAX_SAFE_INTEGER

        if (aSort !== bSort) return aSort - bSort

        return compareText(
          cleanText(a.item.card_number),
          cleanText(b.item.card_number)
        )
      })
  }, [
    compareFullChecklist,
    items,
    matchesByChecklistItemId,
    notesSearch,
    ownershipFilter,
    sectionFilter,
    sectionNameById,
    teamFilter,
  ])

  const summary = useMemo(() => {
    const query = normalizeText(notesSearch)
    const searchTokens = buildSearchTokens(notesSearch)

    let universe = items

    if (teamFilter) {
      universe = universe.filter(
        (item) => cleanText(item.printed_team) === teamFilter
      )
    }

    if (sectionFilter) {
      universe = universe.filter(
        (item) =>
          (item.section_id || '__uncategorized__') === sectionFilter
      )
    }

    if (query && !compareFullChecklist) {
      universe = universe.filter((item) => {
        const sectionName = item.section_id
          ? sectionNameById.get(item.section_id) || 'Uncategorized'
          : 'Uncategorized'
        const itemMatches = matchesByChecklistItemId.get(item.id) ?? []

        return (
          matchesAllSearchTokens(
            buildSearchableText([checklistSearchText(item, sectionName)]),
            searchTokens
          ) ||
          itemMatches.some((match) => {
            const inventory = joinedInventoryRow(match)
            return inventory
              ? matchesAllSearchTokens(
                  buildSearchableText([
                    inventorySearchText(inventory, item, sectionName),
                  ]),
                  searchTokens
                )
              : false
          })
        )
      })
    }

    let owned = 0

    for (const item of universe) {
      const itemMatches = matchesByChecklistItemId.get(item.id) ?? []
      const sectionName = item.section_id
        ? sectionNameById.get(item.section_id) || 'Uncategorized'
        : 'Uncategorized'

      if (query && compareFullChecklist) {
        const hasTreatment = itemMatches.some((match) => {
          const inventory = joinedInventoryRow(match)
          return inventory
            ? matchesAllSearchTokens(
              buildSearchableText([
                inventorySearchText(inventory, item, sectionName),
              ]),
              searchTokens
            )
            : false
        })

        if (hasTreatment) owned += 1
      } else if (itemMatches.length > 0) {
        owned += 1
      }
    }

    const total = universe.length
    const missing = Math.max(0, total - owned)
    const percent =
      total > 0 ? Math.round((owned / total) * 1000) / 10 : 0

    return { owned, missing, total, percent }
  }, [
    compareFullChecklist,
    items,
    matchesByChecklistItemId,
    notesSearch,
    sectionFilter,
    sectionNameById,
    teamFilter,
  ])

  const activeTreatment = cleanText(notesSearch)

  return (
    <div className="space-y-4 rounded-xl border border-emerald-900 bg-black p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
            My Inventory
          </div>
          <div className="mt-1 text-xl font-bold text-white">
            {cleanText(checklist.name) ||
              cleanText(checklist.product_name) ||
              'Checklist'}
          </div>
          <div className="mt-1 max-w-3xl text-sm text-slate-400">
            View the physical HITS inventory already matched to this checklist.
            Search inventory Notes for treatments such as Refractor, Blue /150,
            Gold Wave, Auto, or any wording you use when entering cards.
          </div>
        </div>

        {onClose ? (
          <button type="button" onClick={onClose} className="app-button">
            Back to Checklist
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.5fr)_220px_220px_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Inventory / Notes Search
          </span>
          <input
            value={notesSearch}
            onChange={(event) => setNotesSearch(event.target.value)}
            placeholder="Refractor, Blue /150, Gold Wave, Auto..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Team
          </span>
          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All Teams</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Section
          </span>
          <select
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All Sections</option>
            {orderedSections.map((section) => (
              <option key={section.id} value={section.id}>
                {cleanText(section.name) || 'Uncategorized'}
              </option>
            ))}
            {items.some((item) => !item.section_id) ? (
              <option value="__uncategorized__">Uncategorized</option>
            ) : null}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setNotesSearch('')
              setTeamFilter('')
              setSectionFilter('')
              setOwnershipFilter('all')
              setCompareFullChecklist(false)
            }}
            className="app-button w-full"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'All'],
            ['owned', 'Owned'],
            ['missing', 'Missing'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setOwnershipFilter(value)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              ownershipFilter === value
                ? 'border-emerald-600 bg-emerald-950 text-emerald-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-900'
            }`}
          >
            {label}
          </button>
        ))}

        <label
          className={`ml-0 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold sm:ml-2 ${
            compareFullChecklist
              ? 'border-cyan-600 bg-cyan-950 text-cyan-100'
              : 'border-slate-700 text-slate-300'
          }`}
          title="When a treatment search is entered, compare matching owned cards against every identity in the filtered checklist."
        >
          <input
            type="checkbox"
            checked={compareFullChecklist}
            disabled={!activeTreatment}
            onChange={(event) =>
              setCompareFullChecklist(event.target.checked)
            }
          />
          Compare against full checklist
        </label>

        {activeTreatment && compareFullChecklist ? (
          <span className="text-xs text-cyan-300">
            Comparing “{activeTreatment}” against the filtered checklist.
          </span>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Completion
          </div>
          <div className="mt-0.5 text-lg font-bold text-cyan-300">
            {summary.percent.toLocaleString()}%
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Owned
          </div>
          <div className="mt-0.5 text-lg font-bold text-emerald-300">
            {summary.owned.toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Missing
          </div>
          <div className="mt-0.5 text-lg font-bold text-amber-300">
            {summary.missing.toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Checklist Cards
          </div>
          <div className="mt-0.5 text-lg font-bold text-white">
            {summary.total.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-[90px_minmax(180px,1.2fr)_minmax(140px,1fr)_minmax(130px,1fr)_110px_minmax(220px,1.4fr)_80px] gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <div>Card #</div>
          <div>Player / Item</div>
          <div>Team</div>
          <div>Section</div>
          <div>Status</div>
          <div>Matched Inventory / Notes</div>
          <div>Open</div>
        </div>

        <div className="max-h-[58vh] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No checklist cards match these My Inventory filters.
            </div>
          ) : (
            rows.map((row) => {
              const displayInventories =
                activeTreatment && !compareFullChecklist
                  ? row.matchingInventories.length > 0
                    ? row.matchingInventories
                    : row.inventories
                  : activeTreatment && compareFullChecklist
                    ? row.matchingInventories
                    : row.inventories

              return (
                <div
                  key={row.item.id}
                  className="grid grid-cols-[90px_minmax(180px,1.2fr)_minmax(140px,1fr)_minmax(130px,1fr)_110px_minmax(220px,1.4fr)_80px] items-start gap-3 border-b border-slate-900 px-3 py-3 text-sm last:border-b-0 hover:bg-slate-950"
                >
                  <div className="font-mono text-slate-300">
                    {cleanText(row.item.card_number) || '—'}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">
                      {cleanText(row.item.player_name) || 'Unnamed card'}
                    </div>
                    {cleanText(row.item.parallel_name) ||
                    cleanText(row.item.variation) ? (
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {[row.item.parallel_name, row.item.variation]
                          .map(cleanText)
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-slate-300">
                    {cleanText(row.item.printed_team) || '—'}
                  </div>

                  <div className="text-slate-300">{row.sectionName}</div>

                  <div>
                    {row.owned ? (
                      <span className="app-badge app-badge-success">
                        Owned
                      </span>
                    ) : (
                      <span className="app-badge">Missing</span>
                    )}
                  </div>

                  <div className="min-w-0 space-y-2">
                    {displayInventories.length > 0 ? (
                      displayInventories.map(({ match, inventory }) => (
                        <div
                          key={`${row.item.id}-${inventory.id}`}
                          className="rounded-lg border border-slate-800 bg-black px-2.5 py-2"
                        >
                          <div className="truncate font-medium text-slate-100">
                            {cleanText(inventory.title) ||
                              cleanText(inventory.player_name) ||
                              'Inventory Item'}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>
                              {cleanText(inventory.status) || 'Unknown'}
                            </span>
                            <span>
                              Qty {physicalQuantity(inventory).toLocaleString()}
                            </span>
                            <span>
                              Match {Number(match.match_score ?? 0)}
                            </span>
                          </div>
                          {cleanText(inventory.notes) ? (
                            <div className="mt-1 wrap-break-word text-xs text-cyan-200">
                              Notes: {cleanText(inventory.notes)}
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </div>

                  <div>
                    {displayInventories[0]?.inventory ? (
                      <Link
                        href={`/app/inventory/${displayInventories[0].inventory.id}`}
                        className="rounded-lg border border-sky-700 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-950"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="text-xs leading-relaxed text-slate-500">
        My Inventory uses the checklist&apos;s existing saved HITS inventory
        matches. It does not create, change, or replace checklist matching.
        Treatment searches read your existing inventory text/Notes. “Compare
        against full checklist” is intentionally opt-in because HITS should not
        assume every parallel or treatment exists for every checklist card.
      </div>
    </div>
  )
}
