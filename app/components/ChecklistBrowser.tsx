'use client'

import Link from 'next/link'
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useFormStatus } from 'react-dom'
import { ensureChecklistInventoryMatches } from '@/app/actions/checklist-match-freshness'
import {
  updateInventoryBulkStatusShared,
  type SharedInventoryBulkStatus,
} from '@/app/actions/inventory-bulk'
import {
  buildChecklistSetAction,
  quoteChecklistBuild,
  type ChecklistBuildQuoteResult,
} from '@/app/actions/inventory-builds'
import ChecklistRowEditor, {
  type ChecklistRowEditorItem,
  type ChecklistRowEditorSection,
} from '@/app/components/ChecklistRowEditor'
import ChecklistCardResearch from '@/app/components/ChecklistCardResearch'
import ChecklistMyInventory from '@/app/components/ChecklistMyInventory'

type Checklist = {
  id: string
  name: string | null
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  sport: string | null
}

type ChecklistSection = {
  id: string
  checklist_id: string
  name: string | null
  sort_order: number | null
}

type ChecklistItem = {
  id: string
  checklist_id: string
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
  quantity_required: number | null
  sort_order: number | null
  notes: string | null
}

type ChecklistPerson = {
  checklist_item_id: string
  player_name: string | null
  printed_team: string | null
  sort_order: number | null
}

type BrowserDataResponse = {
  ok: boolean
  checklist?: Checklist
  sections?: ChecklistSection[]
  items?: ChecklistItem[]
  error?: string
}

type PlayerDataResponse = {
  ok: boolean
  people?: ChecklistPerson[]
  error?: string
}

type InventoryMatchItem = {
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

type InventoryMatch = {
  checklist_item_id: string
  inventory_item_id: string
  match_score: number
  match_type: string
  is_preferred: boolean
  inventory_items:
    | InventoryMatchItem
    | InventoryMatchItem[]
    | null
}

type InventoryMatchesResponse = {
  ok: boolean
  matches?: InventoryMatch[]
  error?: string
}

type BrowseMode = 'team' | 'player' | 'section'
type OwnershipFilter = 'all' | 'owned' | 'missing'

type ChecklistBrowserProps = {
  checklistId: string
  canEdit?: boolean
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function getFirstLetter(value: string) {
  const first = value.trim().charAt(0).toUpperCase()
  return /^[A-Z]$/.test(first) ? first : '#'
}

function normalizeText(value: string | null | undefined) {
  return cleanText(value).toLowerCase()
}

function parseNotesPlayerQuantity(
  notes: string | null | undefined,
  playerName: string
) {
  const source = cleanText(notes)
  const target = normalizeText(playerName)

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

    if (normalizeText(name) === target) return quantity
  }

  return 0
}

function joinedInventoryRow(match: InventoryMatch) {
  return Array.isArray(match.inventory_items)
    ? match.inventory_items[0] ?? null
    : match.inventory_items
}

function physicalQuantityForInventory(
  inventory: NonNullable<ReturnType<typeof joinedInventoryRow>>
) {
  const status = cleanText(inventory.status).toLowerCase()
  const available = Math.max(0, Number(inventory.available_quantity ?? 0))
  const quantity = Math.max(0, Number(inventory.quantity ?? 0))

  if (status === 'personal' || status === 'junk') {
    return quantity > 0 ? quantity : available
  }

  return available
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
  items: ChecklistItem[],
  sectionNameById: Map<string, string>,
  matchesByChecklistItemId: Map<string, InventoryMatch[]>
) {
  const bySection = new Map<string, ChecklistItem[]>()

  for (const item of items) {
    const sectionId = item.section_id || '__uncategorized__'
    const existing = bySection.get(sectionId)

    if (existing) {
      existing.push(item)
    } else {
      bySection.set(sectionId, [item])
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
              ...ownership.map((entry) =>
                Math.max(0, Number(entry.copies ?? 0))
              )
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
      sectionName:
        sectionId === '__uncategorized__'
          ? 'Uncategorized'
          : sectionNameById.get(sectionId) || 'Unknown Section',
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

    const rankDifference =
      statusRank[a.status] - statusRank[b.status]

    if (rankDifference !== 0) return rankDifference

    const aPercent =
      a.totalCards > 0 ? a.ownedCards / a.totalCards : 0

    const bPercent =
      b.totalCards > 0 ? b.ownedCards / b.totalCards : 0

    if (aPercent !== bPercent) {
      return bPercent - aPercent
    }

    return compareText(a.sectionName, b.sectionName)
  })
}

type BuildProposalRow = {
  checklistItem: ChecklistItem
  inventory: InventoryMatchItem | null
  match: InventoryMatch | null
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
  listedCount: number
  personalCount: number
  sellableCount: number
  mixedPersonalStatus: boolean
  resultStatus: 'available' | 'personal' | null
}

function inventoryStatusLabel(status: string | null | undefined) {
  const value = cleanText(status).toLowerCase()

  if (value === 'available') return 'Available'
  if (value === 'listed') return 'Listed'
  if (value === 'personal') return 'Personal'
  if (value === 'junk') return 'Junk'

  return cleanText(status) || 'Unknown'
}

function inventoryPreferenceRank(inventory: InventoryMatchItem) {
  const status = cleanText(inventory.status).toLowerCase()

  if (status === 'available') return 0
  if (status === 'junk') return 1
  if (status === 'listed') return 2
  if (status === 'personal') return 3

  return 4
}

function buildProposalForSection(
  sectionItems: ChecklistItem[],
  matchesByChecklistItemId: Map<string, InventoryMatch[]>,
  preferredInventoryByChecklistItemId: Map<string, string> = new Map()
): BuildProposal {
  const rowRemaining = new Map<string, number>()
  const playerRemaining = new Map<string, number>()

  const getRowRemaining = (inventory: InventoryMatchItem) => {
    if (!rowRemaining.has(inventory.id)) {
      rowRemaining.set(
        inventory.id,
        Math.max(0, physicalQuantityForInventory(inventory))
      )
    }

    return rowRemaining.get(inventory.id) ?? 0
  }

  const getPlayerRemaining = (
    inventory: InventoryMatchItem,
    item: ChecklistItem
  ) => {
    const notesQuantity = parseNotesPlayerQuantity(
      inventory.notes,
      cleanText(item.player_name)
    )

    if (notesQuantity <= 0) return Number.POSITIVE_INFINITY

    const key = `${inventory.id}::${normalizeText(item.player_name)}`

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

    return compareText(
      cleanText(a.card_number),
      cleanText(b.card_number)
    )
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
        const pinnedInventoryId =
          preferredInventoryByChecklistItemId.get(item.id) ?? ''

        const pinnedDifference =
          Number(b.inventory.id === pinnedInventoryId) -
          Number(a.inventory.id === pinnedInventoryId)

        if (pinnedDifference !== 0) return pinnedDifference

        const preferredDifference =
          Number(Boolean(b.match.is_preferred)) -
          Number(Boolean(a.match.is_preferred))

        if (preferredDifference !== 0) return preferredDifference

        const statusDifference =
          inventoryPreferenceRank(a.inventory) -
          inventoryPreferenceRank(b.inventory)

        if (statusDifference !== 0) return statusDifference

        return Number(b.match.match_score ?? 0) -
          Number(a.match.match_score ?? 0)
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
      cleanText(item.player_name)
    )

    rowRemaining.set(
      selected.inventory.id,
      Math.max(0, getRowRemaining(selected.inventory) - 1)
    )

    if (notesQuantity > 0) {
      const playerKey =
        `${selected.inventory.id}::${normalizeText(item.player_name)}`

      playerRemaining.set(
        playerKey,
        Math.max(
          0,
          getPlayerRemaining(selected.inventory, item) - 1
        )
      )
    }

    const status = cleanText(selected.inventory.status).toLowerCase()
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
    compareText(
      cleanText(a.checklistItem.card_number),
      cleanText(b.checklistItem.card_number)
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
  const listedCount = rows.filter(
    (row) =>
      cleanText(row.inventory?.status).toLowerCase() === 'listed'
  ).length
  const personalCount = rows.filter(
    (row) =>
      cleanText(row.inventory?.status).toLowerCase() === 'personal'
  ).length
  const sellableCount = rows.filter((row) => {
    const status = cleanText(row.inventory?.status).toLowerCase()

    return Boolean(row.inventory) && status !== 'personal'
  }).length

  const mixedPersonalStatus =
    personalCount > 0 && sellableCount > 0

  const protectedCount = listedCount + (
    mixedPersonalStatus ? personalCount : 0
  )

  const resultStatus: BuildProposal['resultStatus'] =
    unresolvedCount > 0 || listedCount > 0 || mixedPersonalStatus
      ? null
      : personalCount > 0
        ? 'personal'
        : 'available'

  return {
    rows,
    totalCostBasis,
    ready:
      unresolvedCount === 0 &&
      listedCount === 0 &&
      !mixedPersonalStatus,
    protectedCount,
    unresolvedCount,
    listedCount,
    personalCount,
    sellableCount,
    mixedPersonalStatus,
    resultStatus,
  }
}

function matchedInventoryForItem(
  item: ChecklistItem,
  matchesByChecklistItemId: Map<string, InventoryMatch[]>
) {
  const matches = matchesByChecklistItemId.get(item.id) ?? []

  return matches
    .filter(
      (match) =>
        match.is_preferred || Number(match.match_score ?? 0) >= 60
    )
    .map((match) => ({
      match,
      inventory: joinedInventoryRow(match),
    }))
    .filter(
      (
        row
      ): row is {
        match: InventoryMatch
        inventory: InventoryMatchItem
      } => row.inventory !== null
    )
}

function ownershipForItem(
  item: ChecklistItem,
  matchesByChecklistItemId: Map<string, InventoryMatch[]>
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
      cleanText(item.player_name)
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

function LoadingSpinner({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass =
    size === 'sm'
      ? 'h-3.5 w-3.5 border-2'
      : size === 'lg'
        ? 'h-7 w-7 border-2'
        : 'h-5 w-5 border-2'

  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent`}
    />
  )
}


function BuildSetSubmitButton({
  disabled,
  title,
}: {
  disabled: boolean
  title: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      className="app-button-primary inline-flex items-center gap-2"
      disabled={disabled || pending}
      title={title}
      aria-busy={pending}
    >
      {pending ? <LoadingSpinner size="sm" /> : null}
      {pending ? 'Building Set...' : 'Build Set'}
    </button>
  )
}

export default function ChecklistBrowser({
  checklistId,
  canEdit = false,
}: ChecklistBrowserProps) {
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [sections, setSections] = useState<ChecklistSection[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [people, setPeople] = useState<ChecklistPerson[]>([])

  const [mode, setMode] = useState<BrowseMode>('team')
  const [myInventoryOpen, setMyInventoryOpen] = useState(false)

  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [selectedTeamSectionId, setSelectedTeamSectionId] = useState('')

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [playerDataLoaded, setPlayerDataLoaded] = useState(false)
  const [playerDataLoading, setPlayerDataLoading] = useState(false)
  const [playerDataError, setPlayerDataError] = useState('')

  const [inventoryChecking, setInventoryChecking] = useState(false)
  const [inventoryCheckError, setInventoryCheckError] = useState('')
  const [inventoryCheckMessage, setInventoryCheckMessage] = useState('')
  const [inventoryMatches, setInventoryMatches] = useState<InventoryMatch[]>([])
  const [inventoryResultsLoaded, setInventoryResultsLoaded] = useState(false)
  const [ownershipFilter, setOwnershipFilter] =
    useState<OwnershipFilter>('all')
  const [expandedInventoryItemId, setExpandedInventoryItemId] = useState('')
  const [progressOpen, setProgressOpen] = useState(false)
  const [buildOpportunitiesOpen, setBuildOpportunitiesOpen] = useState(false)
  const [reviewBuildSectionId, setReviewBuildSectionId] = useState('')
  const [selectedChecklistItemId, setSelectedChecklistItemId] = useState('')
  const [editingChecklistItemId, setEditingChecklistItemId] = useState('')
  const [checklistRowEditMessage, setChecklistRowEditMessage] = useState('')
  const [buildStatusUpdatingItemId, setBuildStatusUpdatingItemId] = useState('')
  const [buildStatusError, setBuildStatusError] = useState('')
  const [buildQuote, setBuildQuote] =
    useState<ChecklistBuildQuoteResult | null>(null)
  const [buildQuoteLoading, setBuildQuoteLoading] = useState(false)
  const [
    buildPreferredInventoryByChecklistItemId,
    setBuildPreferredInventoryByChecklistItemId,
  ] = useState<Map<string, string>>(new Map())

  const rightPaneRef = useRef<HTMLDivElement | null>(null)
  const reviewBuildRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadChecklist() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(
          `/api/checklists/${encodeURIComponent(checklistId)}/browser-data`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

        const data = (await response.json()) as BrowserDataResponse

        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Unable to load checklist.')
        }

        if (cancelled) return

        setChecklist(data.checklist ?? null)
        setSections(data.sections ?? [])
        setItems(data.items ?? [])
      } catch (err) {
        if (cancelled) return

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load checklist.'
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadChecklist()

    return () => {
      cancelled = true
    }
  }, [checklistId])

  useEffect(() => {
    if (!reviewBuildSectionId) return

    requestAnimationFrame(() => {
      reviewBuildRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }, [reviewBuildSectionId])

  useEffect(() => {
    setPeople([])
    setPlayerDataLoaded(false)
    setPlayerDataLoading(false)
    setPlayerDataError('')
    setSelectedPlayer('')
    setSelectedTeam('')
    setSelectedSectionId('')
    setSelectedTeamSectionId('')
    setSearchInput('')
    setSearchQuery('')
    setInventoryChecking(false)
    setInventoryCheckError('')
    setInventoryCheckMessage('')
    setInventoryMatches([])
    setInventoryResultsLoaded(false)
    setOwnershipFilter('all')
    setExpandedInventoryItemId('')
    setProgressOpen(false)
    setBuildOpportunitiesOpen(false)
    setReviewBuildSectionId('')
    setSelectedChecklistItemId('')
    setEditingChecklistItemId('')
    setChecklistRowEditMessage('')
    setBuildStatusUpdatingItemId('')
    setBuildStatusError('')
    setBuildQuote(null)
    setBuildQuoteLoading(false)
    setBuildPreferredInventoryByChecklistItemId(new Map())
    setMyInventoryOpen(false)
    setMode('team')
  }, [checklistId])

  const sectionNameById = useMemo(() => {
    const map = new Map<string, string>()

    for (const section of sections) {
      map.set(
        section.id,
        cleanText(section.name) || 'Uncategorized'
      )
    }

    return map
  }, [sections])

  const itemById = useMemo(() => {
    const map = new Map<string, ChecklistItem>()

    for (const item of items) {
      map.set(item.id, item)
    }

    return map
  }, [items])

  const teams = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of items) {
      const team = cleanText(item.printed_team)
      if (!team) continue

      counts.set(team, (counts.get(team) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        count,
      }))
      .sort((a, b) => compareText(a.name, b.name))
  }, [items])

  const teamLetters = useMemo(() => {
    return Array.from(
      new Set(
        teams.map((team) =>
          getFirstLetter(team.name)
        )
      )
    ).sort(compareText)
  }, [teams])

  const players = useMemo(() => {
    if (!playerDataLoaded) return []

    const itemIdsByPlayer = new Map<string, Set<string>>()
    const itemIdsWithPeople = new Set<string>()

    for (const person of people) {
      const playerName = cleanText(person.player_name)
      if (!playerName) continue

      itemIdsWithPeople.add(person.checklist_item_id)

      if (!itemIdsByPlayer.has(playerName)) {
        itemIdsByPlayer.set(
          playerName,
          new Set<string>()
        )
      }

      itemIdsByPlayer
        .get(playerName)
        ?.add(person.checklist_item_id)
    }

    for (const item of items) {
      if (itemIdsWithPeople.has(item.id)) continue

      const playerName = cleanText(item.player_name)
      if (!playerName) continue

      if (!itemIdsByPlayer.has(playerName)) {
        itemIdsByPlayer.set(
          playerName,
          new Set<string>()
        )
      }

      itemIdsByPlayer
        .get(playerName)
        ?.add(item.id)
    }

    return Array.from(itemIdsByPlayer.entries())
      .map(([name, itemIds]) => ({
        name,
        count: itemIds.size,
      }))
      .sort((a, b) => compareText(a.name, b.name))
  }, [items, people, playerDataLoaded])

  const playerLetters = useMemo(() => {
    return Array.from(
      new Set(
        players.map((player) =>
          getFirstLetter(player.name)
        )
      )
    ).sort(compareText)
  }, [players])

  const playerItemIds = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const itemIdsWithPeople = new Set<string>()

    for (const person of people) {
      const playerName = cleanText(person.player_name)
      if (!playerName) continue

      itemIdsWithPeople.add(person.checklist_item_id)

      if (!map.has(playerName)) {
        map.set(playerName, new Set<string>())
      }

      map
        .get(playerName)
        ?.add(person.checklist_item_id)
    }

    for (const item of items) {
      if (itemIdsWithPeople.has(item.id)) continue

      const playerName = cleanText(item.player_name)
      if (!playerName) continue

      if (!map.has(playerName)) {
        map.set(playerName, new Set<string>())
      }

      map
        .get(playerName)
        ?.add(item.id)
    }

    return map
  }, [items, people])

  const peopleByItemId = useMemo(() => {
    const map = new Map<string, ChecklistPerson[]>()

    for (const person of people) {
      if (!map.has(person.checklist_item_id)) {
        map.set(person.checklist_item_id, [])
      }

      map
        .get(person.checklist_item_id)
        ?.push(person)
    }

    return map
  }, [people])

  const matchesByChecklistItemId = useMemo(() => {
    const map = new Map<string, InventoryMatch[]>()

    for (const match of inventoryMatches) {
      if (!map.has(match.checklist_item_id)) {
        map.set(match.checklist_item_id, [])
      }

      map.get(match.checklist_item_id)?.push(match)
    }

    return map
  }, [inventoryMatches])

  const inventoryProgress = useMemo(() => {
    if (!inventoryResultsLoaded) {
      return {
        owned: 0,
        missing: 0,
        total: items.length,
        percent: 0,
      }
    }

    let owned = 0

    for (const item of items) {
      const ownership = ownershipForItem(
        item,
        matchesByChecklistItemId
      )

      if (ownership.owned) {
        owned += 1
      }
    }

    const total = items.length
    const missing = Math.max(0, total - owned)
    const percent =
      total > 0
        ? Math.round((owned / total) * 1000) / 10
        : 0

    return {
      owned,
      missing,
      total,
      percent,
    }
  }, [
    inventoryResultsLoaded,
    items,
    matchesByChecklistItemId,
  ])

  const orderedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      const aSort =
        typeof a.sort_order === 'number'
          ? a.sort_order
          : Number.MAX_SAFE_INTEGER

      const bSort =
        typeof b.sort_order === 'number'
          ? b.sort_order
          : Number.MAX_SAFE_INTEGER

      if (aSort !== bSort) {
        return aSort - bSort
      }

      return compareText(
        cleanText(a.name),
        cleanText(b.name)
      )
    })
  }, [sections])

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of items) {
      if (!item.section_id) continue

      counts.set(
        item.section_id,
        (counts.get(item.section_id) ?? 0) + 1
      )
    }

    return counts
  }, [items])

  const selectedTeamItems = useMemo(() => {
    if (!selectedTeam) return []

    return items.filter(
      (item) =>
        cleanText(item.printed_team) === selectedTeam
    )
  }, [items, selectedTeam])

  const selectedTeamSectionGroups = useMemo(() => {
    if (!selectedTeam) return []

    const counts = new Map<string, number>()

    for (const item of selectedTeamItems) {
      const sectionId =
        item.section_id || '__uncategorized__'

      counts.set(
        sectionId,
        (counts.get(sectionId) ?? 0) + 1
      )
    }

    const groups = orderedSections
      .filter((section) => counts.has(section.id))
      .map((section) => ({
        id: section.id,
        name:
          cleanText(section.name) ||
          'Uncategorized',
        count: counts.get(section.id) ?? 0,
        sortOrder:
          typeof section.sort_order === 'number'
            ? section.sort_order
            : Number.MAX_SAFE_INTEGER,
      }))

    const uncategorizedCount =
      counts.get('__uncategorized__') ?? 0

    if (uncategorizedCount > 0) {
      groups.push({
        id: '__uncategorized__',
        name: 'Uncategorized',
        count: uncategorizedCount,
        sortOrder: Number.MAX_SAFE_INTEGER,
      })
    }

    return groups.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder
      }

      return compareText(a.name, b.name)
    })
  }, [
    orderedSections,
    selectedTeam,
    selectedTeamItems,
  ])

  const selectedTeamCompletion = useMemo(() => {
    if (
      !inventoryResultsLoaded ||
      mode !== 'team' ||
      !selectedTeam
    ) {
      return []
    }

    return sectionCompletionForItems(
      selectedTeamItems,
      sectionNameById,
      matchesByChecklistItemId
    )
  }, [
    inventoryResultsLoaded,
    matchesByChecklistItemId,
    mode,
    sectionNameById,
    selectedTeam,
    selectedTeamItems,
  ])

  const actionableTeamCompletion = useMemo(
    () =>
      selectedTeamCompletion.filter(
        (summary) => summary.ownedCards > 0
      ),
    [selectedTeamCompletion]
  )

  const completeTeamSections = useMemo(
    () =>
      selectedTeamCompletion.filter(
        (summary) => summary.status === 'complete'
      ).length,
    [selectedTeamCompletion]
  )

  const nearCompleteTeamSections = useMemo(
    () =>
      selectedTeamCompletion.filter(
        (summary) => summary.status === 'near'
      ).length,
    [selectedTeamCompletion]
  )

  const reviewBuildSummary = useMemo(
    () =>
      selectedTeamCompletion.find(
        (summary) => summary.sectionId === reviewBuildSectionId
      ) ?? null,
    [reviewBuildSectionId, selectedTeamCompletion]
  )

  const reviewBuildItems = useMemo(() => {
    if (!reviewBuildSummary) return []

    if (reviewBuildSummary.sectionId === '__uncategorized__') {
      return selectedTeamItems.filter(
        (item) => !item.section_id
      )
    }

    return selectedTeamItems.filter(
      (item) =>
        item.section_id === reviewBuildSummary.sectionId
    )
  }, [
    reviewBuildSummary,
    selectedTeamItems,
  ])

  const reviewBuildProposal = useMemo(
    () =>
      reviewBuildSummary && reviewBuildItems.length > 0
        ? buildProposalForSection(
            reviewBuildItems,
            matchesByChecklistItemId,
            buildPreferredInventoryByChecklistItemId
          )
        : null,
    [
      matchesByChecklistItemId,
      reviewBuildItems,
      reviewBuildSummary,
      buildPreferredInventoryByChecklistItemId,
    ]
  )

  const reviewBuildRows = reviewBuildProposal?.rows ?? []

  const reviewBuildMatchedCount =
    reviewBuildRows.filter((row) => row.inventory !== null).length

  useEffect(() => {
    let cancelled = false

    async function loadBuildQuote() {
      if (!reviewBuildProposal?.ready) {
        setBuildQuote(null)
        setBuildQuoteLoading(false)
        return
      }

      const components = reviewBuildProposal.rows
        .filter((row) => row.inventory)
        .map((row) => ({
          inventory_item_id: row.inventory!.id,
          checklist_item_id: row.checklistItem.id,
        }))

      if (
        components.length === 0 ||
        components.length !== reviewBuildProposal.rows.length
      ) {
        setBuildQuote(null)
        setBuildQuoteLoading(false)
        return
      }

      setBuildQuoteLoading(true)

      try {
        const result = await quoteChecklistBuild(components)

        if (!cancelled) {
          setBuildQuote(result)
        }
      } catch (err) {
        if (!cancelled) {
          setBuildQuote({
            ok: false,
            error:
              err instanceof Error
                ? err.message
                : 'Unable to confirm current build cost.',
          })
        }
      } finally {
        if (!cancelled) {
          setBuildQuoteLoading(false)
        }
      }
    }

    void loadBuildQuote()

    return () => {
      cancelled = true
    }
  }, [reviewBuildProposal])

  const reviewBuildAuthoritativeCost =
    buildQuote?.ok === true
      ? buildQuote.total_cost_basis
      : reviewBuildProposal?.totalCostBasis ?? 0

  const reviewBuildQuoteReady =
    Boolean(reviewBuildProposal?.ready) &&
    !buildQuoteLoading &&
    buildQuote?.ok === true

  const selectedTeamSectionItems = useMemo(() => {
    if (
      !selectedTeam ||
      !selectedTeamSectionId
    ) {
      return []
    }

    if (
      selectedTeamSectionId ===
      '__uncategorized__'
    ) {
      return selectedTeamItems.filter(
        (item) => !item.section_id
      )
    }

    return selectedTeamItems.filter(
      (item) =>
        item.section_id ===
        selectedTeamSectionId
    )
  }, [
    selectedTeam,
    selectedTeamItems,
    selectedTeamSectionId,
  ])

  const visibleItems = useMemo(() => {
    const query =
      searchQuery.trim().toLowerCase()

    let result = items

    if (query) {
      result = result.filter((item) => {
        const sectionName = item.section_id
          ? sectionNameById.get(
              item.section_id
            ) ?? ''
          : ''

        const peopleForItem =
          playerDataLoaded
            ? peopleByItemId
                .get(item.id)
                ?.flatMap((person) => [
                  cleanText(person.player_name),
                  cleanText(person.printed_team),
                ]) ?? []
            : []

        const searchable = [
          item.card_number,
          item.player_name,
          item.printed_team,
          item.parallel_name,
          item.variation,
          item.notes,
          sectionName,
          item.print_run,
          ...peopleForItem,
        ]
          .map(cleanText)
          .join(' ')
          .toLowerCase()

        return searchable.includes(query)
      })
    } else if (
      mode === 'team' &&
      selectedTeam
    ) {
      result = selectedTeamSectionId
        ? selectedTeamSectionItems
        : selectedTeamItems
    } else if (
      mode === 'player' &&
      selectedPlayer
    ) {
      const matchingItemIds =
        playerItemIds.get(selectedPlayer)

      result = matchingItemIds
        ? Array.from(matchingItemIds)
            .map((itemId) =>
              itemById.get(itemId)
            )
            .filter(
              (
                item
              ): item is ChecklistItem =>
                item !== undefined
            )
        : []
    } else if (
      mode === 'section' &&
      selectedSectionId
    ) {
      result = result.filter(
        (item) =>
          item.section_id === selectedSectionId
      )
    }

    if (
      inventoryResultsLoaded &&
      ownershipFilter !== 'all'
    ) {
      result = result.filter((item) => {
        const ownership = ownershipForItem(
          item,
          matchesByChecklistItemId
        )

        return ownershipFilter === 'owned'
          ? ownership.owned
          : !ownership.owned
      })
    }

    return [...result].sort((a, b) => {
      const aSort =
        typeof a.sort_order === 'number'
          ? a.sort_order
          : Number.MAX_SAFE_INTEGER

      const bSort =
        typeof b.sort_order === 'number'
          ? b.sort_order
          : Number.MAX_SAFE_INTEGER

      if (aSort !== bSort) {
        return aSort - bSort
      }

      return compareText(
        cleanText(a.card_number),
        cleanText(b.card_number)
      )
    })
  }, [
    items,
    itemById,
    inventoryResultsLoaded,
    matchesByChecklistItemId,
    mode,
    peopleByItemId,
    playerDataLoaded,
    playerItemIds,
    ownershipFilter,
    searchQuery,
    selectedPlayer,
    selectedSectionId,
    selectedTeam,
    selectedTeamItems,
    selectedTeamSectionId,
    selectedTeamSectionItems,
    sectionNameById,
  ])

  async function loadPlayerData() {
    if (
      playerDataLoaded ||
      playerDataLoading
    ) {
      return
    }

    setPlayerDataLoading(true)
    setPlayerDataError('')

    try {
      const response = await fetch(
        `/api/checklists/${encodeURIComponent(
          checklistId
        )}/player-data`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )

      const data =
        (await response.json()) as PlayerDataResponse

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ||
            'Unable to load checklist players.'
        )
      }

      setPeople(data.people ?? [])
      setPlayerDataLoaded(true)
    } catch (err) {
      setPlayerDataError(
        err instanceof Error
          ? err.message
          : 'Unable to load checklist players.'
      )
    } finally {
      setPlayerDataLoading(false)
    }
  }

  async function loadInventoryResults() {
    const response = await fetch(
      `/api/checklists/${encodeURIComponent(
        checklistId
      )}/inventory-matches`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    )

    const data =
      (await response.json()) as InventoryMatchesResponse

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
          'Unable to load checklist inventory results.'
      )
    }

    setInventoryMatches(data.matches ?? [])
    setInventoryResultsLoaded(true)

    return data.matches ?? []
  }

  async function updateBuildInventoryStatus(
    checklistItemId: string,
    inventoryItemId: string,
    requestedStatus: SharedInventoryBulkStatus
  ) {
    if (!inventoryItemId || buildStatusUpdatingItemId) return

    setBuildStatusUpdatingItemId(inventoryItemId)
    setBuildStatusError('')

    try {
      const result = await updateInventoryBulkStatusShared({
        itemIds: [inventoryItemId],
        requestedStatus,
      })

      if (!result.ok) {
        throw new Error(result.error)
      }

      setBuildPreferredInventoryByChecklistItemId((current) => {
        const next = new Map(current)
        next.set(checklistItemId, inventoryItemId)
        return next
      })

      await loadInventoryResults()
    } catch (err) {
      setBuildStatusError(
        err instanceof Error
          ? err.message
          : 'Unable to update inventory status.'
      )
    } finally {
      setBuildStatusUpdatingItemId('')
    }
  }

  async function checkInventory() {
    if (inventoryChecking) return

    setInventoryChecking(true)
    setInventoryCheckError('')
    setInventoryCheckMessage('')

    try {
      const result = await ensureChecklistInventoryMatches(checklistId, { force: true })

      if (!result.ok) {
        throw new Error(result.error)
      }

      const savedMatches = await loadInventoryResults()

      if (result.status === 'matched') {
        setInventoryCheckMessage(
          `Inventory checked · ${savedMatches.length.toLocaleString()} saved match${
            savedMatches.length === 1 ? '' : 'es'
          } loaded.`
        )
      } else {
        setInventoryCheckMessage(
          `Inventory matches are current · ${savedMatches.length.toLocaleString()} saved match${
            savedMatches.length === 1 ? '' : 'es'
          } loaded.`
        )
      }
    } catch (err) {
      setInventoryCheckError(
        err instanceof Error
          ? err.message
          : 'Unable to check inventory.'
      )
    } finally {
      setInventoryChecking(false)
    }
  }

  async function openMyInventory() {
    setMyInventoryOpen(true)

    if (inventoryResultsLoaded) return

    setInventoryCheckError('')

    try {
      await loadInventoryResults()
    } catch (err) {
      setInventoryCheckError(
        err instanceof Error
          ? err.message
          : 'Unable to load checklist inventory results.'
      )
    }
  }

  function switchMode(nextMode: BrowseMode) {
    setMode(nextMode)
    setSearchInput('')
    setSearchQuery('')
    setExpandedInventoryItemId('')
    setBuildOpportunitiesOpen(false)
    setReviewBuildSectionId('')

    if (nextMode !== 'team') {
      setSelectedTeam('')
      setSelectedTeamSectionId('')
    }

    if (nextMode !== 'player') {
      setSelectedPlayer('')
    }

    if (nextMode !== 'section') {
      setSelectedSectionId('')
    }

    if (
      nextMode === 'player' &&
      !playerDataLoaded
    ) {
      void loadPlayerData()
    }

    rightPaneRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  function submitSearch(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setSearchQuery(searchInput.trim())
    setExpandedInventoryItemId('')

    rightPaneRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  function clearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setExpandedInventoryItemId('')

    rightPaneRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  function jumpToTeamLetter(letter: string) {
    const element = document.getElementById(
      `checklist-team-letter-${letter}`
    )

    element?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function jumpToPlayerLetter(letter: string) {
    const element = document.getElementById(
      `checklist-player-letter-${letter}`
    )

    element?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function selectTeam(teamName: string) {
    setSelectedTeam(teamName)
    setSelectedTeamSectionId('')
    setSearchInput('')
    setSearchQuery('')
    setExpandedInventoryItemId('')
    setBuildOpportunitiesOpen(false)
    setReviewBuildSectionId('')
    setSelectedChecklistItemId('')

    rightPaneRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  function selectTeamSection(sectionId: string) {
    setSelectedTeamSectionId(sectionId)
    setExpandedInventoryItemId('')
    setSelectedChecklistItemId('')

    requestAnimationFrame(() => {
      rightPaneRef.current?.scrollTo({
        top: 0,
        behavior: 'auto',
      })
    })
  }

  function closeTeamSection() {
    setSelectedTeamSectionId('')
    setExpandedInventoryItemId('')
    setSelectedChecklistItemId('')

    rightPaneRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  function openChecklistRowEditor(item: ChecklistItem) {
    if (!canEdit) return

    setChecklistRowEditMessage('')
    setEditingChecklistItemId(item.id)
  }

  function closeChecklistRowEditor() {
    setEditingChecklistItemId('')
  }

  function handleChecklistRowSaved(updatedItem: ChecklistItem) {
    setItems((current) =>
      current.map((item) =>
        item.id === updatedItem.id
          ? {
              ...item,
              ...updatedItem,
            }
          : item
      )
    )

    if (playerDataLoaded) {
      setPeople((current) => {
        const matching = current
          .filter((person) => person.checklist_item_id === updatedItem.id)
          .sort(
            (a, b) =>
              Number(a.sort_order ?? Number.MAX_SAFE_INTEGER) -
              Number(b.sort_order ?? Number.MAX_SAFE_INTEGER)
          )

        const primary = matching[0]

        if (primary) {
          return current.map((person) =>
            person === primary
              ? {
                  ...person,
                  player_name: updatedItem.player_name,
                  printed_team: updatedItem.printed_team,
                }
              : person
          )
        }

        if (cleanText(updatedItem.player_name)) {
          return [
            ...current,
            {
              checklist_item_id: updatedItem.id,
              player_name: updatedItem.player_name,
              printed_team: updatedItem.printed_team,
              sort_order: 1,
            },
          ]
        }

        return current
      })
    }

    setChecklistRowEditMessage('Checklist row updated.')
    setEditingChecklistItemId('')
  }

  function handleChecklistRowDeleted(itemId: string) {
    setItems((current) =>
      current.filter((item) => item.id !== itemId)
    )

    setPeople((current) =>
      current.filter((person) => person.checklist_item_id !== itemId)
    )

    setInventoryMatches((current) =>
      current.filter((match) => match.checklist_item_id !== itemId)
    )

    setBuildPreferredInventoryByChecklistItemId((current) => {
      if (!current.has(itemId)) return current

      const next = new Map(current)
      next.delete(itemId)
      return next
    })

    if (selectedChecklistItemId === itemId) {
      setSelectedChecklistItemId('')
    }

    if (expandedInventoryItemId === itemId) {
      setExpandedInventoryItemId('')
    }

    setChecklistRowEditMessage('Checklist row deleted.')
    setEditingChecklistItemId('')
  }

  const editingChecklistItem = editingChecklistItemId
    ? itemById.get(editingChecklistItemId) ?? null
    : null

  const checklistRowEditorItem: ChecklistRowEditorItem | null =
    editingChecklistItem
      ? {
          ...editingChecklistItem,
          print_run:
            cleanText(editingChecklistItem.print_run) &&
            Number.isFinite(Number(editingChecklistItem.print_run))
              ? Number(editingChecklistItem.print_run)
              : null,
        }
      : null

  const checklistRowEditorSections: ChecklistRowEditorSection[] =
    orderedSections.map((section) => ({
      ...section,
      name: cleanText(section.name) || 'Uncategorized',
    }))

  function inventoryPrefillHref(item: ChecklistItem) {
    const params = new URLSearchParams()

    params.set('from', 'checklist')
    params.set('checklist_id', checklistId)
    params.set('checklist_item_id', item.id)

    const playerName = cleanText(item.player_name)
    const year = cleanText(checklist?.year)
    const brand =
      cleanText(checklist?.brand) ||
      cleanText(checklist?.manufacturer)
    const setName =
      cleanText(checklist?.product_name) ||
      cleanText(checklist?.name)
    const cardNumber = cleanText(item.card_number)
    const parallelName =
      cleanText(item.parallel_name) ||
      cleanText(item.variation)
    const team = cleanText(item.printed_team)

    if (playerName) params.set('player_name', playerName)
    if (year) params.set('year', year)
    if (brand) params.set('brand', brand)
    if (setName) params.set('set_name', setName)
    if (cardNumber) params.set('card_number', cardNumber)
    if (parallelName) params.set('parallel_name', parallelName)
    if (team) params.set('team', team)

    return `/app/inventory/new?${params.toString()}`
  }

  function renderCardTable(
    cardItems: ChecklistItem[]
  ) {
    const tableGridClass = inventoryResultsLoaded
      ? 'grid-cols-[110px_minmax(180px,1.2fr)_minmax(160px,1fr)_130px_minmax(160px,1fr)]'
      : 'grid-cols-[110px_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(160px,1fr)]'

    return (
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div
          className={`grid ${tableGridClass} gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400`}
        >
          <div>Card #</div>
          <div>Player</div>
          <div>Team</div>
          {inventoryResultsLoaded ? (
            <div>Owned</div>
          ) : null}
          <div>Details</div>
        </div>

        <div>
          {cardItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              No matching checklist cards.
            </div>
          ) : (
            cardItems.map((item) => {
              const ownership = inventoryResultsLoaded
                ? ownershipForItem(
                    item,
                    matchesByChecklistItemId
                  )
                : null

              const matchedInventory = inventoryResultsLoaded
                ? matchedInventoryForItem(
                    item,
                    matchesByChecklistItemId
                  )
                : []

              const inventoryDetailsExpanded =
                expandedInventoryItemId === item.id

              const cardActionsOpen =
                selectedChecklistItemId === item.id

              const details = [
                cleanText(item.parallel_name),
                cleanText(item.variation),
                item.rookie_flag ? 'RC' : '',
                item.auto_flag ? 'Auto' : '',
                item.relic_flag ? 'Relic' : '',
                item.serial_flag
                  ? 'Serial #'
                  : '',
                cleanText(item.print_run)
                  ? `/${cleanText(
                      item.print_run
                    )}`
                  : '',
              ].filter(Boolean)

              return (
                <Fragment key={item.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedChecklistItemId(
                        cardActionsOpen ? '' : item.id
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' ||
                        event.key === ' '
                      ) {
                        event.preventDefault()
                        setSelectedChecklistItemId(
                          cardActionsOpen ? '' : item.id
                        )
                      }
                    }}
                    className={`grid ${tableGridClass} cursor-pointer gap-3 border-b border-slate-900 px-3 py-3 text-sm hover:bg-slate-950 ${
                      cardActionsOpen
                        ? 'bg-slate-950 ring-1 ring-inset ring-cyan-900'
                        : ''
                    }`}
                  >
                  <div className="font-medium text-white">
                    {cleanText(
                      item.card_number
                    ) || '—'}
                  </div>

                  <div className="text-slate-100">
                    {cleanText(
                      item.player_name
                    ) || '—'}
                  </div>

                  <div className="text-slate-300">
                    {cleanText(
                      item.printed_team
                    ) || '—'}
                  </div>

                  {inventoryResultsLoaded ? (
                    <div>
                      {ownership?.owned ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setExpandedInventoryItemId(
                                inventoryDetailsExpanded
                                  ? ''
                                  : item.id
                              )
                            }}
                            className="app-badge app-badge-success cursor-pointer hover:brightness-110"
                            title="Show matched HITS inventory"
                          >
                            {ownership.copies > 1
                              ? `${ownership.copies} copies`
                              : 'Owned ✓'}
                            <span className="ml-1">
                              {inventoryDetailsExpanded ? '▲' : '▼'}
                            </span>
                          </button>

                          {ownership.notesDerived ? (
                            <span
                              className="app-badge app-badge-info"
                              title="Matched from a grouped inventory item's notes."
                            >
                              Notes
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="app-badge">
                          Missing
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="flex min-w-0 items-center justify-between gap-2 text-slate-400">
                    <span className="min-w-0 truncate">
                      {details.length
                        ? details.join(' • ')
                        : cleanText(item.notes) ||
                          '—'}
                    </span>

                    {canEdit ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openChecklistRowEditor(item)
                        }}
                        className="shrink-0 rounded-lg border border-cyan-800 px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-950"
                        title={`Edit ${cleanText(item.player_name) || 'checklist card'}`}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                  </div>

                  {cardActionsOpen ? (
                    <div className="border-b border-cyan-900/60 bg-cyan-950/10 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
                            Checklist Card
                          </div>

                          <div className="mt-1 text-base font-semibold text-white">
                            {cleanText(item.player_name) || 'Unnamed card'}
                            {cleanText(item.card_number)
                              ? ` #${cleanText(item.card_number)}`
                              : ''}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                            {cleanText(item.printed_team) ? (
                              <span>
                                Team: {cleanText(item.printed_team)}
                              </span>
                            ) : null}

                            {cleanText(item.parallel_name) ? (
                              <span>
                                Parallel: {cleanText(item.parallel_name)}
                              </span>
                            ) : null}

                            {cleanText(item.variation) ? (
                              <span>
                                Variation: {cleanText(item.variation)}
                              </span>
                            ) : null}

                            {cleanText(item.print_run) ? (
                              <span>
                                Print run: /{cleanText(item.print_run)}
                              </span>
                            ) : null}

                            {item.rookie_flag ? <span>Rookie</span> : null}
                            {item.auto_flag ? <span>Autograph</span> : null}
                            {item.relic_flag ? <span>Relic</span> : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={inventoryPrefillHref(item)}
                            onClick={(event) => event.stopPropagation()}
                            className="app-button-primary"
                          >
                            Add to Inventory
                          </Link>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedChecklistItemId('')
                            }}
                            className="app-button"
                          >
                            Close
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-slate-500">
                        The checklist card is selected. The Add to Inventory
                        link carries its checklist details forward so the
                        inventory entry page can prefill them.
                      </div>

                      <ChecklistCardResearch
                        year={checklist?.year}
                        brand={
                          cleanText(checklist?.brand) ||
                          cleanText(checklist?.manufacturer)
                        }
                        setName={
                          cleanText(checklist?.product_name) ||
                          cleanText(checklist?.name)
                        }
                        playerName={item.player_name}
                        cardNumber={item.card_number}
                        parallel={item.parallel_name}
                        variation={item.variation}
                        rookie={item.rookie_flag}
                        className="mt-4"
                      />
                    </div>
                  ) : null}

                  {inventoryDetailsExpanded ? (
                    <div className="border-b border-slate-800 bg-slate-950/70 px-3 py-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Matched HITS Inventory
                      </div>

                      <div className="space-y-2">
                        {matchedInventory.map(
                          ({ match, inventory }) => {
                            const physicalQuantity =
                              physicalQuantityForInventory(inventory)

                            return (
                              <div
                                key={`${item.id}-${inventory.id}`}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-black px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-white">
                                    {cleanText(inventory.title) ||
                                      cleanText(inventory.player_name) ||
                                      'Inventory Item'}
                                  </div>

                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                                    <span>
                                      Status:{' '}
                                      {cleanText(inventory.status) || '—'}
                                    </span>
                                    <span>
                                      Qty:{' '}
                                      {physicalQuantity.toLocaleString()}
                                    </span>
                                    <span>
                                      Match:{' '}
                                      {Number(
                                        match.match_score ?? 0
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                <Link
                                  href={`/app/inventory/${inventory.id}`}
                                  className="rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-950"
                                >
                                  View Item
                                </Link>
                              </div>
                            )
                          }
                        )}
                      </div>
                    </div>
                  ) : null}
                </Fragment>
              )
            })
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-slate-700 bg-black p-6">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-200">
          <LoadingSpinner />
          <span>Loading checklist...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-700 bg-black p-6">
        <div className="font-semibold text-red-300">
          Checklist could not be loaded
        </div>

        <div className="mt-2 text-sm text-slate-300">
          {error}
        </div>
      </div>
    )
  }

  if (!checklist) {
    return (
      <div className="rounded-xl border border-slate-700 bg-black p-6 text-sm text-slate-300">
        Checklist not found.
      </div>
    )
  }

  const selectedSectionName =
    selectedSectionId
      ? sectionNameById.get(
          selectedSectionId
        ) ?? 'Section'
      : ''

  const selectedTeamSectionName =
    selectedTeamSectionId
      ? selectedTeamSectionId ===
        '__uncategorized__'
        ? 'Uncategorized'
        : sectionNameById.get(
            selectedTeamSectionId
          ) ?? 'Section'
      : ''

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-900 bg-black p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Fast Checklist Browser
            </div>

            <div className="mt-1 text-xl font-bold text-white">
              {checklist.name ||
                checklist.product_name ||
                'Checklist'}
            </div>

            <div className="mt-1 text-sm text-slate-400">
              {items.length.toLocaleString()} cards
              {' • '}
              {sections.length.toLocaleString()}{' '}
              sections
              {' • '}
              {teams.length.toLocaleString()} teams
              {playerDataLoaded ? (
                <>
                  {' • '}
                  {players.length.toLocaleString()}{' '}
                  players
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setMyInventoryOpen(false)}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                !myInventoryOpen
                  ? 'bg-sky-900 text-sky-100'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              Checklist
            </button>

            <button
              type="button"
              onClick={() => void openMyInventory()}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                myInventoryOpen
                  ? 'bg-emerald-900 text-emerald-100'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              My Inventory
            </button>
          </div>

          {!myInventoryOpen ? (
          <form
            onSubmit={submitSearch}
            className="flex min-w-75 flex-1 justify-end gap-2"
          >
            <input
              value={searchInput}
              onChange={(event) =>
                setSearchInput(
                  event.target.value
                )
              }
              placeholder="Search player, card #, team, section..."
              className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            />

            <button
              type="submit"
              className="rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-950"
            >
              Search
            </button>

            {searchQuery ? (
              <button
                type="button"
                onClick={clearSearch}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
              >
                Clear
              </button>
            ) : null}
          </form>
          ) : null}
        </div>
      </div>

      {myInventoryOpen ? (
        <ChecklistMyInventory
          checklist={checklist}
          sections={sections}
          items={items}
          matches={inventoryMatches}
          onClose={() => setMyInventoryOpen(false)}
        />
      ) : null}

      {!myInventoryOpen && checklistRowEditMessage ? (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {checklistRowEditMessage}
        </div>
      ) : null}

      <div className={`${myInventoryOpen ? 'hidden' : 'flex'} h-[calc(100vh-18rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-black`}>
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-800 p-3">
          <button
            type="button"
            onClick={() =>
              switchMode('team')
            }
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              mode === 'team'
                ? 'border-yellow-500 bg-yellow-400 text-black'
                : 'border-slate-700 text-slate-200 hover:bg-slate-900'
            }`}
          >
            Browse by Team
          </button>

          <button
            type="button"
            onClick={() =>
              switchMode('player')
            }
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${
              mode === 'player'
                ? 'border-yellow-500 bg-yellow-400 text-black'
                : 'border-slate-700 text-slate-200 hover:bg-slate-900'
            }`}
          >
            {playerDataLoading ? (
              <LoadingSpinner size="sm" />
            ) : null}

            <span>
              {playerDataLoading
                ? 'Loading Players...'
                : 'Browse by Player'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              switchMode('section')
            }
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              mode === 'section'
                ? 'border-yellow-500 bg-yellow-400 text-black'
                : 'border-slate-700 text-slate-200 hover:bg-slate-900'
            }`}
          >
            Browse by Section
          </button>

          <button
            type="button"
            onClick={() => void checkInventory()}
            disabled={inventoryChecking}
            className="flex items-center gap-2 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inventoryChecking ? (
              <LoadingSpinner size="sm" />
            ) : null}

            <span>
              {inventoryChecking
                ? 'Checking Inventory...'
                : 'Check Inventory'}
            </span>
          </button>

          {inventoryResultsLoaded ? (
            <>
              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
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
                    onClick={() =>
                      setOwnershipFilter(value)
                    }
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                      ownershipFilter === value
                        ? 'bg-emerald-900 text-emerald-100'
                        : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setProgressOpen((current) => !current)
                }
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  progressOpen
                    ? 'border-cyan-500 bg-cyan-950 text-cyan-100'
                    : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                }`}
              >
                {progressOpen ? 'Hide Progress' : 'Progress'}
              </button>
            </>
          ) : null}

          <form
            onSubmit={submitSearch}
            className="ml-auto flex min-w-75 flex-1 justify-end gap-2"
          >
            <input
              value={searchInput}
              onChange={(event) =>
                setSearchInput(
                  event.target.value
                )
              }
              placeholder="Search player, card #, team, section..."
              className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            />

            <button
              type="submit"
              className="rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-950"
            >
              Search
            </button>

            {searchQuery ? (
              <button
                type="button"
                onClick={clearSearch}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
              >
                Clear
              </button>
            ) : null}
          </form>
        </div>

        {inventoryCheckError || inventoryCheckMessage ? (
          <div
            className={`shrink-0 border-b px-3 py-2 text-xs ${
              inventoryCheckError
                ? 'border-red-900 bg-red-950/30 text-red-300'
                : 'border-emerald-900 bg-emerald-950/20 text-emerald-300'
            }`}
          >
            {inventoryCheckError || inventoryCheckMessage}
          </div>
        ) : null}

        {inventoryResultsLoaded && progressOpen ? (
          <div className="shrink-0 border-b border-slate-800 bg-slate-950/70 px-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-lg border border-slate-800 bg-black px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Completion
                </div>
                <div className="mt-0.5 text-lg font-bold text-cyan-300">
                  {inventoryProgress.percent.toLocaleString()}%
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-black px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Owned
                </div>
                <div className="mt-0.5 text-lg font-bold text-emerald-300">
                  {inventoryProgress.owned.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-black px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Missing
                </div>
                <div className="mt-0.5 text-lg font-bold text-amber-300">
                  {inventoryProgress.missing.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-black px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Checklist Cards
                </div>
                <div className="mt-0.5 text-lg font-bold text-white">
                  {inventoryProgress.total.toLocaleString()}
                </div>
              </div>

              <div className="min-w-56 flex-1">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                  <span>Checklist progress</span>
                  <span>
                    {inventoryProgress.owned.toLocaleString()}
                    {' / '}
                    {inventoryProgress.total.toLocaleString()}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.min(
                        100,
                        inventoryProgress.percent
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]">
          <div className="min-h-0 border-b border-slate-800 p-3 lg:border-b-0 lg:border-r">
            {mode === 'team' ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <div className="font-semibold text-white">
                    Teams
                  </div>

                  <div className="text-xs text-slate-400">
                    {teams.length}
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-[28px_minmax(0,1fr)] gap-2">
                  <div className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto border-r border-slate-800 pr-1">
                    {teamLetters.map(
                      (letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() =>
                            jumpToTeamLetter(
                              letter
                            )
                          }
                          className="w-6 shrink-0 rounded py-0.5 text-xs font-semibold text-cyan-300 hover:bg-slate-900"
                        >
                          {letter}
                        </button>
                      )
                    )}
                  </div>

                  <div className="min-h-0 overflow-y-auto pr-1">
                    {teams.map(
                      (team, index) => {
                        const currentLetter =
                          getFirstLetter(
                            team.name
                          )

                        const previousLetter =
                          index > 0
                            ? getFirstLetter(
                                teams[
                                  index - 1
                                ].name
                              )
                            : null

                        const showLetter =
                          index === 0 ||
                          currentLetter !==
                            previousLetter

                        return (
                          <div
                            key={team.name}
                          >
                            {showLetter ? (
                              <div
                                id={`checklist-team-letter-${currentLetter}`}
                                className="sticky top-0 z-10 bg-black py-1 text-xs font-bold text-cyan-400"
                              >
                                {
                                  currentLetter
                                }
                              </div>
                            ) : null}

                            <button
                              type="button"
                              onClick={() =>
                                selectTeam(
                                  team.name
                                )
                              }
                              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                                selectedTeam ===
                                team.name
                                  ? 'bg-sky-950 text-white'
                                  : 'text-slate-200 hover:bg-slate-900'
                              }`}
                            >
                              <span>
                                {team.name}
                              </span>

                              <span className="text-xs text-slate-400">
                                {team.count}
                              </span>
                            </button>
                          </div>
                        )
                      }
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {mode === 'player' ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <div className="font-semibold text-white">
                    Players
                  </div>

                  <div className="text-xs text-slate-400">
                    {playerDataLoaded
                      ? players.length
                      : '—'}
                  </div>
                </div>

                {playerDataLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-300">
                    <LoadingSpinner size="sm" />
                    <span>Loading player index...</span>
                  </div>
                ) : playerDataError ? (
                  <div className="rounded-lg border border-red-900 p-4">
                    <div className="text-sm text-red-300">
                      {playerDataError}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void loadPlayerData()
                      }
                      className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900"
                    >
                      Try Again
                    </button>
                  </div>
                ) : playerDataLoaded ? (
                  <div className="grid min-h-0 flex-1 grid-cols-[28px_minmax(0,1fr)] gap-2">
                    <div className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto border-r border-slate-800 pr-1">
                      {playerLetters.map(
                        (letter) => (
                          <button
                            key={letter}
                            type="button"
                            onClick={() =>
                              jumpToPlayerLetter(
                                letter
                              )
                            }
                            className="w-6 shrink-0 rounded py-0.5 text-xs font-semibold text-cyan-300 hover:bg-slate-900"
                          >
                            {letter}
                          </button>
                        )
                      )}
                    </div>

                    <div className="min-h-0 overflow-y-auto pr-1">
                      {players.map(
                        (
                          player,
                          index
                        ) => {
                          const currentLetter =
                            getFirstLetter(
                              player.name
                            )

                          const previousLetter =
                            index > 0
                              ? getFirstLetter(
                                  players[
                                    index -
                                      1
                                  ].name
                                )
                              : null

                          const showLetter =
                            index === 0 ||
                            currentLetter !==
                              previousLetter

                          return (
                            <div
                              key={
                                player.name
                              }
                            >
                              {showLetter ? (
                                <div
                                  id={`checklist-player-letter-${currentLetter}`}
                                  className="sticky top-0 z-10 bg-black py-1 text-xs font-bold text-cyan-400"
                                >
                                  {
                                    currentLetter
                                  }
                                </div>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPlayer(
                                    player.name
                                  )
                                  setSearchInput(
                                    ''
                                  )
                                  setSearchQuery(
                                    ''
                                  )

                                  rightPaneRef.current?.scrollTo(
                                    {
                                      top: 0,
                                      behavior:
                                        'auto',
                                    }
                                  )
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                                  selectedPlayer ===
                                  player.name
                                    ? 'bg-sky-950 text-white'
                                    : 'text-slate-200 hover:bg-slate-900'
                                }`}
                              >
                                <span>
                                  {
                                    player.name
                                  }
                                </span>

                                <span className="text-xs text-slate-400">
                                  {
                                    player.count
                                  }
                                </span>
                              </button>
                            </div>
                          )
                        }
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {mode === 'section' ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <div className="font-semibold text-white">
                    Sections
                  </div>

                  <div className="text-xs text-slate-400">
                    {orderedSections.length}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {orderedSections.map(
                    (section) => {
                      const name =
                        cleanText(
                          section.name
                        ) ||
                        'Uncategorized'

                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => {
                            setSelectedSectionId(
                              section.id
                            )
                            setSearchInput('')
                            setSearchQuery('')

                            rightPaneRef.current?.scrollTo(
                              {
                                top: 0,
                                behavior:
                                  'auto',
                              }
                            )
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                            selectedSectionId ===
                            section.id
                              ? 'bg-sky-950 text-white'
                              : 'text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          <span>
                            {name}
                          </span>

                          <span className="text-xs text-slate-400">
                            {sectionCounts.get(
                              section.id
                            ) ?? 0}
                          </span>
                        </button>
                      )
                    }
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div
            ref={rightPaneRef}
            className="min-h-0 min-w-0 overflow-y-auto p-3"
          >
            {mode === 'player' &&
            playerDataLoading ? (
              <div className="flex min-h-62.5 items-center justify-center rounded-xl border border-dashed border-slate-800">
                <div className="flex flex-col items-center px-6 text-center">
                  <LoadingSpinner size="lg" />

                  <div className="mt-3 text-lg font-semibold text-white">
                    Loading Players
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    Loading this checklist&apos;s
                    player index...
                  </div>
                </div>
              </div>
            ) : mode === 'player' &&
              playerDataError ? (
              <div className="flex min-h-62.5 items-center justify-center rounded-xl border border-dashed border-red-900">
                <div className="max-w-xl px-6 text-center">
                  <div className="text-lg font-semibold text-red-300">
                    Player data could not be loaded
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    {playerDataError}
                  </div>
                </div>
              </div>
            ) : searchQuery ? (
              <div>
                <div className="mb-3">
                  <div className="font-semibold text-white">
                    Search: {searchQuery}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {visibleItems.length.toLocaleString()}{' '}
                    card
                    {visibleItems.length === 1
                      ? ''
                      : 's'}
                  </div>
                </div>

                {renderCardTable(
                  visibleItems
                )}
              </div>
            ) : mode === 'team' &&
              !selectedTeam ? (
              <div className="flex min-h-62.5 items-center justify-center rounded-xl border border-dashed border-slate-800">
                <div className="max-w-xl px-6 text-center">
                  <div className="text-lg font-semibold text-white">
                    Choose a Team
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    Select a team on the left to
                    view its cards.
                  </div>
                </div>
              </div>
            ) : mode === 'team' &&
              selectedTeam ? (
              <div>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {selectedTeam}
                    </div>

                    <div className="mt-1 text-sm text-slate-400">
                      {selectedTeamItems.length.toLocaleString()}{' '}
                      card
                      {selectedTeamItems.length ===
                      1
                        ? ''
                        : 's'}
                    </div>
                  </div>

                  {inventoryResultsLoaded &&
                  actionableTeamCompletion.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setBuildOpportunitiesOpen(
                          (current) => !current
                        )
                      }
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        buildOpportunitiesOpen
                          ? 'border-cyan-500 bg-cyan-950 text-cyan-100'
                          : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      {buildOpportunitiesOpen
                        ? 'Hide Build Opportunities'
                        : `Build Opportunities (${
                            completeTeamSections +
                            nearCompleteTeamSections
                          })`}
                    </button>
                  ) : null}
                </div>

                {buildOpportunitiesOpen &&
                actionableTeamCompletion.length > 0 ? (
                  <div className="mb-4 rounded-xl border border-cyan-900 bg-slate-950/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-white">
                          Team Build Opportunities
                        </div>

                        <div className="mt-1 text-sm text-slate-400">
                          Read-only completion estimates from current checklist
                          matches. No inventory is reserved or changed.
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {completeTeamSections > 0 ? (
                          <span className="app-badge app-badge-success">
                            {completeTeamSections} complete
                          </span>
                        ) : null}

                        {nearCompleteTeamSections > 0 ? (
                          <span className="app-badge app-badge-info">
                            {nearCompleteTeamSections} near complete
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
                      <div className="grid grid-cols-[minmax(180px,1.5fr)_100px_90px_100px_110px_115px] gap-3 border-b border-slate-800 bg-black px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <div>Section</div>
                        <div>Owned</div>
                        <div>Missing</div>
                        <div>Potential Sets</div>
                        <div>Status</div>
                        <div>Review</div>
                      </div>

                      <div>
                        {actionableTeamCompletion.map((summary) => (
                          <div
                            key={summary.sectionId}
                            className="grid grid-cols-[minmax(180px,1.5fr)_100px_90px_100px_110px_115px] items-center gap-3 border-b border-slate-900 px-3 py-3 text-sm last:border-b-0 hover:bg-slate-900"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setBuildOpportunitiesOpen(false)
                                setReviewBuildSectionId('')
                                selectTeamSection(summary.sectionId)
                              }}
                              className="text-left font-medium text-cyan-200 hover:underline"
                            >
                              {summary.sectionName}
                            </button>

                            <div className="text-slate-300">
                              {summary.ownedCards}/
                              {summary.totalCards}
                            </div>

                            <div className="text-slate-300">
                              {summary.missingCards}
                            </div>

                            <div className="text-slate-300">
                              {summary.potentialCompleteSets > 0
                                ? summary.potentialCompleteSets
                                : '—'}
                            </div>

                            <div>
                              {summary.status === 'complete' ? (
                                <span className="app-badge app-badge-success">
                                  Complete
                                </span>
                              ) : summary.status === 'near' ? (
                                <span className="app-badge app-badge-info">
                                  Near Complete
                                </span>
                              ) : summary.status === 'partial' ? (
                                <span className="app-badge">
                                  In Progress
                                </span>
                              ) : (
                                <span className="app-badge">
                                  No Matches
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setBuildStatusError('')

                                if (
                                  reviewBuildSectionId !== summary.sectionId
                                ) {
                                  setBuildPreferredInventoryByChecklistItemId(
                                    new Map()
                                  )
                                }

                                setReviewBuildSectionId(
                                  reviewBuildSectionId === summary.sectionId
                                    ? ''
                                    : summary.sectionId
                                )
                              }}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                                reviewBuildSectionId === summary.sectionId
                                  ? 'border-cyan-500 bg-cyan-950 text-cyan-100'
                                  : 'border-slate-700 text-slate-200 hover:bg-slate-950'
                              }`}
                            >
                              {reviewBuildSectionId === summary.sectionId
                                ? 'Hide Review'
                                : 'Review Build'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      Click a section name to open its checklist cards.
                    </div>

                    {reviewBuildSummary ? (
                      <div
                        ref={reviewBuildRef}
                        className="mt-4 scroll-mt-3 rounded-xl border border-slate-700 bg-black p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-white">
                              Review Build · {reviewBuildSummary.sectionName}
                            </div>

                            <div className="mt-1 text-sm text-slate-400">
                              HITS is proposing the exact physical inventory
                              records it would use for one set. Nothing changes
                              until you press Build Set.
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="app-badge app-badge-success">
                              {reviewBuildMatchedCount}/
                              {reviewBuildRows.length} matched
                            </span>

                            {reviewBuildProposal?.listedCount ? (
                              <span className="app-badge app-badge-info">
                                {reviewBuildProposal.listedCount} listed
                              </span>
                            ) : null}

                            {reviewBuildProposal?.personalCount ? (
                              <span className="app-badge app-badge-info">
                                {reviewBuildProposal.personalCount} personal
                              </span>
                            ) : null}

                            {reviewBuildProposal?.unresolvedCount ? (
                              <span className="app-badge app-badge-info">
                                {reviewBuildProposal.unresolvedCount} unresolved
                              </span>
                            ) : reviewBuildProposal?.mixedPersonalStatus ||
                              reviewBuildProposal?.listedCount ? (
                              <span className="app-badge app-badge-info">
                                Review Required
                              </span>
                            ) : reviewBuildProposal?.ready ? (
                              <span className="app-badge app-badge-success">
                                Ready ·{' '}
                                {reviewBuildProposal.resultStatus === 'personal'
                                  ? 'Personal Set'
                                  : 'Available Set'}
                              </span>
                            ) : null}

                            <span className="app-badge">
                              {buildQuoteLoading
                                ? 'Checking cost...'
                                : `$${Number(
                                    reviewBuildAuthoritativeCost
                                  ).toFixed(2)} cost`}
                            </span>
                          </div>
                        </div>

                        {reviewBuildProposal?.mixedPersonalStatus ? (
                          <div className="mt-3 rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-3">
                            <div className="font-semibold text-amber-200">
                              Mixed inventory statuses need a decision before building.
                            </div>

                            <div className="mt-1 text-sm text-amber-100/90">
                              This proposal uses{' '}
                              {reviewBuildProposal.personalCount.toLocaleString()}{' '}
                              Personal item
                              {reviewBuildProposal.personalCount === 1 ? '' : 's'} and{' '}
                              {reviewBuildProposal.sellableCount.toLocaleString()}{' '}
                              non-Personal item
                              {reviewBuildProposal.sellableCount === 1 ? '' : 's'}.
                              Use the Status controls below to make the exact proposed
                              copies all Personal for a personal set, or change the
                              Personal item(s) to Available for a sellable set. HITS
                              will keep the physical copy you intentionally changed
                              selected for this build.
                            </div>
                          </div>
                        ) : null}

                        {reviewBuildProposal?.listedCount ? (
                          <div className="mt-3 rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-3">
                            <div className="font-semibold text-amber-200">
                              Listed inventory must be reviewed before building.
                            </div>

                            <div className="mt-1 text-sm text-amber-100/90">
                              Use the Status controls below to change the listed source
                              item(s) to the status you intend before completing this
                              build.
                            </div>
                          </div>
                        ) : null}

                        {reviewBuildProposal?.ready &&
                        reviewBuildProposal.resultStatus === 'personal' ? (
                          <div className="mt-3 rounded-xl border border-cyan-800 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
                            All proposed source cards are Personal. Building will create
                            one finished Personal team set.
                          </div>
                        ) : null}

                        {reviewBuildProposal?.ready &&
                        reviewBuildProposal.resultStatus === 'available' ? (
                          <div className="mt-3 rounded-xl border border-emerald-800 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
                            The proposed source cards are ready for a sellable build.
                            Building will create one Available team set.
                          </div>
                        ) : null}

                        {buildQuote?.ok === false ? (
                          <div className="mt-3 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                            {buildQuote.error}
                          </div>
                        ) : null}

                        {reviewBuildProposal?.ready && buildQuoteLoading ? (
                          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                            <LoadingSpinner size="sm" />
                            Confirming current inventory cost...
                          </div>
                        ) : null}

                        {buildStatusError ? (
                          <div className="mt-3 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                            {buildStatusError}
                          </div>
                        ) : null}

                        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
                          <div className="grid grid-cols-[90px_minmax(160px,1fr)_minmax(220px,1.5fr)_130px_70px_80px] gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <div>Card #</div>
                            <div>Checklist Card</div>
                            <div>Matched Inventory</div>
                            <div>Status</div>
                            <div>Qty</div>
                            <div>Open</div>
                          </div>

                          <div className="max-h-80 overflow-y-auto">
                            {reviewBuildRows.map(
                              ({
                                checklistItem,
                                inventory,
                                match,
                                protectedStatus,
                                issue,
                              }) => (
                                <div
                                  key={checklistItem.id}
                                  className="grid grid-cols-[90px_minmax(160px,1fr)_minmax(220px,1.5fr)_130px_70px_80px] items-center gap-3 border-b border-slate-900 px-3 py-3 text-sm last:border-b-0"
                                >
                                  <div className="font-mono text-slate-300">
                                    {cleanText(checklistItem.card_number) || '—'}
                                  </div>

                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-white">
                                      {cleanText(checklistItem.player_name) ||
                                        'Unnamed card'}
                                    </div>

                                    {cleanText(checklistItem.parallel_name) ? (
                                      <div className="mt-0.5 truncate text-xs text-slate-500">
                                        {cleanText(checklistItem.parallel_name)}
                                      </div>
                                    ) : null}
                                  </div>

                                  {inventory ? (
                                    <div className="min-w-0">
                                      <div className="truncate text-emerald-200">
                                        {cleanText(inventory.title) ||
                                          cleanText(inventory.player_name) ||
                                          'Inventory Item'}
                                      </div>

                                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                                        <span>
                                          Match {Number(
                                            match?.match_score ?? 0
                                          ).toLocaleString()}
                                        </span>
                                        {protectedStatus &&
                                        !(
                                          reviewBuildProposal?.ready &&
                                          reviewBuildProposal.resultStatus ===
                                            'personal'
                                        ) ? (
                                          <span className="text-amber-300">
                                            Protected
                                          </span>
                                        ) : null}
                                      </div>

                                      {issue &&
                                      !(
                                        reviewBuildProposal?.ready &&
                                        reviewBuildProposal.resultStatus ===
                                          'personal' &&
                                        cleanText(inventory.status).toLowerCase() ===
                                          'personal'
                                      ) ? (
                                        <div className="mt-1 text-xs text-amber-300">
                                          {issue}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="text-amber-300">
                                      Missing
                                    </div>
                                  )}

                                  <div>
                                    {inventory ? (
                                      <div className="flex items-center gap-2">
                                        <select
                                          value={
                                            cleanText(inventory.status).toLowerCase() ||
                                            'available'
                                          }
                                          disabled={Boolean(buildStatusUpdatingItemId)}
                                          onChange={(event) => {
                                            const requestedStatus = event.target
                                              .value as SharedInventoryBulkStatus

                                            void updateBuildInventoryStatus(
                                              checklistItem.id,
                                              inventory.id,
                                              requestedStatus
                                            )
                                          }}
                                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 disabled:cursor-wait disabled:opacity-60"
                                          aria-label={`Status for ${
                                            cleanText(inventory.title) ||
                                            cleanText(inventory.player_name) ||
                                            'inventory item'
                                          }`}
                                        >
                                          <option value="available">Available</option>
                                          <option value="personal">Personal</option>
                                          <option value="listed">Listed</option>
                                          <option value="junk">Junk</option>
                                        </select>

                                        {buildStatusUpdatingItemId === inventory.id ? (
                                          <LoadingSpinner size="sm" />
                                        ) : null}
                                      </div>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </div>

                                  <div className="text-slate-300">
                                    {inventory
                                      ? physicalQuantityForInventory(
                                          inventory
                                        ).toLocaleString()
                                      : '—'}
                                  </div>

                                  <div>
                                    {inventory ? (
                                      <Link
                                        href={`/app/inventory/${inventory.id}`}
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
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-900/70 bg-cyan-950/20 px-4 py-3">
                          <div className="text-sm text-cyan-100">
                            Building creates one finished inventory item and
                            atomically reduces the exact proposed source quantities.
                            Review Build confirms the current database cost for those
                            exact physical records before Build Set is enabled.
                            All-Personal components create a Personal set; otherwise
                            the finished set is Available. Mixed Personal/sellable or
                            Listed components must be resolved first.
                          </div>

                          <form action={buildChecklistSetAction}>
                            <input
                              type="hidden"
                              name="checklistId"
                              value={checklistId}
                            />
                            <input
                              type="hidden"
                              name="sectionId"
                              value={reviewBuildSummary.sectionId}
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
                                reviewBuildRows.map((row) => ({
                                  inventory_item_id: row.inventory?.id ?? '',
                                  checklist_item_id: row.checklistItem.id,
                                }))
                              )}
                            />

                            <BuildSetSubmitButton
                              disabled={!reviewBuildQuoteReady}
                              title={
                                !reviewBuildProposal?.ready
                                  ? 'Resolve mixed Personal/sellable, Listed, or missing components before building'
                                  : buildQuoteLoading
                                    ? 'Confirming current inventory cost'
                                    : buildQuote?.ok === false
                                      ? 'Current inventory cost could not be confirmed'
                                      : reviewBuildProposal.resultStatus ===
                                          'personal'
                                        ? 'Create this finished Personal team set'
                                        : 'Create this finished Available team set'
                              }
                            />
                          </form>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedTeamSectionId ? (
                  <>
                    <div className="mb-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {
                              selectedTeamSectionName
                            }
                          </div>

                          <div className="mt-1 text-xs text-slate-400">
                            {selectedTeamSectionItems.length.toLocaleString()}{' '}
                            card
                            {selectedTeamSectionItems.length ===
                            1
                              ? ''
                              : 's'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={
                            closeTeamSection
                          }
                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900"
                        >
                          Close Section
                        </button>
                      </div>

                      {renderCardTable(
                        visibleItems
                      )}
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Other Sections
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {selectedTeamSectionGroups.map(
                          (group) => (
                            <button
                              key={
                                group.id
                              }
                              type="button"
                              onClick={() =>
                                selectTeamSection(
                                  group.id
                                )
                              }
                              className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${
                                selectedTeamSectionId ===
                                group.id
                                  ? 'border-cyan-400 bg-sky-950'
                                  : 'border-sky-900 bg-black hover:bg-slate-950'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-cyan-300">
                                  {selectedTeamSectionId ===
                                  group.id
                                    ? '▼'
                                    : '▶'}
                                </span>

                                <span className="font-semibold text-white">
                                  {
                                    group.name
                                  }
                                </span>
                              </div>

                              <span className="shrink-0 rounded-full border border-slate-500 px-2 py-0.5 text-xs text-slate-200">
                                {
                                  group.count
                                }{' '}
                                card
                                {group.count ===
                                1
                                  ? ''
                                  : 's'}
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {selectedTeamSectionGroups.map(
                        (group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() =>
                              selectTeamSection(
                                group.id
                              )
                            }
                            className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-sky-900 bg-black px-4 py-3 text-left hover:bg-slate-950"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-cyan-300">
                                ▶
                              </span>

                              <span className="font-semibold text-white">
                                {
                                  group.name
                                }
                              </span>
                            </div>

                            <span className="shrink-0 rounded-full border border-slate-500 px-2 py-0.5 text-xs text-slate-200">
                              {
                                group.count
                              }{' '}
                              card
                              {group.count ===
                              1
                                ? ''
                                : 's'}
                            </span>
                          </button>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : mode === 'player' &&
              !selectedPlayer ? (
              <div className="flex min-h-62.5 items-center justify-center rounded-xl border border-dashed border-slate-800">
                <div className="max-w-xl px-6 text-center">
                  <div className="text-lg font-semibold text-white">
                    Choose a Player
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    Select a player on the left to
                    view every matching card in the
                    checklist.
                  </div>
                </div>
              </div>
            ) : mode === 'player' &&
              selectedPlayer ? (
              <div>
                <div className="mb-3">
                  <div className="font-semibold text-white">
                    {selectedPlayer}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {visibleItems.length.toLocaleString()}{' '}
                    card
                    {visibleItems.length === 1
                      ? ''
                      : 's'}
                  </div>
                </div>

                {renderCardTable(
                  visibleItems
                )}
              </div>
            ) : mode === 'section' &&
              !selectedSectionId ? (
              <div className="flex min-h-62.5 items-center justify-center rounded-xl border border-dashed border-slate-800">
                <div className="max-w-xl px-6 text-center">
                  <div className="text-lg font-semibold text-white">
                    Choose a Section
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    Select a section on the left to
                    view its cards.
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <div className="font-semibold text-white">
                    {selectedSectionName}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {visibleItems.length.toLocaleString()}{' '}
                    card
                    {visibleItems.length === 1
                      ? ''
                      : 's'}
                  </div>
                </div>

                {renderCardTable(
                  visibleItems
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {canEdit && editingChecklistItemId ? (
        <ChecklistRowEditor
          open={Boolean(editingChecklistItemId)}
          checklistId={checklistId}
          item={checklistRowEditorItem}
          sections={checklistRowEditorSections}
          onClose={closeChecklistRowEditor}
          onSaved={handleChecklistRowSaved}
          onDeleted={handleChecklistRowDeleted}
        />
      ) : null}

      {inventoryChecking ? (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-label="Checking inventory"
        >
          <div className="flex min-w-70 flex-col items-center gap-4 rounded-2xl border border-zinc-700 bg-zinc-950/95 px-8 py-7 shadow-2xl">
            <LoadingSpinner size="lg" />

            <div className="text-center">
              <div className="text-base font-semibold text-zinc-100">
                Checking Inventory...
              </div>

              <div className="mt-1 text-sm text-zinc-400">
                Checking this checklist against your inventory.
              </div>

              <div className="mt-3 max-w-sm text-xs leading-relaxed text-amber-300">
                Large checklists may take a while to process. Please don&apos;t
                refresh or leave this page while HITS is checking your inventory.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}