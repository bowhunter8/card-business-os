'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChecklistAlphabetRail from '@/app/components/ChecklistAlphabetRail'
import { createClient } from '@/lib/supabase/client'
import {
  calculateBreakPricing,
  describeSpotPricing,
  type BreakPricingChecklistItem,
  type PlayerDemandOverride,
  type SpotPricingInput,
} from '@/lib/breakPricing'

type ChecklistOption = {
  id: string
  name: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  sport?: string | null
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

type PlayerDemandRow = {
  player_name: string
  demand_multiplier: number | string
  demand_tier: string
  reason: string | null
}

type ExistingSpot = {
  id: string
  spot_number: number | null
  spot_name: string
  team_name: string | null
  player_name: string | null
  asking_price: number | string | null
  notes?: string | null
  spot_source?: string | null
  grouping_type?: string | null
  pricing_method?: string | null
}

type ExistingSpotSource = {
  id: string
  breaker_break_spot_id: string
  source_type: string
  source_name: string
  team_name: string | null
  player_name: string | null
}

type Props = {
  breakId: string
  breakFormat: string
  targetRevenue: number
  checklists: ChecklistOption[]
  sections: ChecklistSection[]
  items: ChecklistItem[]
  initialChecklistId?: string | null
  initialSpots?: ExistingSpot[]
  initialSpotSources?: ExistingSpotSource[]
}

type ChecklistCategory =
  | 'baseball'
  | 'basketball'
  | 'football'
  | 'tcg_other'
  | 'other_sports'

type DraftSpotMember = {
  key: string
  sourceType: 'team' | 'player' | 'manual'
  sourceName: string
  teamName: string | null
  playerName: string | null
}

type DraftSpot = {
  id: string
  spotName: string
  askingPrice: string
  pricingAdjustmentAmount?: string
  pricingMethod: 'manual' | 'tier' | 'rule' | 'imported' | 'calculated'
  groupingType: 'team' | 'player' | 'combined' | 'custom'
  spotSource: 'checklist' | 'manual'
  members: DraftSpotMember[]
  notes: string
}

type PricingDraft = {
  version: 1
  selectedChecklistId: string
  activeCategory: ChecklistCategory
  selectedTeam: string
  selectedSectionId: string
  spots: DraftSpot[]
  savedAt: string
}

const CHECKLIST_CATEGORIES: Array<{ id: ChecklistCategory; label: string }> = [
  { id: 'baseball', label: 'Baseball' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'football', label: 'Football' },
  { id: 'other_sports', label: 'Other Sports' },
  { id: 'tcg_other', label: 'TCG / Other' },
]

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function normalize(value: string | null | undefined) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compareNatural(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function alphabetLetter(value: string) {
  const first = clean(value).charAt(0).toUpperCase()
  return /^[A-Z]$/.test(first) ? first : '#'
}

function checklistSearchText(checklist: ChecklistOption) {
  return normalize(
    [
      checklist.year,
      checklist.manufacturer,
      checklist.brand,
      checklist.product_name,
      checklist.name,
      checklist.sport,
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function matchesSearchTokens(checklist: ChecklistOption, query: string) {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return true

  const haystackTokens = checklistSearchText(checklist).split(' ').filter(Boolean)

  return tokens.every((token) => {
    if (/^\d+$/.test(token)) return haystackTokens.includes(token)
    return haystackTokens.some((haystackToken) => haystackToken.includes(token))
  })
}

function checklistSearchScore(checklist: ChecklistOption, query: string) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 0

  const haystack = checklistSearchText(checklist)
  const productName = normalize(checklist.product_name)
  const checklistName = normalize(checklist.name)

  let score = 0
  if (checklistName === normalizedQuery) score += 1000
  if (productName === normalizedQuery) score += 900
  if (checklistName.includes(normalizedQuery)) score += 500
  if (productName.includes(normalizedQuery)) score += 450
  if (haystack.includes(normalizedQuery)) score += 300

  const queryTokens = normalizedQuery.split(' ').filter(Boolean)
  const haystackTokens = haystack.split(' ').filter(Boolean)

  for (const token of queryTokens) {
    if (haystackTokens.includes(token)) score += 25
  }

  return score
}

function checklistCategory(checklist: ChecklistOption): ChecklistCategory {
  const sport = normalize(checklist.sport)
  const text = checklistSearchText(checklist)

  if (sport.includes('basketball') || /\bbasketball\b/.test(text) || /\bnba\b/.test(text)) {
    return 'basketball'
  }

  if (sport.includes('football') || /\bfootball\b/.test(text) || /\bnfl\b/.test(text)) {
    return 'football'
  }

  if (
    sport.includes('baseball') ||
    /\bbaseball\b/.test(text) ||
    /\bmlb\b/.test(text) ||
    /\bbowman\b/.test(text)
  ) {
    return 'baseball'
  }

  if (
    sport.includes('pokemon') ||
    sport.includes('tcg') ||
    sport.includes('non sport') ||
    /\bpokemon\b/.test(text) ||
    /\byu gi oh\b/.test(text) ||
    /\bmagic\b/.test(text) ||
    /\bmarvel\b/.test(text) ||
    /\bstar wars\b/.test(text) ||
    /\bdisney\b/.test(text)
  ) {
    return 'tcg_other'
  }

  return 'other_sports'
}

function money(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function uniquePlayerMembers(items: ChecklistItem[]) {
  const map = new Map<string, DraftSpotMember>()

  for (const item of items) {
    const player = clean(item.player_name)
    if (!player) continue

    const team = clean(item.printed_team) || null
    const key = `${normalize(team)}::${normalize(player)}`

    if (!map.has(key)) {
      map.set(key, {
        key,
        sourceType: 'player',
        sourceName: player,
        teamName: team,
        playerName: player,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const teamCompare = compareNatural(clean(a.teamName), clean(b.teamName))
    if (teamCompare !== 0) return teamCompare
    return compareNatural(a.sourceName, b.sourceName)
  })
}

function existingSpotsToDraft(
  spots: ExistingSpot[],
  sources: ExistingSpotSource[]
): DraftSpot[] {
  const sourcesBySpotId = new Map<string, ExistingSpotSource[]>()

  for (const source of sources) {
    const current = sourcesBySpotId.get(source.breaker_break_spot_id) ?? []
    current.push(source)
    sourcesBySpotId.set(source.breaker_break_spot_id, current)
  }

  return spots.map((spot) => {
    const groupingType =
      spot.grouping_type === 'team' ||
      spot.grouping_type === 'player' ||
      spot.grouping_type === 'combined' ||
      spot.grouping_type === 'custom'
        ? spot.grouping_type
        : spot.team_name
          ? 'team'
          : spot.player_name
            ? 'player'
            : 'custom'

    const spotSource = spot.spot_source === 'checklist' ? 'checklist' : 'manual'

    const pricingMethod =
      spot.pricing_method === 'tier' ||
      spot.pricing_method === 'rule' ||
      spot.pricing_method === 'imported' ||
      spot.pricing_method === 'calculated'
        ? spot.pricing_method
        : 'manual'

    const savedSources = sourcesBySpotId.get(spot.id) ?? []

    const members: DraftSpotMember[] = savedSources
      .filter(
        (source) =>
          source.source_type === 'team' ||
          source.source_type === 'player' ||
          source.source_type === 'manual'
      )
      .map((source) => ({
        key:
          source.source_type === 'team'
            ? `team::${normalize(source.source_name)}`
            : source.source_type === 'player'
              ? `player::${normalize(source.team_name)}::${normalize(source.source_name)}`
              : `manual::${source.id}`,
        sourceType: source.source_type as DraftSpotMember['sourceType'],
        sourceName: source.source_name,
        teamName: source.team_name,
        playerName: source.player_name,
      }))

    if (members.length === 0 && spot.team_name) {
      members.push({
        key: `team::${normalize(spot.team_name)}`,
        sourceType: 'team',
        sourceName: spot.team_name,
        teamName: spot.team_name,
        playerName: null,
      })
    } else if (members.length === 0 && spot.player_name) {
      members.push({
        key: `player::${normalize(spot.player_name)}`,
        sourceType: 'player',
        sourceName: spot.player_name,
        teamName: null,
        playerName: spot.player_name,
      })
    }

    return {
      id: spot.id || makeId(),
      spotName: spot.spot_name,
      askingPrice:
        spot.asking_price === null || spot.asking_price === undefined
          ? ''
          : String(spot.asking_price),
      pricingMethod,
      groupingType,
      spotSource,
      members,
      notes: spot.notes ?? '',
    }
  })
}

export default function BreakerChecklistPricing({
  breakId,
  breakFormat,
  targetRevenue,
  checklists,
  sections,
  items,
  initialChecklistId = null,
  initialSpots = [],
  initialSpotSources = [],
}: Props) {
  const [activeCategory, setActiveCategory] = useState<ChecklistCategory>('baseball')
  const [checklistSearch, setChecklistSearch] = useState('')
  const [availableChecklists, setAvailableChecklists] = useState<ChecklistOption[]>(checklists)
  const [availableSections, setAvailableSections] = useState<ChecklistSection[]>(sections)
  const [availableItems, setAvailableItems] = useState<ChecklistItem[]>(items)
  const [checklistPickerOpen, setChecklistPickerOpen] = useState(false)
  const [loadingChecklistId, setLoadingChecklistId] = useState<string | null>(null)
  const [checklistLoadMessage, setChecklistLoadMessage] = useState<string | null>(null)
  const [selectedChecklistId, setSelectedChecklistId] = useState(initialChecklistId ?? '')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<Set<string>>(new Set())
  const [selectedSpotIds, setSelectedSpotIds] = useState<Set<string>>(new Set())
  const [spots, setSpots] = useState<DraftSpot[]>(() =>
    existingSpotsToDraft(initialSpots, initialSpotSources)
  )
  const [draftReady, setDraftReady] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [manualSpotOpen, setManualSpotOpen] = useState(false)
  const [manualSpotName, setManualSpotName] = useState('')
  const [manualSpotPrice, setManualSpotPrice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<{ spotsSaved: number; sourcesSaved: number } | null>(null)
  const [pricingPreviewOpen, setPricingPreviewOpen] = useState(false)
  const [playerDemandOverrides, setPlayerDemandOverrides] = useState<PlayerDemandOverride[]>([])
  const [playerDemandLoading, setPlayerDemandLoading] = useState(false)
  const [playerDemandError, setPlayerDemandError] = useState<string | null>(null)
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoLoadedChecklistIdsRef = useRef<Set<string>>(new Set())
  const supabase = useMemo(() => createClient(), [])

  const normalizedFormat = normalize(breakFormat)
  const isPyp = normalizedFormat === 'pyp' || normalizedFormat === 'random player'
  const isPyt = normalizedFormat === 'pyt' || normalizedFormat === 'random team'
  const draftStorageKey = `hits:breaker-pricing:${breakId}`

  useEffect(() => {
    if (initialChecklistId) {
      const checklist = checklists.find((row) => row.id === initialChecklistId)
      if (checklist) setActiveCategory(checklistCategory(checklist))
    }
  }, [checklists, initialChecklistId])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) {
        setDraftReady(true)
        return
      }

      const parsed = JSON.parse(raw) as Partial<PricingDraft>
      if (parsed.version !== 1) {
        setDraftReady(true)
        return
      }

      if (
        parsed.activeCategory &&
        CHECKLIST_CATEGORIES.some((category) => category.id === parsed.activeCategory)
      ) {
        setActiveCategory(parsed.activeCategory)
      }

      if (!initialChecklistId && typeof parsed.selectedChecklistId === 'string') {
        setSelectedChecklistId(parsed.selectedChecklistId)
      }
      const localDraftMatchesDatabaseChecklist =
        !initialChecklistId || parsed.selectedChecklistId === initialChecklistId

      if (localDraftMatchesDatabaseChecklist && typeof parsed.selectedTeam === 'string') {
        setSelectedTeam(parsed.selectedTeam)
      }
      if (
        localDraftMatchesDatabaseChecklist &&
        typeof parsed.selectedSectionId === 'string'
      ) {
        setSelectedSectionId(parsed.selectedSectionId)
      }
      if (Array.isArray(parsed.spots) && initialSpots.length === 0) setSpots(parsed.spots)
      if (typeof parsed.savedAt === 'string') setDraftSavedAt(parsed.savedAt)
    } catch {
      // Bad local drafts must never block break configuration.
    } finally {
      setDraftReady(true)
    }
  }, [draftStorageKey, initialSpots.length])

  useEffect(() => {
    if (!draftReady) return

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)

    draftSaveTimerRef.current = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString()
        const draft: PricingDraft = {
          version: 1,
          selectedChecklistId,
          activeCategory,
          selectedTeam,
          selectedSectionId,
          spots,
          savedAt,
        }

        window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
        setDraftSavedAt(savedAt)
      } catch {
        // Autosave should never interrupt pricing.
      }
    }, 350)

    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    }
  }, [activeCategory, draftReady, draftStorageKey, selectedChecklistId, selectedSectionId, selectedTeam, spots])

  const checklistById = useMemo(
    () => new Map(availableChecklists.map((checklist) => [checklist.id, checklist])),
    [availableChecklists]
  )

  const sectionById = useMemo(
    () => new Map(availableSections.map((section) => [section.id, section])),
    [availableSections]
  )

  const filteredChecklistOptions = useMemo(() => {
    return availableChecklists
      .filter((checklist) => checklistCategory(checklist) === activeCategory)
      .filter((checklist) => matchesSearchTokens(checklist, checklistSearch))
      .sort((a, b) => {
        if (checklistSearch.trim()) {
          const scoreCompare = checklistSearchScore(b, checklistSearch) - checklistSearchScore(a, checklistSearch)
          if (scoreCompare !== 0) return scoreCompare
        }

        const yearCompare = compareNatural(clean(b.year), clean(a.year))
        if (yearCompare !== 0) return yearCompare
        return compareNatural(a.name, b.name)
      })
  }, [activeCategory, availableChecklists, checklistSearch])

  const selectedChecklist = useMemo(
    () => checklistById.get(selectedChecklistId),
    [checklistById, selectedChecklistId]
  )

  const selectedChecklistItems = useMemo(() => {
    if (!selectedChecklistId) return []
    return availableItems.filter((item) => item.checklist_id === selectedChecklistId)
  }, [availableItems, selectedChecklistId])

  const selectedDemandSport = useMemo(() => {
    const sport = clean(selectedChecklist?.sport).toLowerCase()
    return sport || 'baseball'
  }, [selectedChecklist?.sport])

  useEffect(() => {
    let cancelled = false

    async function loadPlayerDemand() {
      setPlayerDemandLoading(true)
      setPlayerDemandError(null)

      const { data, error } = await supabase
        .from('breaker_player_demand_resolved')
        .select('player_name, demand_multiplier, demand_tier, reason')
        .eq('sport', selectedDemandSport)
        .eq('is_active', true)
        .order('player_name', { ascending: true })

      if (cancelled) return

      if (error) {
        setPlayerDemandOverrides([])
        setPlayerDemandError(error.message)
        setPlayerDemandLoading(false)
        return
      }

      const rows = (data ?? []) as unknown as PlayerDemandRow[]

      setPlayerDemandOverrides(
        rows
          .map<PlayerDemandOverride | null>((row) => {
            const multiplier = Number(row.demand_multiplier)

            if (!row.player_name?.trim() || !Number.isFinite(multiplier) || multiplier <= 0) {
              return null
            }

            const tier = clean(row.demand_tier)
            const reason = clean(row.reason)

            return {
              playerName: row.player_name.trim(),
              multiplier,
              label: [tier ? tier.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '', reason].filter(Boolean).join(' — ') || undefined,
            }
          })
          .filter((row): row is PlayerDemandOverride => row !== null)
      )

      setPlayerDemandLoading(false)
    }

    void loadPlayerDemand()

    return () => {
      cancelled = true
    }
  }, [selectedDemandSport, supabase])

  const teamOptions = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of selectedChecklistItems) {
      const team = clean(item.printed_team) || 'Other / Unassigned'
      counts.set(team, (counts.get(team) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, letter: alphabetLetter(name) }))
      .sort((a, b) => compareNatural(a.name, b.name))
  }, [selectedChecklistItems])

  const playerMembers = useMemo(() => uniquePlayerMembers(selectedChecklistItems), [selectedChecklistItems])

  const selectedTeamItems = useMemo(() => {
    if (!selectedTeam) return []
    return selectedChecklistItems.filter(
      (item) => (clean(item.printed_team) || 'Other / Unassigned') === selectedTeam
    )
  }, [selectedChecklistItems, selectedTeam])

  const selectedTeamPlayerMembers = useMemo(
    () => (selectedTeam ? uniquePlayerMembers(selectedTeamItems) : []),
    [selectedTeam, selectedTeamItems]
  )

  const sectionOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; sortOrder: number }>()

    for (const item of selectedTeamItems) {
      const section = sectionById.get(item.section_id)
      const id = item.section_id || `other:${selectedChecklistId}`

      if (!map.has(id)) {
        map.set(id, {
          id,
          name: section?.name ?? 'Other',
          count: 0,
          sortOrder: Number(section?.sort_order ?? 999999),
        })
      }

      map.get(id)!.count += 1
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return compareNatural(a.name, b.name)
    })
  }, [sectionById, selectedChecklistId, selectedTeamItems])

  const alphabetLetters = useMemo(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), [])
  const availableTeamLetters = useMemo(
    () => new Set(teamOptions.map((team) => team.letter).filter((letter) => letter !== '#')),
    [teamOptions]
  )

  const checklistStats = useMemo(() => {
    const teams = new Set<string>()
    const players = new Set<string>()
    let autos = 0
    let relics = 0
    let rookies = 0
    let serials = 0

    for (const item of selectedChecklistItems) {
      if (clean(item.printed_team)) teams.add(normalize(item.printed_team))
      if (clean(item.player_name)) players.add(normalize(item.player_name))
      if (item.auto_flag) autos += 1
      if (item.relic_flag) relics += 1
      if (item.rookie_flag) rookies += 1
      if (item.serial_flag) serials += 1
    }

    return {
      cards: selectedChecklistItems.length,
      teams: teams.size,
      players: players.size,
      autos,
      relics,
      rookies,
      serials,
    }
  }, [selectedChecklistItems])

  const totalAskingPrice = useMemo(
    () =>
      spots.reduce((sum, spot) => {
        const value = Number(spot.askingPrice)
        return sum + (Number.isFinite(value) && value > 0 ? value : 0)
      }, 0),
    [spots]
  )

  const pricingCalculation = useMemo(() => {
    const pricingSpots: SpotPricingInput[] = spots.map((spot) => ({
      id: spot.id,
      spotName: spot.spotName,
      sources: spot.members
        .filter((member) => member.sourceType === 'team' || member.sourceType === 'player')
        .map((member) => ({
          sourceName: member.sourceName,
          sourceType: member.sourceType as 'team' | 'player',
          teamName: member.teamName,
          playerName: member.playerName,
        })),
    }))

    return calculateBreakPricing(
      pricingSpots,
      selectedChecklistItems as BreakPricingChecklistItem[],
      {
        mode: isPyp ? 'pyp' : 'pyt',
        targetRevenue,
        roundTo: 1,
        minimumSpotPrice: isPyp ? 9 : 1,
        defaultPlayerPrice: isPyp ? 9 : undefined,
        playerDemandOverrides,
      }
    )
  }, [isPyp, playerDemandOverrides, selectedChecklistItems, spots, targetRevenue])

  const pricingSuggestionBySpotId = useMemo(
    () =>
      new Map(
        pricingCalculation.suggestions.map((suggestion) => [
          suggestion.spotId,
          suggestion,
        ])
      ),
    [pricingCalculation.suggestions]
  )

  function getAdjustmentAmount(spot: DraftSpot) {
    const value = Number(spot.pricingAdjustmentAmount ?? '0')
    if (!Number.isFinite(value)) return 0
    return value
  }

  function getAdjustedSuggestedPrice(spot: DraftSpot) {
    const suggestion = pricingSuggestionBySpotId.get(spot.id)
    if (!suggestion) return 0

    const adjustmentAmount = getAdjustmentAmount(spot)
    return Math.max(0, suggestion.suggestedPrice + adjustmentAmount)
  }

  const adjustedCalculatedTotal = useMemo(
    () =>
      spots.reduce((sum, spot) => {
        return sum + getAdjustedSuggestedPrice(spot)
      }, 0),
    [pricingSuggestionBySpotId, spots]
  )

  const adjustedDifferenceFromTarget = adjustedCalculatedTotal - targetRevenue

  function calculateSuggestedPrices() {
    setPricingPreviewOpen(true)
    setMessage(
      `Calculated ${pricingCalculation.suggestions.length} suggested spot prices totaling ${money(
        pricingCalculation.calculatedTotal
      )} against the ${money(targetRevenue)} target. No prices changed yet.`
    )
  }

  function applySuggestedPrices() {
    setSpots((current) =>
      current.map((spot) => {
        const suggestion = pricingSuggestionBySpotId.get(spot.id)
        if (!suggestion) return spot

        return {
          ...spot,
          askingPrice: getAdjustedSuggestedPrice(spot).toFixed(2),
          pricingMethod: 'calculated',
        }
      })
    )

    setPricingPreviewOpen(true)
    setMessage(
      `Applied calculated prices, including any percentage adjustments, to ${pricingCalculation.suggestions.length} spots. Save Break Configuration when you are ready to store them.`
    )
  }

  const selectedMembers = useMemo(() => {
    const source = isPyp
      ? playerMembers
      : teamOptions.map<DraftSpotMember>((team) => ({
          key: `team::${normalize(team.name)}`,
          sourceType: 'team',
          sourceName: team.name,
          teamName: team.name,
          playerName: null,
        }))

    return source.filter((member) => selectedSourceKeys.has(member.key))
  }, [isPyp, playerMembers, selectedSourceKeys, teamOptions])


  const selectedSpots = useMemo(
    () => spots.filter((spot) => selectedSpotIds.has(spot.id)),
    [selectedSpotIds, spots]
  )

  const combineSelectionCount =
    selectedSpots.length >= 2 ? selectedSpots.length : selectedMembers.length

  const loadChecklist = useCallback(async (checklistId: string) => {
    const response = await fetch(`/api/checklists/${encodeURIComponent(checklistId)}/entry-data`, {
      cache: 'no-store',
    })

    const json = (await response.json()) as {
      ok?: boolean
      checklist?: ChecklistOption
      sections?: ChecklistSection[]
      items?: ChecklistItem[]
      error?: string
    }

    if (!response.ok || !json.ok || !json.checklist) {
      throw new Error(json.error || 'The selected checklist could not be loaded.')
    }

    setAvailableChecklists((current) => [
      ...current.filter((checklist) => checklist.id !== checklistId),
      json.checklist as ChecklistOption,
    ])

    setAvailableSections((current) => [
      ...current.filter((section) => section.checklist_id !== checklistId),
      ...(json.sections ?? []),
    ])

    setAvailableItems((current) => [
      ...current.filter((item) => item.checklist_id !== checklistId),
      ...(json.items ?? []),
    ])

    return json.checklist
  }, [])

  useEffect(() => {
    if (!selectedChecklistId) return

    const alreadyHasItems = availableItems.some(
      (item) => item.checklist_id === selectedChecklistId
    )

    if (alreadyHasItems) return
    if (autoLoadedChecklistIdsRef.current.has(selectedChecklistId)) return

    autoLoadedChecklistIdsRef.current.add(selectedChecklistId)

    void loadChecklist(selectedChecklistId).catch((error) => {
      autoLoadedChecklistIdsRef.current.delete(selectedChecklistId)
      setChecklistLoadMessage(
        error instanceof Error
          ? error.message
          : 'The saved checklist could not be loaded.'
      )
    })
  }, [availableItems, loadChecklist, selectedChecklistId])

  async function selectChecklist(checklistId: string) {
    setChecklistLoadMessage(null)
    setLoadingChecklistId(checklistId)

    try {
      const checklist = await loadChecklist(checklistId)
      setSelectedChecklistId(checklistId)
      setSelectedTeam('')
      setSelectedSectionId('')
      setSelectedSourceKeys(new Set())
      setChecklistSearch('')
      setActiveCategory(checklistCategory(checklist))
      setChecklistPickerOpen(false)
    } catch (error) {
      setChecklistLoadMessage(error instanceof Error ? error.message : 'The selected checklist could not be loaded.')
    } finally {
      setLoadingChecklistId(null)
    }
  }

  function toggleSource(key: string) {
    setSelectedSourceKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function addSpotFromMember(member: DraftSpotMember) {
    const exists = spots.some(
      (spot) =>
        spot.members.length === 1 &&
        spot.members[0]?.key === member.key &&
        spot.spotSource === 'checklist'
    )

    if (exists) {
      setMessage(`${member.sourceName} already has a spot.`)
      return
    }

    setSpots((current) => [
      ...current,
      {
        id: makeId(),
        spotName: member.sourceName,
        askingPrice: '',
        pricingMethod: 'manual',
        groupingType: member.sourceType === 'team' ? 'team' : 'player',
        spotSource: 'checklist',
        members: [member],
        notes: '',
      },
    ])

    setMessage(`${member.sourceName} added to break pricing.`)
  }

  function generateDefaultSpots() {
    if (!selectedChecklistId) return

    const members: DraftSpotMember[] = isPyp
      ? playerMembers
      : teamOptions.map((team) => ({
          key: `team::${normalize(team.name)}`,
          sourceType: 'team' as const,
          sourceName: team.name,
          teamName: team.name,
          playerName: null,
        }))

    const existingKeys = new Set(
      spots
        .filter((spot) => spot.members.length === 1)
        .map((spot) => spot.members[0]?.key)
        .filter(Boolean)
    )

    const additions = members
      .filter((member) => !existingKeys.has(member.key))
      .map<DraftSpot>((member) => ({
        id: makeId(),
        spotName: member.sourceName,
        askingPrice: '',
        pricingMethod: 'manual',
        groupingType: member.sourceType === 'team' ? 'team' : 'player',
        spotSource: 'checklist',
        members: [member],
        notes: '',
      }))

    if (additions.length === 0) {
      setMessage('All checklist spots are already in the pricing list.')
      return
    }

    setSpots((current) => [...current, ...additions])
    setMessage(`Added ${additions.length} ${isPyp ? 'player' : 'team'} spot${additions.length === 1 ? '' : 's'}.`)
  }

  function toggleSpotSelection(spotId: string) {
    setSelectedSpotIds((current) => {
      const next = new Set(current)
      if (next.has(spotId)) next.delete(spotId)
      else next.add(spotId)
      return next
    })
  }

  function handlePriceNavigation(
    event: React.KeyboardEvent<HTMLInputElement>,
    spotId: string
  ) {
    if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return

    event.preventDefault()

    const currentIndex = spots.findIndex((spot) => spot.id === spotId)
    if (currentIndex < 0) return

    const direction = event.key === 'ArrowUp' ? -1 : 1
    const target = spots[currentIndex + direction]
    if (!target) return

    const input = document.querySelector<HTMLInputElement>(
      `[data-break-price-id="${target.id}"]`
    )

    input?.focus()
    input?.select()
  }

  function combineSelected() {
    if (selectedSpots.length >= 2) {
      const sources = new Set(selectedSpots.map((spot) => spot.spotSource))
      if (sources.size > 1) {
        setMessage('Combine checklist spots together or manual spots together, not a mix of both.')
        return
      }

      const defaultName = selectedSpots.map((spot) => spot.spotName).join(' / ')
      const combinedName = window.prompt('Combined spot name:', defaultName)?.trim()
      if (!combinedName) return

      const memberMap = new Map<string, DraftSpotMember>()
      for (const spot of selectedSpots) {
        for (const member of spot.members) memberMap.set(member.key, member)
      }

      const combinedMembers = Array.from(memberMap.values())
      const priceValues = selectedSpots
        .map((spot) => Number(spot.askingPrice))
        .filter((value) => Number.isFinite(value) && value >= 0)
      const combinedPrice =
        priceValues.length > 0
          ? priceValues.reduce((sum, value) => sum + value, 0).toFixed(2)
          : ''
      const selectedIds = new Set(selectedSpots.map((spot) => spot.id))
      const source = selectedSpots[0]?.spotSource ?? 'checklist'

      setSpots((current) => [
        ...current.filter((spot) => !selectedIds.has(spot.id)),
        {
          id: makeId(),
          spotName: combinedName,
          askingPrice: combinedPrice,
          pricingMethod: 'manual',
          groupingType: source === 'checklist' ? 'combined' : 'custom',
          spotSource: source,
          members: combinedMembers,
          notes: '',
        },
      ])

      setSelectedSpotIds(new Set())
      setMessage(`Combined ${selectedSpots.length} spots into ${combinedName}.`)
      return
    }

    if (selectedMembers.length < 2) {
      setMessage('Select at least two spots, teams, or players to combine.')
      return
    }

    const defaultName = selectedMembers.map((member) => member.sourceName).join(' / ')
    const combinedName = window.prompt('Combined spot name:', defaultName)?.trim()
    if (!combinedName) return

    const selectedKeys = new Set(selectedMembers.map((member) => member.key))

    setSpots((current) => {
      const remaining = current.filter(
        (spot) =>
          !(
            spot.members.length === 1 &&
            spot.members[0] &&
            selectedKeys.has(spot.members[0].key)
          )
      )

      return [
        ...remaining,
        {
          id: makeId(),
          spotName: combinedName,
          askingPrice: '',
          pricingMethod: 'manual',
          groupingType: 'combined',
          spotSource: 'checklist',
          members: selectedMembers,
          notes: '',
        },
      ]
    })

    setSelectedSourceKeys(new Set())
    setMessage(`Combined ${selectedMembers.length} ${isPyp ? 'players' : 'teams'} into ${combinedName}.`)
  }

  function addManualSpot() {
    const name = manualSpotName.trim()
    if (!name) {
      setMessage('Enter a name for the manual spot.')
      return
    }

    setSpots((current) => [
      ...current,
      {
        id: makeId(),
        spotName: name,
        askingPrice: manualSpotPrice,
        pricingMethod: 'manual',
        groupingType: 'custom',
        spotSource: 'manual',
        members: [
          {
            key: `manual::${makeId()}`,
            sourceType: 'manual',
            sourceName: name,
            teamName: null,
            playerName: null,
          },
        ],
        notes: '',
      },
    ])

    setManualSpotName('')
    setManualSpotPrice('')
    setManualSpotOpen(false)
    setMessage(`${name} added as a manual spot.`)
  }

  function updateSpot(
    spotId: string,
    patch: Partial<
      Pick<
        DraftSpot,
        'spotName' | 'askingPrice' | 'pricingAdjustmentAmount' | 'notes' | 'pricingMethod'
      >
    >
  ) {
    setSpots((current) => current.map((spot) => (spot.id === spotId ? { ...spot, ...patch } : spot)))
  }

  async function saveBreakConfiguration() {
    if (isSaving) return

    setSaveError(null)
    setMessage(null)

    const invalidSpot = spots.find((spot) => !spot.spotName.trim())
    if (invalidSpot) {
      setSaveError('Every break spot needs a name before saving.')
      return
    }

    const invalidPrice = spots.find((spot) => {
      if (!spot.askingPrice.trim()) return false
      const value = Number(spot.askingPrice)
      return !Number.isFinite(value) || value < 0
    })

    if (invalidPrice) {
      setSaveError(`Enter a valid nonnegative price for ${invalidPrice.spotName || 'each spot'}.`)
      return
    }

    setIsSaving(true)

    try {
      const payload = spots.map((spot) => ({
        id: spot.id,
        spotName: spot.spotName.trim(),
        askingPrice: spot.askingPrice.trim() || null,
        pricingMethod: spot.pricingMethod,
        groupingType: spot.groupingType,
        spotSource: spot.spotSource,
        notes: spot.notes.trim() || null,
        members: spot.members.map((member) => ({
          sourceType: member.sourceType,
          sourceName: member.sourceName,
          teamName: member.teamName,
          playerName: member.playerName,
        })),
      }))

      const { data, error } = await supabase.rpc('save_breaker_break_configuration', {
        p_break_id: breakId,
        p_checklist_id: selectedChecklistId || null,
        p_spots: payload,
      })

      if (error) throw error

      const result = (data ?? {}) as {
        ok?: boolean
        spots_saved?: number
        sources_saved?: number
      }

      if (result.ok === false) {
        throw new Error('The break configuration could not be saved.')
      }

      const savedAt = new Date().toISOString()
      try {
        window.localStorage.removeItem(draftStorageKey)
      } catch {
        // Local draft cleanup is convenience only.
      }
      setDraftSavedAt(savedAt)
      setSaveSuccess({
        spotsSaved: Number(result.spots_saved ?? spots.length),
        sourcesSaved: Number(
          result.sources_saved ?? spots.reduce((sum, spot) => sum + spot.members.length, 0)
        ),
      })
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'The break configuration could not be saved.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="app-section p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-zinc-100">Checklist Pricing Workspace</div>
              <p className="mt-1 max-w-3xl text-sm text-zinc-500">
                Use the full checklist to build {isPyp ? 'player' : isPyt ? 'team' : ''} spots,
                combine them, and set asking prices. Checklist pricing never changes the actual sealed inventory cost basis.
              </p>
            </div>

            <div className="shrink-0 text-right text-sm text-zinc-400">
              <div>
                Format: <span className="font-semibold uppercase text-cyan-200">{breakFormat}</span>
              </div>
              <div className="mt-1">
                Draft spots: <span className="font-semibold text-zinc-100">{spots.length}</span>
                {' · '}Asking total:{' '}
                <span className="font-semibold text-emerald-300">{money(totalAskingPrice)}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {draftSavedAt ? 'Workspace autosaved locally' : 'Autosave ready'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {CHECKLIST_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setActiveCategory(category.id)
                  setChecklistSearch('')
                  setChecklistPickerOpen(true)
                }}
                className={activeCategory === category.id ? 'app-button-primary' : 'app-button'}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setChecklistPickerOpen((open) => !open)}
              className="app-input flex w-full items-center justify-between gap-3 text-left"
            >
              <span className={selectedChecklist ? 'truncate text-zinc-100' : 'truncate text-zinc-500'}>
                {selectedChecklist?.name ?? 'Search / select checklist...'}
              </span>
              <span className="shrink-0 text-zinc-500">{checklistPickerOpen ? '▲' : '▼'}</span>
            </button>

            {checklistPickerOpen && (
              <div className="absolute left-0 right-0 z-50 mt-2 flex max-h-[min(48vh,440px)] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
                <div className="border-b border-zinc-800 p-3">
                  <input
                    type="search"
                    value={checklistSearch}
                    onChange={(event) => setChecklistSearch(event.target.value)}
                    placeholder="Try: 2026 chrome, 2025 cosmic, bowman draft..."
                    autoFocus
                    className="app-input w-full"
                  />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {filteredChecklistOptions.slice(0, 25).map((checklist) => {
                    const meta = [
                      clean(checklist.year),
                      clean(checklist.manufacturer),
                      clean(checklist.brand),
                      clean(checklist.product_name),
                    ]
                      .filter(Boolean)
                      .join(' • ')

                    return (
                      <button
                        key={checklist.id}
                        type="button"
                        onClick={() => void selectChecklist(checklist.id)}
                        disabled={loadingChecklistId !== null}
                        className="flex w-full items-start border-b border-zinc-800 px-3 py-3 text-left last:border-b-0 hover:bg-zinc-900/70 disabled:cursor-wait disabled:opacity-60"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-zinc-100">
                            {checklist.name}
                            {loadingChecklistId === checklist.id ? (
                              <span className="ml-2 text-xs font-normal text-cyan-300">Loading...</span>
                            ) : null}
                          </div>
                          {meta ? <div className="mt-0.5 text-xs text-zinc-500">{meta}</div> : null}
                        </div>
                      </button>
                    )
                  })}

                  {filteredChecklistOptions.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-zinc-500">
                      No checklist matches those search words. Manual spots will still be available.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {checklistLoadMessage ? (
            <div className="rounded-xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-200">
              {checklistLoadMessage}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
              {message}
            </div>
          ) : null}
        </div>
      </section>

      {selectedChecklistId ? (
        <>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            {[
              ['Cards', checklistStats.cards],
              ['Teams', checklistStats.teams],
              ['Players', checklistStats.players],
              ['Autos', checklistStats.autos],
              ['Relics', checklistStats.relics],
              ['Rookies', checklistStats.rookies],
              ['Serial', checklistStats.serials],
            ].map(([label, value]) => (
              <div key={String(label)} className="app-section p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
                <div className="mt-1 text-xl font-semibold text-zinc-100">{value}</div>
              </div>
            ))}
          </section>

          <section className="app-section p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-zinc-100">{isPyp ? 'PYP Player Spots' : 'PYT Team Spots'}</div>
                <div className="mt-1 text-sm text-zinc-500">
                  Generate all default spots, check rows to combine them, then enter prices. In the Price column, ↑/↓ or Enter moves to the next price row; Tab still works normally.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={generateDefaultSpots} className="app-button">
                  Generate {isPyp ? 'Players' : 'Teams'}
                </button>
                <button
                  type="button"
                  onClick={combineSelected}
                  disabled={combineSelectionCount < 2}
                  className="app-button"
                >
                  Combine Selected ({combineSelectionCount})
                </button>
                <button type="button" onClick={() => setManualSpotOpen((open) => !open)} className="app-button">
                  Add Manual Spot
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-cyan-900/50 bg-cyan-950/10 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="font-semibold text-zinc-100">HITS Suggested Pricing</div>
                  <div className="mt-1 text-sm text-zinc-500">
                    Checklist composition and player-demand weighting distribute the break&apos;s target revenue across the current selling spots. This is planning only and never changes sealed inventory cost basis.
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    {playerDemandLoading ? (
                      <span>Loading player demand profiles…</span>
                    ) : playerDemandError ? (
                      <span className="text-amber-300">
                        Player demand could not load: {playerDemandError}. Neutral 1.0× demand will be used.
                      </span>
                    ) : (
                      <span>
                        {playerDemandOverrides.length} active {selectedDemandSport} demand profile
                        {playerDemandOverrides.length === 1 ? '' : 's'} loaded.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={calculateSuggestedPrices}
                    disabled={spots.length === 0 || selectedChecklistItems.length === 0}
                    className="app-button"
                  >
                    Calculate Suggested Prices
                  </button>
                  <button
                    type="button"
                    onClick={applySuggestedPrices}
                    disabled={spots.length === 0 || selectedChecklistItems.length === 0}
                    className="app-button-primary"
                  >
                    Apply Suggested Prices
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Target Revenue</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-300">{money(targetRevenue)}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Current Asking</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-100">{money(totalAskingPrice)}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Calculated Total</div>
                  <div className="mt-1 text-xl font-semibold text-cyan-200">{money(pricingCalculation.calculatedTotal)}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Calculated vs Target</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-100">
                    {pricingCalculation.differenceFromTarget >= 0 ? '+' : ''}
                    {money(pricingCalculation.differenceFromTarget)}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Adjusted Total</div>
                  <div className="mt-1 text-xl font-semibold text-amber-200">{money(adjustedCalculatedTotal)}</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Adjusted vs Target</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-100">
                    {adjustedDifferenceFromTarget >= 0 ? '+' : ''}
                    {money(adjustedDifferenceFromTarget)}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-zinc-800 bg-black/20 px-3 py-2 text-xs text-zinc-400">
                Use Adjustment $ to bump or reduce individual spots after HITS calculates them.
                Positive amounts raise the suggested price; negative amounts lower it. The Adjusted Total
                shows whether the changes still land on your target revenue.
              </div>

              {pricingPreviewOpen ? (
                <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-zinc-800">
                  <table className="w-full min-w-240 text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-2.5">Spot</th>
                        <th className="px-3 py-2.5 text-right">Calculated</th>
                        <th className="px-3 py-2.5 text-right">Adjustment $</th>
                        <th className="px-3 py-2.5 text-right">Final</th>
                        <th className="px-3 py-2.5 text-right">Score</th>
                        <th className="px-3 py-2.5">Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingCalculation.suggestions.map((suggestion) => {
                        const spot = spots.find((candidate) => candidate.id === suggestion.spotId)
                        const adjustmentAmount = spot ? getAdjustmentAmount(spot) : 0
                        const adjustedPrice = spot
                          ? getAdjustedSuggestedPrice(spot)
                          : suggestion.suggestedPrice

                        return (
                          <tr key={suggestion.spotId} className="border-t border-zinc-900">
                            <td className="px-3 py-2.5 font-medium text-zinc-100">{suggestion.spotName}</td>
                            <td className="px-3 py-2.5 text-right text-zinc-300">
                              {money(suggestion.suggestedPrice)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="ml-auto flex w-28 items-center gap-1">
                                <span className="text-zinc-500">$</span>
                                <input
                                  type="number"
                                  step={1}
                                  value={spot?.pricingAdjustmentAmount ?? ''}
                                  onChange={(event) => {
                                    if (!spot) return
                                    updateSpot(spot.id, {
                                      pricingAdjustmentAmount: event.target.value,
                                    })
                                  }}
                                  onFocus={(event) => event.currentTarget.select()}
                                  className="app-input w-20 text-right"
                                  placeholder="0"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-300">
                              {money(adjustedPrice)}
                              {adjustmentAmount !== 0 ? (
                                <div className="text-[11px] font-normal text-zinc-500">
                                  {adjustmentAmount > 0 ? '+' : '-'}
                                  {money(Math.abs(adjustmentAmount))}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-right text-zinc-300">
                              {suggestion.score.toFixed(1)}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-zinc-500">
                              {describeSpotPricing(suggestion)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            {manualSpotOpen ? (
              <div className="mt-4 grid gap-3 rounded-xl border border-zinc-800 bg-black/20 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                <input
                  value={manualSpotName}
                  onChange={(event) => setManualSpotName(event.target.value)}
                  className="app-input"
                  placeholder="Manual spot name"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={manualSpotPrice}
                  onChange={(event) => setManualSpotPrice(event.target.value)}
                  className="app-input"
                  placeholder="Price"
                />
                <button type="button" onClick={addManualSpot} className="app-button-primary">Add Spot</button>
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-240 text-left text-sm">
                <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="w-12 px-3 py-2.5 text-center">Combine</th>
                    <th className="px-3 py-2.5">Spot</th>
                    <th className="px-3 py-2.5">Source</th>
                    <th className="px-3 py-2.5">Members</th>
                    <th className="px-3 py-2.5">Price</th>
                    <th className="px-3 py-2.5">Pricing</th>
                    <th className="px-3 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {spots.map((spot) => {
                    const selectedForCombine = selectedSpotIds.has(spot.id)

                    return (
                    <tr key={spot.id} className={selectedForCombine ? 'bg-cyan-950/15' : undefined}>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedForCombine}
                          onChange={() => toggleSpotSelection(spot.id)}
                          aria-label={`Select ${spot.spotName} for combining`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          value={spot.spotName}
                          onChange={(event) => updateSpot(spot.id, { spotName: event.target.value })}
                          className="app-input min-w-56"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400">{spot.spotSource === 'checklist' ? 'Checklist' : 'Manual'}</td>
                      <td className="px-3 py-2.5 text-zinc-400">
                        <div className="max-w-96">{spot.members.map((member) => member.sourceName).join(' • ') || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={spot.askingPrice}
                          onChange={(event) => updateSpot(spot.id, { askingPrice: event.target.value })}
                          onKeyDown={(event) => handlePriceNavigation(event, spot.id)}
                          onFocus={(event) => event.currentTarget.select()}
                          data-break-price-id={spot.id}
                          className="app-input w-28"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={spot.pricingMethod}
                          onChange={(event) =>
                            updateSpot(spot.id, {
                              pricingMethod: event.target.value as DraftSpot['pricingMethod'],
                            })
                          }
                          className="app-select w-32"
                        >
                          <option value="manual">Manual</option>
                          <option value="tier">Tier</option>
                          <option value="rule">Rule</option>
                          <option value="imported">Imported</option>
                          <option value="calculated">Calculated</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          value={spot.notes}
                          onChange={(event) => updateSpot(spot.id, { notes: event.target.value })}
                          className="app-input min-w-48"
                          placeholder="Optional"
                        />
                      </td>
                    </tr>
                    )
                  })}
                  {spots.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        No pricing spots yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section
            id="breaker-checklist-browser"
            className="app-section overflow-hidden xl:sticky xl:top-52 xl:z-20 xl:flex xl:h-[calc(100vh-231px)] xl:min-h-0 xl:flex-col"
          >
            <div className="grid min-h-135 xl:h-0 xl:min-h-0 xl:flex-1 xl:grid-cols-[300px_minmax(0,1fr)] xl:overflow-hidden">
              <aside className="border-b border-zinc-800 bg-zinc-950/30 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden xl:border-b-0 xl:border-r">
                <div className="border-b border-zinc-800 px-4 py-3">
                  <div className="font-semibold text-zinc-100">{selectedChecklist?.name ?? 'Checklist'}</div>
                  <div className="mt-1 text-xs text-zinc-500">Browse every team and card in the product.</div>
                </div>

                <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 p-2 xl:h-0 xl:min-h-0 xl:flex-1">
                  <ChecklistAlphabetRail
                    ariaLabel="Team alphabet"
                    letters={alphabetLetters}
                    availableLetters={Array.from(availableTeamLetters)}
                    listId={`breaker-team-list-${breakId}`}
                    targetPrefix={`breaker-team-letter-${breakId}-`}
                  />

                  <div
                    id={`breaker-team-list-${breakId}`}
                    className="max-h-155 overflow-y-auto overscroll-contain pr-1 scroll-smooth xl:h-full xl:max-h-none xl:min-h-0 xl:flex-1"
                  >
                    {teamOptions.map((team, index) => {
                      const active = team.name === selectedTeam
                      const sourceKey = `team::${normalize(team.name)}`
                      const selected = selectedSourceKeys.has(sourceKey)
                      const firstInLetter = index === 0 || teamOptions[index - 1]?.letter !== team.letter

                      return (
                        <div
                          key={team.name}
                          id={
                            firstInLetter && team.letter !== '#'
                              ? `breaker-team-letter-${breakId}-${team.letter.toLowerCase()}`
                              : undefined
                          }
                          className={[
                            'mb-1 flex items-center gap-2 rounded-lg border px-2 py-1.5',
                            active
                              ? 'border-cyan-700 bg-zinc-800/80'
                              : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/60',
                          ].join(' ')}
                        >
                          {!isPyp ? (
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSource(sourceKey)}
                              className="h-4 w-4 shrink-0"
                              aria-label={`Select ${team.name} for combining`}
                            />
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTeam(team.name)
                              setSelectedSectionId('')
                            }}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 px-1 py-1 text-left"
                          >
                            <span className="truncate text-zinc-100">{team.name}</span>
                            <span className="shrink-0 text-xs text-zinc-500">{team.count}</span>
                          </button>

                          {!isPyp ? (
                            <button
                              type="button"
                              onClick={() =>
                                addSpotFromMember({
                                  key: sourceKey,
                                  sourceType: 'team',
                                  sourceName: team.name,
                                  teamName: team.name,
                                  playerName: null,
                                })
                              }
                              className="app-button px-2 py-1 text-xs"
                              title={`Add ${team.name} as a spot`}
                            >
                              +
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </aside>

              <div className="min-w-0 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
                {!selectedTeam ? (
                  <div className="flex min-h-135 items-center justify-center p-8 text-center">
                    <div>
                      <div className="text-lg font-semibold text-zinc-200">Choose a team</div>
                      <p className="mt-2 text-sm text-zinc-500">Select a team on the left to inspect the complete checklist.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-zinc-800 px-4 py-4">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-zinc-100">{selectedTeam}</div>
                          <div className="mt-1 text-sm text-zinc-500">
                            {isPyp
                              ? 'Select players to combine into PYP bundles, then inspect their checklist cards below.'
                              : 'Inspect card count, autos, inserts, parallels and other checklist details before pricing the team.'}
                          </div>
                        </div>
                        <div className="text-xs text-zinc-500">
                          {selectedTeamItems.length} checklist card{selectedTeamItems.length === 1 ? '' : 's'}
                        </div>
                      </div>

                      {isPyp ? (
                        <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-zinc-200">Players on {selectedTeam}</div>
                            <div className="text-xs text-zinc-500">{selectedTeamPlayerMembers.length} players</div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {selectedTeamPlayerMembers.map((member) => {
                              const selected = selectedSourceKeys.has(member.key)
                              return (
                                <div
                                  key={member.key}
                                  className={[
                                    'flex items-center gap-2 rounded-lg border px-3 py-2',
                                    selected
                                      ? 'border-cyan-700 bg-cyan-950/20'
                                      : 'border-zinc-800 bg-zinc-950/30',
                                  ].join(' ')}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleSource(member.key)}
                                    className="h-4 w-4 shrink-0"
                                  />
                                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{member.sourceName}</span>
                                  <button type="button" onClick={() => addSpotFromMember(member)} className="app-button px-2 py-1 text-xs">+</button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="p-4">
                      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {sectionOptions.map((section) => {
                          const active = section.id === selectedSectionId
                          const sectionItems = selectedTeamItems
                            .filter((item) => (item.section_id || `other:${selectedChecklistId}`) === section.id)
                            .sort((a, b) => {
                              const aSort = Number(a.sort_order ?? 999999)
                              const bSort = Number(b.sort_order ?? 999999)
                              if (aSort !== bSort) return aSort - bSort
                              return compareNatural(clean(a.card_number), clean(b.card_number))
                            })

                          return (
                            <div
                              key={section.id}
                              className={[
                                'overflow-hidden rounded-xl border',
                                active
                                  ? 'border-cyan-700 bg-zinc-950/70 md:col-span-2 2xl:col-span-3'
                                  : 'border-zinc-800 bg-zinc-950/30',
                              ].join(' ')}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedSectionId((current) => (current === section.id ? '' : section.id))}
                                className={[
                                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
                                  active ? 'bg-zinc-800/80' : 'hover:bg-zinc-900/60',
                                ].join(' ')}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-500">{active ? '▼' : '▶'}</span>
                                    <span className={active ? 'truncate font-semibold text-cyan-200' : 'truncate font-semibold text-zinc-100'}>
                                      {section.name}
                                    </span>
                                  </div>
                                  <div className="mt-1 pl-5 text-xs text-zinc-500">{section.count} cards</div>
                                </div>
                              </button>

                              {active ? (
                                <div className="overflow-x-auto border-t border-zinc-800 bg-black/20">
                                  <table className="w-full min-w-170 text-left text-sm">
                                    <thead className="sticky top-0 z-20 bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500 shadow-[0_1px_0_rgba(63,63,70,1)]">
                                      <tr>
                                        <th className="px-3 py-2.5">Card #</th>
                                        <th className="px-3 py-2.5">Player</th>
                                        <th className="px-3 py-2.5">Team</th>
                                        <th className="px-3 py-2.5">Details</th>
                                        <th className="px-3 py-2.5">Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                      {sectionItems.map((item) => {
                                        const details = [
                                          clean(item.parallel_name),
                                          clean(item.variation),
                                          item.rookie_flag ? 'RC' : '',
                                          item.auto_flag ? 'Auto' : '',
                                          item.relic_flag ? 'Relic' : '',
                                          item.serial_flag ? 'Serial' : '',
                                          item.print_run ? `/${item.print_run}` : '',
                                        ].filter(Boolean)

                                        return (
                                          <Fragment key={item.id}>
                                            <tr>
                                              <td className="px-3 py-2.5 font-semibold text-cyan-200">{item.card_number || '—'}</td>
                                              <td className="px-3 py-2.5 font-medium text-zinc-100">{item.player_name || '—'}</td>
                                              <td className="px-3 py-2.5 text-zinc-400">{item.printed_team || '—'}</td>
                                              <td className="px-3 py-2.5 text-zinc-400">{details.length > 0 ? details.join(' • ') : '—'}</td>
                                              <td className="px-3 py-2.5 text-zinc-500">{item.notes || '—'}</td>
                                            </tr>
                                          </Fragment>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="app-section p-8 text-center">
          <div className="text-lg font-semibold text-zinc-200">Choose a checklist to begin</div>
          <p className="mt-2 text-sm text-zinc-500">
            The checklist will drive the default PYT/PYP spot list while manual spots remain available for exceptions.
          </p>
        </section>
      )}

      {saveError ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {saveError}
        </div>
      ) : null}

      <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div className="text-sm text-zinc-400">
          Spots: <span className="font-semibold text-zinc-100">{spots.length}</span>
          {' · '}Asking Total:{' '}
          <span className="font-semibold text-emerald-300">{money(totalAskingPrice)}</span>
          {' · '}
          <span className="text-xs text-zinc-500">
            {draftSavedAt ? 'Draft protected locally until saved.' : 'Ready to save.'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void saveBreakConfiguration()}
          disabled={isSaving}
          className="app-button-primary disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
              Saving...
            </span>
          ) : (
            'Save Break Configuration'
          )}
        </button>
      </div>

      {isSaving ? (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/55 backdrop-blur-[1px]">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 px-6 py-5 shadow-2xl">
            <div className="flex items-center gap-3 text-zinc-100">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-r-transparent" />
              <span className="font-semibold">Saving break configuration...</span>
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              Keeping the checklist, spots, prices, and source mappings together.
            </div>
          </div>
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-800/70 bg-zinc-950 p-6 shadow-2xl">
            <div className="text-lg font-semibold text-emerald-300">
              Break configuration saved
            </div>
            <p className="mt-2 text-sm text-zinc-300">
              Saved {saveSuccess.spotsSaved} spot{saveSuccess.spotsSaved === 1 ? '' : 's'} and{' '}
              {saveSuccess.sourcesSaved} checklist/source mapping
              {saveSuccess.sourcesSaved === 1 ? '' : 's'}.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              This only saves the break setup. Sealed inventory has not been consumed and revenue has not been recognized.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSaveSuccess(null)}
                className="app-button-primary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
