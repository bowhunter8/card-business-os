import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChecklistAutoMatcher from '@/app/components/ChecklistAutoMatcher'
import { buildChecklistSetAction } from '@/app/actions/inventory-builds'

type ChecklistRow = {
  id: string
  owner_user_id: string | null
  visibility: string
  sport: string | null
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  name: string
  source_type: string | null
  source_reference: string | null
  verified: boolean
  notes: string | null
  created_at: string
}

type ChecklistSectionRow = {
  id: string
  checklist_id: string
  name: string
  section_type: string | null
  sort_order: number | null
  notes: string | null
}

type ChecklistItemRow = {
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

type ChecklistMatchRow = {
  checklist_item_id: string
  inventory_item_id: string
  match_score: number
  match_type: string
  is_preferred: boolean
  inventory_items:
    | {
        id: string
        title: string | null
        player_name: string | null
        status: string | null
        quantity: number | null
        available_quantity: number | null
        notes: string | null
        cost_basis_unit: number | null
        source_type: string | null
        source_reference: string | null
      }
    | {
        id: string
        title: string | null
        player_name: string | null
        status: string | null
        quantity: number | null
        available_quantity: number | null
        notes: string | null
        cost_basis_unit: number | null
        source_type: string | null
        source_reference: string | null
      }[]
    | null
}

type ViewMode = 'team' | 'section'
type OwnershipFilter = 'all' | 'owned' | 'missing' | 'needed'

type PageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    view?: string | string[]
    team?: string | string[]
    section?: string | string[]
    q?: string | string[]
    matchItem?: string | string[]
    ownership?: string | string[]
    builds?: string | string[]
    reviewBuild?: string | string[]
    buildSuccess?: string | string[]
    buildError?: string | string[]
  }>
}

const PAGE_SIZE = 500

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function normalize(value: string | null | undefined) {
  return clean(value).toLowerCase()
}

function checklistMeta(checklist: ChecklistRow) {
  const parts = [
    clean(checklist.year),
    clean(checklist.manufacturer),
    clean(checklist.brand),
    clean(checklist.product_name),
  ].filter(Boolean)

  return Array.from(new Set(parts)).join(' • ')
}

function splitTeams(value: string | null | undefined) {
  const source = clean(value)

  if (!source) return []

  return Array.from(
    new Set(
      source
        .split(/\s*\/\s*|\s*\|\s*/)
        .map((team) => team.trim())
        .filter(Boolean)
    )
  )
}

function itemTeams(item: ChecklistItemRow) {
  const teams = splitTeams(item.printed_team)
  return teams.length > 0 ? teams : ['Unassigned']
}

function itemMatchesSearch(
  item: ChecklistItemRow,
  sectionName: string,
  query: string
) {
  if (!query) return true

  const haystack = [
    item.card_number,
    item.player_name,
    item.printed_team,
    item.parallel_name,
    item.variation,
    item.notes,
    sectionName,
  ]
    .map((value) => normalize(value))
    .join(' ')

  return haystack.includes(query)
}

function parseNotesPlayerQuantity(
  notes: string | null | undefined,
  playerName: string
) {
  const source = clean(notes)
  const target = normalize(playerName)

  if (!source || !target) return 0

  const segments = source
    .split(/[\n,;|]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean)

  for (const segment of segments) {
    const withoutPrefix = segment.includes(':')
      ? segment.slice(segment.indexOf(':') + 1).trim()
      : segment

    const suffixMatch = withoutPrefix.match(
      /^(.*?)(?:\s+|\s*[-–—]\s*)x\s*(\d+)\s*$/i
    )
    const parenMatch = withoutPrefix.match(
      /^(.*?)\s*\(\s*x?\s*(\d+)\s*\)\s*$/i
    )
    const prefixMatch = withoutPrefix.match(/^(\d+)\s*x\s+(.+)$/i)

    let name = withoutPrefix
    let quantity = 1

    if (suffixMatch) {
      name = suffixMatch[1]
      quantity = Math.max(1, Number(suffixMatch[2]))
    } else if (parenMatch) {
      name = parenMatch[1]
      quantity = Math.max(1, Number(parenMatch[2]))
    } else if (prefixMatch) {
      name = prefixMatch[2]
      quantity = Math.max(1, Number(prefixMatch[1]))
    }

    if (normalize(name) === target) return quantity
  }

  return 0
}

function joinedInventoryRow(match: ChecklistMatchRow) {
  return Array.isArray(match.inventory_items)
    ? match.inventory_items[0] ?? null
    : match.inventory_items
}

function physicalQuantityForInventory(
  inventory: NonNullable<ReturnType<typeof joinedInventoryRow>>
) {
  const status = clean(inventory.status).toLowerCase()
  const available = Math.max(0, Number(inventory.available_quantity ?? 0))
  const quantity = Math.max(0, Number(inventory.quantity ?? 0))

  if (status === 'personal' || status === 'junk') {
    return quantity > 0 ? quantity : available
  }

  return available
}

function inventoryStatusLabel(status: string | null | undefined) {
  const value = clean(status).toLowerCase()

  if (value === 'available') return 'Available'
  if (value === 'listed') return 'Listed'
  if (value === 'personal') return 'Personal'
  if (value === 'junk') return 'Junk'

  return clean(status) || 'Unknown'
}

function ownershipForItem(
  item: ChecklistItemRow,
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
) {
  const matches = matchesByChecklistItemId.get(item.id) ?? []

  const strongMatches = matches.filter(
    (match) => match.is_preferred || Number(match.match_score ?? 0) >= 60
  )

  let copies = 0
  let notesDerived = false

  for (const match of strongMatches) {
    const inventory = joinedInventoryRow(match)

    if (!inventory) continue

    const notesQuantity = parseNotesPlayerQuantity(
      inventory.notes,
      item.player_name
    )

    const physicalQuantity = physicalQuantityForInventory(inventory)

    if (notesQuantity > 0) {
      copies += Math.min(notesQuantity, physicalQuantity)
      notesDerived = true
      continue
    }

    copies += physicalQuantity
  }

  return {
    owned: copies > 0,
    copies,
    notesDerived,
  }
}

type SectionCompletionSummary = {
  sectionId: string
  sectionName: string
  totalCards: number
  ownedCards: number
  missingCards: number
  potentialCompleteSets: number
  status: 'complete' | 'near' | 'partial' | 'none'
}

function sectionCompletionForItems(
  items: ChecklistItemRow[],
  sectionNameById: Map<string, string>,
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
) {
  const bySection = new Map<string, ChecklistItemRow[]>()

  for (const item of items) {
    const existing = bySection.get(item.section_id)

    if (existing) {
      existing.push(item)
    } else {
      bySection.set(item.section_id, [item])
    }
  }

  const summaries: SectionCompletionSummary[] = []

  for (const [sectionId, sectionItems] of bySection.entries()) {
    const ownership = sectionItems.map((item) =>
      ownershipForItem(item, matchesByChecklistItemId)
    )

    const ownedCards = ownership.filter((entry) => entry.owned).length
    const totalCards = sectionItems.length
    const missingCards = Math.max(0, totalCards - ownedCards)

    const potentialCompleteSets =
      totalCards > 0 && missingCards === 0
        ? Math.max(
            0,
            Math.min(
              ...ownership.map((entry) => Math.max(0, Number(entry.copies ?? 0)))
            )
          )
        : 0

    let status: SectionCompletionSummary['status'] = 'none'

    if (missingCards === 0 && totalCards > 0) {
      status = 'complete'
    } else if (ownedCards > 0 && missingCards <= 2) {
      status = 'near'
    } else if (ownedCards > 0) {
      status = 'partial'
    }

    summaries.push({
      sectionId,
      sectionName: sectionNameById.get(sectionId) || 'Unknown Section',
      totalCards,
      ownedCards,
      missingCards,
      potentialCompleteSets,
      status,
    })
  }

  return summaries.sort((a, b) => {
    const statusRank: Record<SectionCompletionSummary['status'], number> = {
      complete: 0,
      near: 1,
      partial: 2,
      none: 3,
    }

    const rankDifference = statusRank[a.status] - statusRank[b.status]
    if (rankDifference !== 0) return rankDifference

    const aPercent = a.totalCards > 0 ? a.ownedCards / a.totalCards : 0
    const bPercent = b.totalCards > 0 ? b.ownedCards / b.totalCards : 0

    if (aPercent !== bPercent) return bPercent - aPercent

    return a.sectionName.localeCompare(b.sectionName, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}


type BuildProposalRow = {
  checklistItem: ChecklistItemRow
  inventory: NonNullable<ReturnType<typeof joinedInventoryRow>> | null
  match: ChecklistMatchRow | null
  quantityUsed: number
  notesDerived: boolean
  protectedStatus: boolean
  issue: string | null
}

type BuildProposal = {
  rows: BuildProposalRow[]
  totalCostBasis: number
  ready: boolean
  protectedCount: number
  unresolvedCount: number
}

function inventoryPreferenceRank(
  inventory: NonNullable<ReturnType<typeof joinedInventoryRow>>
) {
  const status = clean(inventory.status).toLowerCase()

  if (status === 'available') return 0
  if (status === 'junk') return 1
  if (status === 'listed') return 2
  if (status === 'personal') return 3

  return 4
}

function buildProposalForSection(
  sectionItems: ChecklistItemRow[],
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
): BuildProposal {
  const rowRemaining = new Map<string, number>()
  const playerRemaining = new Map<string, number>()

  const getRowRemaining = (
    inventory: NonNullable<ReturnType<typeof joinedInventoryRow>>
  ) => {
    if (!rowRemaining.has(inventory.id)) {
      rowRemaining.set(
        inventory.id,
        Math.max(0, physicalQuantityForInventory(inventory))
      )
    }

    return rowRemaining.get(inventory.id) ?? 0
  }

  const getPlayerRemaining = (
    inventory: NonNullable<ReturnType<typeof joinedInventoryRow>>,
    item: ChecklistItemRow
  ) => {
    const notesQuantity = parseNotesPlayerQuantity(
      inventory.notes,
      item.player_name
    )

    if (notesQuantity <= 0) return Number.POSITIVE_INFINITY

    const key = `${inventory.id}::${normalize(item.player_name)}`

    if (!playerRemaining.has(key)) {
      playerRemaining.set(
        key,
        Math.min(notesQuantity, physicalQuantityForInventory(inventory))
      )
    }

    return playerRemaining.get(key) ?? 0
  }

  const rows: BuildProposalRow[] = []

  const orderedItems = [...sectionItems].sort((a, b) => {
    const aCandidates = matchedInventoryForItem(
      a,
      matchesByChecklistItemId
    ).length
    const bCandidates = matchedInventoryForItem(
      b,
      matchesByChecklistItemId
    ).length

    if (aCandidates !== bCandidates) return aCandidates - bCandidates

    return String(a.card_number).localeCompare(String(b.card_number), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  for (const item of orderedItems) {
    const candidates = matchedInventoryForItem(
      item,
      matchesByChecklistItemId
    )
      .filter(({ inventory }) => {
        const rowAvailable = getRowRemaining(inventory)
        const playerAvailable = getPlayerRemaining(inventory, item)

        return rowAvailable > 0 && playerAvailable > 0
      })
      .sort((a, b) => {
        const preferredDifference =
          Number(Boolean(b.match.is_preferred)) -
          Number(Boolean(a.match.is_preferred))

        if (preferredDifference !== 0) return preferredDifference

        const statusDifference =
          inventoryPreferenceRank(a.inventory) -
          inventoryPreferenceRank(b.inventory)

        if (statusDifference !== 0) return statusDifference

        return Number(b.match.match_score ?? 0) - Number(a.match.match_score ?? 0)
      })

    const selected = candidates[0] ?? null

    if (!selected) {
      rows.push({
        checklistItem: item,
        inventory: null,
        match: null,
        quantityUsed: 0,
        notesDerived: false,
        protectedStatus: false,
        issue: 'No allocatable physical match',
      })
      continue
    }

    const notesQuantity = parseNotesPlayerQuantity(
      selected.inventory.notes,
      item.player_name
    )

    rowRemaining.set(
      selected.inventory.id,
      Math.max(0, getRowRemaining(selected.inventory) - 1)
    )

    if (notesQuantity > 0) {
      const playerKey = `${selected.inventory.id}::${normalize(item.player_name)}`
      playerRemaining.set(
        playerKey,
        Math.max(
          0,
          getPlayerRemaining(selected.inventory, item) - 1
        )
      )
    }

    const status = clean(selected.inventory.status).toLowerCase()
    const protectedStatus = status === 'listed' || status === 'personal'

    rows.push({
      checklistItem: item,
      inventory: selected.inventory,
      match: selected.match,
      quantityUsed: 1,
      notesDerived: notesQuantity > 0,
      protectedStatus,
      issue: protectedStatus
        ? `${inventoryStatusLabel(selected.inventory.status)} inventory should be reviewed before building`
        : null,
    })
  }

  rows.sort((a, b) =>
    String(a.checklistItem.card_number).localeCompare(
      String(b.checklistItem.card_number),
      undefined,
      {
        numeric: true,
        sensitivity: 'base',
      }
    )
  )

  const totalCostBasis = rows.reduce(
    (sum, row) =>
      sum +
      (row.inventory
        ? Math.max(0, Number(row.inventory.cost_basis_unit ?? 0)) *
          row.quantityUsed
        : 0),
    0
  )

  const unresolvedCount = rows.filter((row) => !row.inventory).length
  const protectedCount = rows.filter((row) => row.protectedStatus).length

  return {
    rows,
    totalCostBasis,
    ready: unresolvedCount === 0 && protectedCount === 0,
    protectedCount,
    unresolvedCount,
  }
}

function CompletionStatusBadge({
  summary,
}: {
  summary: SectionCompletionSummary
}) {
  if (summary.status === 'complete') {
    return (
      <span className="app-badge app-badge-success">
        Complete
      </span>
    )
  }

  if (summary.status === 'near') {
    return (
      <span className="app-badge app-badge-info">
        Near Complete
      </span>
    )
  }

  if (summary.status === 'partial') {
    return <span className="app-badge">In Progress</span>
  }

  return <span className="app-badge">No Matches</span>
}

function itemMatchesOwnershipFilter(
  item: ChecklistItemRow,
  filter: OwnershipFilter,
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
) {
  if (filter === 'all') return true

  const ownership = ownershipForItem(item, matchesByChecklistItemId)

  if (filter === 'owned') return ownership.owned
  if (filter === 'missing') return !ownership.owned

  // "Needed" is the shopping/break view: cards that HITS cannot currently
  // prove you own. This intentionally stays conservative until actual builds
  // reserve/consume copies and we can calculate "needed for the next set".
  return !ownership.owned
}

function matchedInventoryForItem(
  item: ChecklistItemRow,
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
) {
  return (matchesByChecklistItemId.get(item.id) ?? [])
    .filter(
      (match) => match.is_preferred || Number(match.match_score ?? 0) >= 60
    )
    .map((match) => ({
      match,
      inventory: joinedInventoryRow(match),
    }))
    .filter(
      (
        row
      ): row is {
        match: ChecklistMatchRow
        inventory: NonNullable<ReturnType<typeof joinedInventoryRow>>
      } => Boolean(row.inventory)
    )
}

function OwnershipBadge({
  item,
  matchesByChecklistItemId,
}: {
  item: ChecklistItemRow
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
}) {
  const ownership = ownershipForItem(item, matchesByChecklistItemId)

  if (!ownership.owned) {
    return <span className="app-badge">Missing</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="app-badge app-badge-success">
        {ownership.copies > 1 ? `${ownership.copies} copies` : 'Owned ✓'}
      </span>

      {ownership.notesDerived && (
        <span
          className="app-badge app-badge-info"
          title="Matched from a grouped inventory item's notes."
        >
          Notes
        </span>
      )}
    </div>
  )
}

function CardBadges({ item }: { item: ChecklistItemRow }) {
  const badges: string[] = []

  if (item.rookie_flag) badges.push('RC')
  if (item.auto_flag) badges.push('Auto')
  if (item.relic_flag) badges.push('Relic')
  if (item.serial_flag) badges.push('Serial')

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span key={badge} className="app-badge app-badge-info">
          {badge}
        </span>
      ))}
    </div>
  )
}

function ChecklistTable({
  items,
  sectionNameById,
  showSection,
  emptyMessage,
  matchesByChecklistItemId,
  checklistId,
  view,
  selectedTeam,
  selectedSection,
  searchText,
  ownershipFilter,
}: {
  items: ChecklistItemRow[]
  sectionNameById: Map<string, string>
  showSection: boolean
  emptyMessage: string
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
  checklistId: string
  view: ViewMode
  selectedTeam: string
  selectedSection: string
  searchText: string
  ownershipFilter: OwnershipFilter
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-6 text-center text-sm text-zinc-400">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <div className="overflow-x-auto">
        <table className="w-full min-w-230 text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-3">Card #</th>
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Team</th>
              {showSection && <th className="px-3 py-3">Section</th>}
              <th className="px-3 py-3">Owned</th>
              <th className="px-3 py-3">Details</th>
              <th className="px-3 py-3">Flags</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800 bg-black/20">
            {items.map((item) => {
              const ownership = ownershipForItem(
                item,
                matchesByChecklistItemId
              )

              const matchParams = new URLSearchParams()
              matchParams.set('view', view)

              if (view === 'team' && selectedTeam) {
                matchParams.set('team', selectedTeam)
              }

              if (view === 'section' && selectedSection) {
                matchParams.set('section', selectedSection)

                if (selectedTeam) {
                  matchParams.set('team', selectedTeam)
                }
              }

              if (searchText) {
                matchParams.set('q', searchText)
              }

              if (ownershipFilter !== 'all') {
                matchParams.set('ownership', ownershipFilter)
              }

              matchParams.set('matchItem', item.id)

              const matchHref = ownership.owned
                ? `/app/checklists/${checklistId}?${matchParams.toString()}#matched-inventory`
                : ''

              const details = [
                clean(item.parallel_name),
                clean(item.variation),
                item.print_run ? `/${item.print_run}` : '',
                clean(item.notes),
              ].filter(Boolean)

              const cellLinkClass =
                'block h-full w-full cursor-pointer px-3 py-3'

              return (
                <tr
                  key={item.id}
                  className={`align-top hover:bg-zinc-900/60 ${
                    ownership.owned ? 'cursor-pointer' : ''
                  }`}
                >
                  <td className="whitespace-nowrap p-0 font-semibold text-cyan-200">
                    {ownership.owned ? (
                      <Link
                        href={matchHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cellLinkClass}
                      >
                        {item.card_number}
                      </Link>
                    ) : (
                      <div className="px-3 py-3">{item.card_number}</div>
                    )}
                  </td>

                  <td className="p-0 font-medium text-zinc-100">
                    {ownership.owned ? (
                      <Link
                        href={matchHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cellLinkClass}
                      >
                        {item.player_name}
                      </Link>
                    ) : (
                      <div className="px-3 py-3">{item.player_name}</div>
                    )}
                  </td>

                  <td className="p-0 text-zinc-300">
                    {ownership.owned ? (
                      <Link
                        href={matchHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cellLinkClass}
                      >
                        {clean(item.printed_team) || '—'}
                      </Link>
                    ) : (
                      <div className="px-3 py-3">
                        {clean(item.printed_team) || '—'}
                      </div>
                    )}
                  </td>

                  {showSection && (
                    <td className="p-0 text-zinc-300">
                      {ownership.owned ? (
                        <Link
                        href={matchHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cellLinkClass}
                      >
                          {sectionNameById.get(item.section_id) ||
                            'Unknown Section'}
                        </Link>
                      ) : (
                        <div className="px-3 py-3">
                          {sectionNameById.get(item.section_id) ||
                            'Unknown Section'}
                        </div>
                      )}
                    </td>
                  )}

                  <td className="p-0">
                    {ownership.owned ? (
                      <Link
                        href={matchHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cellLinkClass}
                      >
                        <OwnershipBadge
                          item={item}
                          matchesByChecklistItemId={matchesByChecklistItemId}
                        />
                      </Link>
                    ) : (
                      <div className="px-3 py-3">
                        <OwnershipBadge
                          item={item}
                          matchesByChecklistItemId={matchesByChecklistItemId}
                        />
                      </div>
                    )}
                  </td>

                  <td className="p-0 text-zinc-400">
                    {ownership.owned ? (
                      <Link
                        href={matchHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cellLinkClass}
                      >
                        {details.length > 0 ? details.join(' • ') : '—'}
                      </Link>
                    ) : (
                      <div className="px-3 py-3">
                        {details.length > 0 ? details.join(' • ') : '—'}
                      </div>
                    )}
                  </td>

                  <td className="p-0">
                    {ownership.owned ? (
                      <Link
                        href={matchHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cellLinkClass}
                      >
                        <CardBadges item={item} />
                      </Link>
                    ) : (
                      <div className="px-3 py-3">
                        <CardBadges item={item} />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function TeamSectionChecklistTables({
  items,
  sections,
  sectionNameById,
  matchesByChecklistItemId,
  checklistId,
  selectedTeam,
  searchText,
  ownershipFilter,
}: {
  items: ChecklistItemRow[]
  sections: ChecklistSectionRow[]
  sectionNameById: Map<string, string>
  matchesByChecklistItemId: Map<string, ChecklistMatchRow[]>
  checklistId: string
  selectedTeam: string
  searchText: string
  ownershipFilter: OwnershipFilter
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-6 text-center text-sm text-zinc-400">
        No checklist cards match this team and filter.
      </div>
    )
  }

  const sectionOrder = new Map(
    sections.map((section, index) => [section.id, index])
  )

  const grouped = new Map<string, ChecklistItemRow[]>()

  for (const item of items) {
    const existing = grouped.get(item.section_id)
    if (existing) {
      existing.push(item)
    } else {
      grouped.set(item.section_id, [item])
    }
  }

  const groups = Array.from(grouped.entries())
    .map(([sectionId, sectionItems]) => ({
      sectionId,
      sectionName: sectionNameById.get(sectionId) || 'Unknown Section',
      items: sectionItems,
      order: sectionOrder.get(sectionId) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return a.sectionName.localeCompare(b.sectionName, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {groups.map((group) => {
        const ownedCount = group.items.filter(
          (item) => ownershipForItem(item, matchesByChecklistItemId).owned
        ).length

        return (
          <details
            key={group.sectionId}
            className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/30 open:col-span-full"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-zinc-900/70 [&::-webkit-details-marker]:hidden">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-sm text-cyan-300">▶</span>
                <span className="truncate font-semibold text-zinc-100">
                  {group.sectionName}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {ownedCount > 0 && (
                  <span className="app-badge app-badge-success">
                    {ownedCount} owned
                  </span>
                )}
                <span className="app-badge">
                  {group.items.length} card
                  {group.items.length === 1 ? '' : 's'}
                </span>
              </div>
            </summary>

            <div className="border-t border-zinc-800 p-3">
              <ChecklistTable
                items={group.items}
                sectionNameById={sectionNameById}
                showSection={false}
                emptyMessage="No cards in this section."
                matchesByChecklistItemId={matchesByChecklistItemId}
                checklistId={checklistId}
                view="team"
                selectedTeam={selectedTeam}
                selectedSection={group.sectionId}
                searchText={searchText}
                ownershipFilter={ownershipFilter}
              />
            </div>
          </details>
        )
      })}
    </div>
  )
}

async function loadChecklistMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  checklistItemIds: string[]
) {
  const rows: ChecklistMatchRow[] = []
  const MATCH_ID_BATCH_SIZE = 100

  for (
    let index = 0;
    index < checklistItemIds.length;
    index += MATCH_ID_BATCH_SIZE
  ) {
    const batchIds = checklistItemIds.slice(
      index,
      index + MATCH_ID_BATCH_SIZE
    )

    const { data, error } = await supabase
      .from('checklist_inventory_matches')
      .select(
        'checklist_item_id, inventory_item_id, match_score, match_type, is_preferred, inventory_items!inner(id, title, player_name, status, quantity, available_quantity, notes, cost_basis_unit, source_type, source_reference)'
      )
      .eq('user_id', userId)
      .in('checklist_item_id', batchIds)

    if (error) throw error

    rows.push(...((data ?? []) as ChecklistMatchRow[]))
  }

  return rows
}

async function loadAllChecklistItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checklistId: string
) {
  const rows: ChecklistItemRow[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('checklist_items')
      .select(
        'id, checklist_id, section_id, card_number, player_name, printed_team, parallel_name, variation, rookie_flag, auto_flag, relic_flag, serial_flag, print_run, quantity_required, sort_order, notes'
      )
      .eq('checklist_id', checklistId)
      .order('sort_order', { ascending: true })
      .range(from, to)

    if (error) throw error

    const batch = (data ?? []) as ChecklistItemRow[]
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break

    from += PAGE_SIZE
  }

  return rows
}

export default async function ChecklistDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const queryParams = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: checklistData, error: checklistError } = await supabase
    .from('checklists')
    .select(
      'id, owner_user_id, visibility, sport, year, manufacturer, brand, product_name, name, source_type, source_reference, verified, notes, created_at'
    )
    .eq('id', id)
    .maybeSingle()

  if (checklistError) {
    throw new Error(`Unable to load checklist: ${checklistError.message}`)
  }

  if (!checklistData) notFound()

  const checklist = checklistData as ChecklistRow

  const { data: sectionsData, error: sectionsError } = await supabase
    .from('checklist_sections')
    .select('id, checklist_id, name, section_type, sort_order, notes')
    .eq('checklist_id', checklist.id)
    .order('sort_order', { ascending: true })

  if (sectionsError) {
    throw new Error(`Unable to load checklist sections: ${sectionsError.message}`)
  }

  const sections = (sectionsData ?? []) as ChecklistSectionRow[]
  const items = await loadAllChecklistItems(supabase, checklist.id)

  const itemIds = items.map((item) => item.id)

  let checklistMatches: ChecklistMatchRow[] = []

  try {
    checklistMatches =
      itemIds.length > 0
        ? await loadChecklistMatches(supabase, user.id, itemIds)
        : []
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown match loading error.'

    throw new Error(`Unable to load inventory matches: ${message}`)
  }
  const matchesByChecklistItemId = new Map<string, ChecklistMatchRow[]>()

  for (const match of checklistMatches) {
    const existing = matchesByChecklistItemId.get(match.checklist_item_id)

    if (existing) {
      existing.push(match)
    } else {
      matchesByChecklistItemId.set(match.checklist_item_id, [match])
    }
  }

  const sectionNameById = new Map(
    sections.map((section) => [section.id, section.name])
  )

  const requestedView = firstParam(queryParams.view)
  const view: ViewMode = requestedView === 'section' ? 'section' : 'team'

  const selectedTeam = firstParam(queryParams.team)
  const selectedSection = firstParam(queryParams.section)
  const searchText = firstParam(queryParams.q).trim()
  const normalizedSearch = normalize(searchText)
  const requestedOwnership = firstParam(queryParams.ownership)
  const ownershipFilter: OwnershipFilter =
    requestedOwnership === 'owned' ||
    requestedOwnership === 'missing' ||
    requestedOwnership === 'needed'
      ? requestedOwnership
      : 'all'

  const showBuildOpportunities = firstParam(queryParams.builds) === '1'

  const teamCounts = new Map<string, number>()

  for (const item of items) {
    for (const team of itemTeams(item)) {
      teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1)
    }
  }

  const teams = Array.from(teamCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    )

  const sectionCounts = new Map<string, number>()

  for (const item of items) {
    sectionCounts.set(
      item.section_id,
      (sectionCounts.get(item.section_id) ?? 0) + 1
    )
  }

  const selectedTeamItems =
    view === 'team' && selectedTeam
      ? items.filter((item) =>
          itemTeams(item).some(
            (team) => normalize(team) === normalize(selectedTeam)
          )
        )
      : []

  const selectedSectionItems =
    view === 'section' && selectedSection
      ? items.filter(
          (item) =>
            item.section_id === selectedSection &&
            (!selectedTeam ||
              itemTeams(item).some(
                (team) => normalize(team) === normalize(selectedTeam)
              ))
        )
      : []

  const selectedTeamCompletion =
    view === 'team' && selectedTeam
      ? sectionCompletionForItems(
          selectedTeamItems,
          sectionNameById,
          matchesByChecklistItemId
        )
      : []

  const actionableTeamCompletion = selectedTeamCompletion.filter(
    (summary) => summary.ownedCards > 0
  )

  const completeTeamSections = selectedTeamCompletion.filter(
    (summary) => summary.status === 'complete'
  ).length

  const nearCompleteTeamSections = selectedTeamCompletion.filter(
    (summary) => summary.status === 'near'
  ).length

  const reviewBuildSectionId = firstParam(queryParams.reviewBuild)
  const reviewBuildSection =
    view === 'team' && selectedTeam && reviewBuildSectionId
      ? sections.find((section) => section.id === reviewBuildSectionId) ?? null
      : null

  const reviewBuildItems =
    reviewBuildSection && selectedTeam
      ? selectedTeamItems.filter(
          (item) => item.section_id === reviewBuildSection.id
        )
      : []

  const reviewBuildProposal =
    reviewBuildSection && reviewBuildItems.length > 0
      ? buildProposalForSection(
          reviewBuildItems,
          matchesByChecklistItemId
        )
      : null

  const baseVisibleItems = normalizedSearch
    ? items
    : view === 'team'
      ? selectedTeamItems
      : selectedSectionItems

  const visibleItems = baseVisibleItems
    .filter((item) =>
      itemMatchesSearch(
        item,
        sectionNameById.get(item.section_id) || '',
        normalizedSearch
      )
    )
    .filter((item) =>
      normalizedSearch
        ? true
        : itemMatchesOwnershipFilter(
            item,
            ownershipFilter,
            matchesByChecklistItemId
          )
    )

  const selectedSectionRow =
    sections.find((section) => section.id === selectedSection) ?? null

  const meta = checklistMeta(checklist)

  const rookieCount = items.filter((item) => item.rookie_flag).length
  const autoCount = items.filter((item) => item.auto_flag).length
  const ownedCount = items.filter(
    (item) => ownershipForItem(item, matchesByChecklistItemId).owned
  ).length

  const selectedMatchItemId = firstParam(queryParams.matchItem)
  const selectedMatchItem =
    items.find((item) => item.id === selectedMatchItemId) ?? null
  const selectedMatchedInventory = selectedMatchItem
    ? matchedInventoryForItem(selectedMatchItem, matchesByChecklistItemId)
    : []

  function checklistContextHref(overrides?: {
    view?: ViewMode
    team?: string
    section?: string
    q?: string
    ownership?: OwnershipFilter
    builds?: boolean
    reviewBuild?: string
  }) {
    const nextView = overrides?.view ?? view
    const nextTeam =
      overrides && 'team' in overrides ? overrides.team ?? '' : selectedTeam
    const nextSection =
      overrides && 'section' in overrides
        ? overrides.section ?? ''
        : selectedSection
    const nextSearch =
      overrides && 'q' in overrides ? overrides.q ?? '' : searchText
    const nextOwnership =
      overrides?.ownership ?? ownershipFilter
    const nextBuilds =
      overrides && 'builds' in overrides
        ? Boolean(overrides.builds)
        : showBuildOpportunities
    const nextReviewBuild =
      overrides && 'reviewBuild' in overrides
        ? overrides.reviewBuild ?? ''
        : reviewBuildSectionId

    const params = new URLSearchParams()
    params.set('view', nextView)

    if (nextView === 'team' && nextTeam) {
      params.set('team', nextTeam)
    }

    if (nextView === 'section' && nextSection) {
      params.set('section', nextSection)

      if (nextTeam) {
        params.set('team', nextTeam)
      }
    }

    if (nextSearch) {
      params.set('q', nextSearch)
    }

    if (nextOwnership !== 'all') {
      params.set('ownership', nextOwnership)
    }

    if (nextBuilds) {
      params.set('builds', '1')
    }

    if (nextReviewBuild) {
      params.set('reviewBuild', nextReviewBuild)
    }

    return `/app/checklists/${checklist.id}?${params.toString()}`
  }

  const buildSuccessMessage = firstParam(queryParams.buildSuccess)
  const buildErrorMessage = firstParam(queryParams.buildError)

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="app-badge app-badge-info">
              {checklist.visibility === 'global' ? 'HITS Library' : 'Private'}
            </span>

            {checklist.verified && (
              <span className="app-badge app-badge-success">Verified</span>
            )}

            {clean(checklist.source_type) && (
              <span className="app-badge">
                Source: {checklist.source_type}
              </span>
            )}
          </div>

          <h1 className="app-title">{checklist.name}</h1>

          {meta && <p className="app-subtitle">{meta}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/checklists" className="app-button">
            Back to Checklist Library
          </Link>

          <Link href="/app/checklists/import" className="app-button">
            Import Another
          </Link>

          <ChecklistAutoMatcher checklistId={checklist.id} />
        </div>
      </div>

      {buildSuccessMessage && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {buildSuccessMessage}
        </div>
      )}

      {buildErrorMessage && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Build failed: {buildErrorMessage}
        </div>
      )}

      {selectedMatchItem && (
        <section
          id="matched-inventory"
          className="app-section scroll-mt-6 space-y-3 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Matched Inventory — {selectedMatchItem.player_name}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Checklist card #{selectedMatchItem.card_number} •{' '}
                {sectionNameById.get(selectedMatchItem.section_id) ||
                  'Unknown Section'}
              </p>
            </div>

            <Link
              href={
                view === 'team' && selectedTeam
                  ? `/app/checklists/${checklist.id}?view=team&team=${encodeURIComponent(
                      selectedTeam
                    )}${ownershipFilter !== 'all' ? `&ownership=${encodeURIComponent(ownershipFilter)}` : ''}${searchText ? `&q=${encodeURIComponent(searchText)}` : ''}`
                  : view === 'section' && selectedSection
                    ? `/app/checklists/${checklist.id}?view=section&section=${encodeURIComponent(
                        selectedSection
                      )}${selectedTeam ? `&team=${encodeURIComponent(selectedTeam)}` : ''}${ownershipFilter !== 'all' ? `&ownership=${encodeURIComponent(ownershipFilter)}` : ''}${searchText ? `&q=${encodeURIComponent(searchText)}` : ''}`
                    : `/app/checklists/${checklist.id}?view=${view}`
              }
              className="app-button"
            >
              Close Matches
            </Link>
          </div>

          {selectedMatchedInventory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-4 text-sm text-zinc-400">
              No strong inventory matches are currently saved for this card.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-800">
              <div className="overflow-x-auto">
                <table className="w-full min-w-190 text-left text-sm">
                  <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-3">Inventory Item</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Qty Here</th>
                      <th className="px-3 py-3">Match</th>
                      <th className="px-3 py-3">Notes</th>
                      <th className="px-3 py-3">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 bg-black/20">
                    {selectedMatchedInventory.map(({ match, inventory }) => {
                      const noteQuantity = parseNotesPlayerQuantity(
                        inventory.notes,
                        selectedMatchItem.player_name
                      )

                      return (
                        <tr key={match.inventory_item_id}>
                          <td className="px-3 py-3 font-medium text-zinc-100">
                            {clean(inventory.title) ||
                              clean(inventory.player_name) ||
                              'Inventory Item'}
                          </td>
                          <td className="px-3 py-3">
                            <span className="app-badge">
                              {inventoryStatusLabel(inventory.status)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-zinc-300">
                            {noteQuantity > 0
                              ? `${Math.min(
                                  noteQuantity,
                                  physicalQuantityForInventory(inventory)
                                )} for this player`
                              : physicalQuantityForInventory(inventory)}
                          </td>
                          <td className="px-3 py-3 text-zinc-300">
                            {match.match_score}
                          </td>
                          <td className="max-w-md px-3 py-3 text-zinc-400">
                            {clean(inventory.notes) || '—'}
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              href={`/app/inventory/${inventory.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="app-button"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {!selectedMatchItem && (
        <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Cards
          </div>
          <div className="mt-1 text-2xl font-bold">{items.length}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sections
          </div>
          <div className="mt-1 text-2xl font-bold">{sections.length}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Teams
          </div>
          <div className="mt-1 text-2xl font-bold">{teams.length}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Rookies
          </div>
          <div className="mt-1 text-2xl font-bold">{rookieCount}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Autographs
          </div>
          <div className="mt-1 text-2xl font-bold">{autoCount}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Owned
          </div>
          <div className="mt-1 text-2xl font-bold">{ownedCount}</div>
          <div className="mt-1 text-xs text-zinc-500">
            {items.length > 0
              ? `${Math.round((ownedCount / items.length) * 100)}% of checklist`
              : '0% of checklist'}
          </div>
        </div>
      </section>

      <section className="app-section space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/app/checklists/${checklist.id}?view=team`}
              className={view === 'team' ? 'app-button-primary' : 'app-button'}
            >
              Browse by Team
            </Link>

            <Link
              href={`/app/checklists/${checklist.id}?view=section`}
              className={view === 'section' ? 'app-button-primary' : 'app-button'}
            >
              Browse by Section
            </Link>
          </div>

          <form method="get" className="flex w-full max-w-xl gap-2">
            <input type="hidden" name="view" value={view} />

            <input
              type="search"
              name="q"
              defaultValue={searchText}
              placeholder="Search player, card #, team, section..."
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
            />

            <button type="submit" className="app-button">
              Search
            </button>
          </form>
        </div>

        {!normalizedSearch && (selectedTeam || selectedSection) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Show
              </span>

              {(
                [
                  ['all', 'All'],
                  ['owned', 'Owned'],
                  ['missing', 'Missing'],
                  ['needed', 'Needed'],
                ] as const
              ).map(([value, label]) => {
                const filterParams = new URLSearchParams()
                filterParams.set('view', view)

                if (view === 'team' && selectedTeam) {
                  filterParams.set('team', selectedTeam)
                }

                if (view === 'section' && selectedSection) {
                  filterParams.set('section', selectedSection)

                  if (selectedTeam) {
                    filterParams.set('team', selectedTeam)
                  }
                }

                if (searchText) {
                  filterParams.set('q', searchText)
                }

                if (value !== 'all') {
                  filterParams.set('ownership', value)
                }

                if (showBuildOpportunities) {
                  filterParams.set('builds', '1')
                }

                return (
                  <Link
                    key={value}
                    href={`/app/checklists/${checklist.id}?${filterParams.toString()}`}
                    className={
                      ownershipFilter === value
                        ? 'app-button-primary'
                        : 'app-button'
                    }
                  >
                    {label}
                  </Link>
                )
              })}

              <span className="ml-1 text-xs text-zinc-500">
                {ownershipFilter === 'needed'
                  ? 'Needed currently shows cards HITS cannot prove you own.'
                  : `${visibleItems.length} shown`}
              </span>
            </div>

            {view === 'team' && selectedTeam && actionableTeamCompletion.length > 0 && (
              <Link
                href={checklistContextHref({
                  builds: !showBuildOpportunities,
                })}
                className={showBuildOpportunities ? 'app-button-primary' : 'app-button'}
              >
                {showBuildOpportunities
                  ? 'Hide Build Opportunities'
                  : `View Build Opportunities (${completeTeamSections + nearCompleteTeamSections})`}
              </Link>
            )}
          </div>
        )}

        {view === 'team' && (
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Teams</h2>
                <span className="text-xs text-zinc-500">{teams.length}</span>
              </div>

              <div className="max-h-170 space-y-1 overflow-y-auto pr-1">
                {teams.map((team) => {
                  const active =
                    normalize(team.name) === normalize(selectedTeam)

                  return (
                    <Link
                      key={team.name}
                      href={`/app/checklists/${checklist.id}?view=team&team=${encodeURIComponent(team.name)}`}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                        active
                          ? 'border-cyan-600 bg-cyan-950/30 text-cyan-200'
                          : 'border-transparent text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {team.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {team.count}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              {normalizedSearch ? (
                  <>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">
                          Search Results
                        </h2>
                        <p className="mt-1 text-sm text-zinc-400">
                          {visibleItems.length} card
                          {visibleItems.length === 1 ? '' : 's'} matching "{searchText}"
                        </p>
                      </div>

                      <Link
                        href={`/app/checklists/${checklist.id}?view=team`}
                        className="app-button"
                      >
                        Clear Search
                      </Link>
                    </div>

                    <ChecklistTable
                      items={visibleItems}
                      sectionNameById={sectionNameById}
                      showSection
                      emptyMessage={`No checklist cards match "${searchText}".`}
                      matchesByChecklistItemId={matchesByChecklistItemId}
                      checklistId={checklist.id}
                      view={view}
                      selectedTeam={selectedTeam}
                      selectedSection={selectedSection}
                      searchText={searchText}
                      ownershipFilter={ownershipFilter}
                    />
                  </>
              ) : !selectedTeam ? (
                <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8 text-center">
                  <h2 className="text-lg font-semibold">Choose a Team</h2>
                  <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
                    Select a team on the left to view every matching card from the
                    checklist, or use Search above to find a player, card number,
                    team, or section across the entire product.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{selectedTeam}</h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        {visibleItems.length} card
                        {visibleItems.length === 1 ? '' : 's'}
                        {searchText ? ` matching "${searchText}"` : ''}
                      </p>
                    </div>

                    {searchText && (
                      <Link
                        href={`/app/checklists/${checklist.id}?view=team&team=${encodeURIComponent(selectedTeam)}${ownershipFilter !== 'all' ? `&ownership=${encodeURIComponent(ownershipFilter)}` : ''}`}
                        className="app-button"
                      >
                        Clear Search
                      </Link>
                    )}
                  </div>

                  {showBuildOpportunities && actionableTeamCompletion.length > 0 && (
                    <div className="app-section space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold">
                            Team Build Opportunities
                          </h3>
                          <p className="mt-1 text-sm text-zinc-400">
                            Read-only completion estimates from current checklist matches.
                            No inventory is reserved or changed.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Link
                            href={checklistContextHref({ builds: false })}
                            className="app-button"
                          >
                            Close
                          </Link>
                          {completeTeamSections > 0 && (
                            <span className="app-badge app-badge-success">
                              {completeTeamSections} complete
                            </span>
                          )}
                          {nearCompleteTeamSections > 0 && (
                            <span className="app-badge app-badge-info">
                              {nearCompleteTeamSections} near complete
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-zinc-800">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-180 text-left text-sm">
                            <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                              <tr>
                                <th className="px-3 py-3">Section / Set</th>
                                <th className="px-3 py-3">Progress</th>
                                <th className="px-3 py-3">Missing</th>
                                <th className="px-3 py-3">Potential Sets</th>
                                <th className="px-3 py-3">Status</th>
                                <th className="px-3 py-3">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800 bg-black/20">
                              {actionableTeamCompletion.map((summary) => (
                                <tr key={summary.sectionId}>
                                  <td className="px-3 py-3 font-medium text-zinc-100">
                                    <Link
                                      href={`/app/checklists/${checklist.id}?view=section&section=${encodeURIComponent(summary.sectionId)}&team=${encodeURIComponent(selectedTeam)}${ownershipFilter !== 'all' ? `&ownership=${encodeURIComponent(ownershipFilter)}` : ''}`}
                                      className="text-cyan-200 hover:underline"
                                    >
                                      {summary.sectionName}
                                    </Link>
                                  </td>
                                  <td className="px-3 py-3 text-zinc-300">
                                    {summary.ownedCards}/{summary.totalCards}
                                  </td>
                                  <td className="px-3 py-3 text-zinc-300">
                                    {summary.missingCards}
                                  </td>
                                  <td className="px-3 py-3 text-zinc-300">
                                    {summary.potentialCompleteSets > 0
                                      ? summary.potentialCompleteSets
                                      : '—'}
                                  </td>
                                  <td className="px-3 py-3">
                                    <CompletionStatusBadge summary={summary} />
                                  </td>
                                  <td className="px-3 py-3">
                                    {summary.status === 'complete' ? (
                                      <Link
                                        href={checklistContextHref({
                                          builds: false,
                                          reviewBuild: summary.sectionId,
                                        })}
                                        className="app-button"
                                      >
                                        Review Build
                                      </Link>
                                    ) : (
                                      <span className="text-xs text-zinc-500">
                                        Complete section first
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {reviewBuildSection && reviewBuildProposal && (
                    <div className="app-section space-y-4 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold">
                              Review Build — {selectedTeam} — {reviewBuildSection.name}
                            </h3>

                            {reviewBuildProposal.ready ? (
                              <span className="app-badge app-badge-success">
                                Ready to Build
                              </span>
                            ) : (
                              <span className="app-badge app-badge-info">
                                Review Required
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-zinc-400">
                            HITS is proposing the exact physical inventory records
                            it would use for one set. This is a read-only preview:
                            nothing is reserved, reduced, moved, or written to the
                            build tables yet.
                          </p>
                        </div>

                        <Link
                          href={checklistContextHref({
                            reviewBuild: '',
                            builds: false,
                          })}
                          className="app-button"
                        >
                          Close Review
                        </Link>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                          <div className="text-xs uppercase tracking-wide text-zinc-500">
                            Cards
                          </div>
                          <div className="mt-1 text-xl font-bold">
                            {reviewBuildProposal.rows.length}
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                          <div className="text-xs uppercase tracking-wide text-zinc-500">
                            Proposed Cost Basis
                          </div>
                          <div className="mt-1 text-xl font-bold">
                            ${reviewBuildProposal.totalCostBasis.toFixed(2)}
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                          <div className="text-xs uppercase tracking-wide text-zinc-500">
                            Protected Items
                          </div>
                          <div className="mt-1 text-xl font-bold">
                            {reviewBuildProposal.protectedCount}
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                          <div className="text-xs uppercase tracking-wide text-zinc-500">
                            Unresolved
                          </div>
                          <div className="mt-1 text-xl font-bold">
                            {reviewBuildProposal.unresolvedCount}
                          </div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-zinc-800">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-275 text-left text-sm">
                            <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                              <tr>
                                <th className="px-3 py-3">Card #</th>
                                <th className="px-3 py-3">Player</th>
                                <th className="px-3 py-3">Proposed Inventory</th>
                                <th className="px-3 py-3">Status</th>
                                <th className="px-3 py-3">Match</th>
                                <th className="px-3 py-3">Cost</th>
                                <th className="px-3 py-3">Source / Notes</th>
                                <th className="px-3 py-3">Review</th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-zinc-800 bg-black/20">
                              {reviewBuildProposal.rows.map((row) => (
                                <tr key={row.checklistItem.id} className="align-top">
                                  <td className="px-3 py-3 font-semibold text-cyan-200">
                                    {row.checklistItem.card_number}
                                  </td>
                                  <td className="px-3 py-3 font-medium text-zinc-100">
                                    {row.checklistItem.player_name}
                                  </td>
                                  <td className="px-3 py-3">
                                    {row.inventory ? (
                                      <Link
                                        href={`/app/inventory/${row.inventory.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-200 hover:underline"
                                      >
                                        {clean(row.inventory.title) ||
                                          clean(row.inventory.player_name) ||
                                          'Inventory Item'}
                                      </Link>
                                    ) : (
                                      <span className="text-red-300">
                                        No allocatable match
                                      </span>
                                    )}
                                    {row.notesDerived && (
                                      <div className="mt-1">
                                        <span className="app-badge app-badge-info">
                                          Grouped Notes
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {row.inventory ? (
                                      <span className="app-badge">
                                        {inventoryStatusLabel(row.inventory.status)}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-zinc-300">
                                    {row.match ? row.match.match_score : '—'}
                                  </td>
                                  <td className="px-3 py-3 text-zinc-300">
                                    {row.inventory
                                      ? `$${Math.max(
                                          0,
                                          Number(row.inventory.cost_basis_unit ?? 0)
                                        ).toFixed(2)}`
                                      : '—'}
                                  </td>
                                  <td className="max-w-md px-3 py-3 text-zinc-400">
                                    {row.inventory
                                      ? [
                                          clean(row.inventory.source_type),
                                          clean(row.inventory.source_reference),
                                          clean(row.inventory.notes),
                                        ]
                                          .filter(Boolean)
                                          .join(' • ') || '—'
                                      : '—'}
                                  </td>
                                  <td className="px-3 py-3">
                                    {row.issue ? (
                                      <span className="text-amber-300">
                                        {row.issue}
                                      </span>
                                    ) : row.inventory ? (
                                      <span className="text-emerald-300">
                                        Proposed
                                      </span>
                                    ) : (
                                      <span className="text-red-300">
                                        Needs correction
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-900/70 bg-cyan-950/20 px-4 py-3">
                        <div className="text-sm text-cyan-100">
                          Building will create one new finished inventory item and
                          atomically reduce the exact proposed source quantities.
                          If database validation fails, nothing changes.
                        </div>

                        <form action={buildChecklistSetAction}>
                          <input
                            type="hidden"
                            name="checklistId"
                            value={checklist.id}
                          />
                          <input
                            type="hidden"
                            name="sectionId"
                            value={reviewBuildSection.id}
                          />
                          <input
                            type="hidden"
                            name="teamName"
                            value={selectedTeam}
                          />
                          <input
                            type="hidden"
                            name="components"
                            value={JSON.stringify(
                              reviewBuildProposal.rows.map((row) => ({
                                inventory_item_id: row.inventory?.id ?? '',
                                checklist_item_id: row.checklistItem.id,
                              }))
                            )}
                          />

                          <button
                            type="submit"
                            className="app-button-primary"
                            disabled={!reviewBuildProposal.ready}
                            title={
                              reviewBuildProposal.ready
                                ? 'Create this finished team set'
                                : 'Resolve protected or missing components before building'
                            }
                          >
                            Build Set
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  <TeamSectionChecklistTables
                    items={visibleItems}
                    sections={sections}
                    sectionNameById={sectionNameById}
                    matchesByChecklistItemId={matchesByChecklistItemId}
                    checklistId={checklist.id}
                    selectedTeam={selectedTeam}
                    searchText={searchText}
                    ownershipFilter={ownershipFilter}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {view === 'section' && (
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Checklist Sections</h2>
                <span className="text-xs text-zinc-500">{sections.length}</span>
              </div>

              <div className="max-h-170 space-y-1 overflow-y-auto pr-1">
                {sections.map((section) => {
                  const active = section.id === selectedSection
                  const count = sectionCounts.get(section.id) ?? 0

                  return (
                    <Link
                      key={section.id}
                      href={`/app/checklists/${checklist.id}?view=section&section=${encodeURIComponent(section.id)}`}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                        active
                          ? 'border-cyan-600 bg-cyan-950/30 text-cyan-200'
                          : 'border-transparent text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {section.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {count}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              {normalizedSearch ? (
                  <>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">
                          Search Results
                        </h2>
                        <p className="mt-1 text-sm text-zinc-400">
                          {visibleItems.length} card
                          {visibleItems.length === 1 ? '' : 's'} matching "{searchText}"
                        </p>
                      </div>

                      <Link
                        href={`/app/checklists/${checklist.id}?view=section`}
                        className="app-button"
                      >
                        Clear Search
                      </Link>
                    </div>

                    <ChecklistTable
                      items={visibleItems}
                      sectionNameById={sectionNameById}
                      showSection
                      emptyMessage={`No checklist cards match "${searchText}".`}
                      matchesByChecklistItemId={matchesByChecklistItemId}
                      checklistId={checklist.id}
                      view={view}
                      selectedTeam={selectedTeam}
                      selectedSection={selectedSection}
                      searchText={searchText}
                      ownershipFilter={ownershipFilter}
                    />
                  </>
              ) : !selectedSectionRow ? (
                <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8 text-center">
                  <h2 className="text-lg font-semibold">Choose a Section</h2>
                  <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
                    Select a checklist section on the left to view its cards, or
                    use Search above to find a player, card number, team, or
                    section across the entire product.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {selectedTeam
                          ? `${selectedTeam} — ${selectedSectionRow.name}`
                          : selectedSectionRow.name}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        {visibleItems.length} card
                        {visibleItems.length === 1 ? '' : 's'}
                        {selectedTeam ? ` for ${selectedTeam}` : ''}
                        {searchText ? ` matching "${searchText}"` : ''}
                      </p>
                    </div>

                    {searchText && (
                      <Link
                        href={`/app/checklists/${checklist.id}?view=section&section=${encodeURIComponent(selectedSectionRow.id)}${selectedTeam ? `&team=${encodeURIComponent(selectedTeam)}` : ''}${ownershipFilter !== 'all' ? `&ownership=${encodeURIComponent(ownershipFilter)}` : ''}`}
                        className="app-button"
                      >
                        Clear Search
                      </Link>
                    )}
                  </div>

                  <ChecklistTable
                    items={visibleItems}
                    sectionNameById={sectionNameById}
                    showSection={false}
                    emptyMessage="No checklist cards match this section and search."
                    matchesByChecklistItemId={matchesByChecklistItemId}
                    checklistId={checklist.id}
                    view={view}
                    selectedTeam={selectedTeam}
                    selectedSection={selectedSection}
                    searchText={searchText}
                    ownershipFilter={ownershipFilter}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {(clean(checklist.source_reference) || clean(checklist.notes)) && (
        <section className="app-section p-4">
          <h2 className="text-base font-semibold">Checklist Source</h2>

          {clean(checklist.source_reference) && (
            <div className="mt-2 text-sm text-zinc-400">
              File: <span className="text-zinc-200">{checklist.source_reference}</span>
            </div>
          )}

          {clean(checklist.notes) && (
            <div className="mt-2 text-sm text-zinc-400">{checklist.notes}</div>
          )}
        </section>
      )}
        </>
      )}
    </div>
  )
}
