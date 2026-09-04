'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  addBreakChecklistCardsAction,
  getBreakChecklistEntryProgressAction,
  updateBreakCardsReceivedFromChecklistAction,
} from '@/app/actions/breaks'

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

type Props = {
  breakId: string
  cardsReceived: number
  checklists: ChecklistOption[]
  sections: ChecklistSection[]
  items: ChecklistItem[]
}

type EntryState = Record<string, { quantity: string; notes: string; status: string }>

type ParallelEntry = {
  id: string
  quantity: string
  notes: string
  status: string
}

type ParallelEntryState = Record<string, ParallelEntry[]>

type ChecklistEntryDraft = {
  version: 2
  activeCategory: ChecklistCategory
  selectedChecklistId: string
  selectedTeam: string
  selectedSectionId: string
  entries: EntryState
  parallelEntries: ParallelEntryState
  savedAt: string
}

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

type ChecklistCategory =
  | 'baseball'
  | 'basketball'
  | 'football'
  | 'tcg_other'
  | 'other_sports'

const CHECKLIST_CATEGORIES: Array<{
  id: ChecklistCategory
  label: string
}> = [
  { id: 'baseball', label: 'Baseball' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'football', label: 'Football' },
  { id: 'other_sports', label: 'Other Sports' },
  { id: 'tcg_other', label: 'TCG / Other' },
]

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

  const haystack = checklistSearchText(checklist)
  return tokens.every((token) => haystack.includes(token))
}

function checklistCategory(checklist: ChecklistOption): ChecklistCategory {
  const sport = normalize(checklist.sport)
  const text = checklistSearchText(checklist)

  if (
    sport.includes('basketball') ||
    /\bbasketball\b/.test(text) ||
    /\bnba\b/.test(text)
  ) {
    return 'basketball'
  }

  if (
    sport.includes('football') ||
    /\bfootball\b/.test(text) ||
    /\bnfl\b/.test(text)
  ) {
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

function compareNatural(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function focusQuantityInput(
  sectionId: string,
  currentInput: HTMLInputElement,
  direction: -1 | 1
) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `[data-checklist-section="${sectionId}"][data-checklist-qty="true"]`
    )
  )

  const currentIndex = inputs.indexOf(currentInput)
  if (currentIndex < 0) return

  const next = inputs[currentIndex + direction]
  if (!next) return

  next.focus()
  next.select()
}

export default function ChecklistBreakEntry({
  breakId,
  cardsReceived,
  checklists,
  sections,
  items,
}: Props) {
  const [activeCategory, setActiveCategory] =
    useState<ChecklistCategory>('baseball')
  const [checklistSearch, setChecklistSearch] = useState('')
  const [availableChecklists, setAvailableChecklists] =
    useState<ChecklistOption[]>(checklists)
  const [availableSections, setAvailableSections] =
    useState<ChecklistSection[]>(sections)
  const [availableItems, setAvailableItems] = useState<ChecklistItem[]>(items)
  const [checklistImportMessage, setChecklistImportMessage] =
    useState<string | null>(null)
  const [checklistPickerOpen, setChecklistPickerOpen] = useState(false)
  const [selectedChecklistId, setSelectedChecklistId] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [entries, setEntries] = useState<EntryState>({})
  const [parallelEntries, setParallelEntries] =
    useState<ParallelEntryState>({})
  const [draftReady, setDraftReady] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [receivedCount, setReceivedCount] = useState(cardsReceived)
  const [receivedInput, setReceivedInput] = useState(String(cardsReceived))
  const [editingReceived, setEditingReceived] = useState(false)
  const [receivedMessage, setReceivedMessage] = useState<string | null>(null)
  const [isSavingReceived, startSavingReceived] = useTransition()
  const [savedByChecklistItem, setSavedByChecklistItem] = useState<Record<string, number>>({})
  const [alreadyEnteredCount, setAlreadyEnteredCount] = useState(0)
  const [progressReady, setProgressReady] = useState(false)
  const [manualDraftJson, setManualDraftJson] = useState('')
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const draftStorageKey = `hits:break-checklist-entry:${breakId}`

  useEffect(() => {
    try {
      setManualDraftJson(
        window.localStorage.getItem(`break_add_cards_draft_${breakId}`) ?? ''
      )
    } catch {
      setManualDraftJson('')
    }
  }, [breakId])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStorageKey)

      if (!raw) {
        setDraftReady(true)
        return
      }

      const parsed = JSON.parse(raw) as Omit<
        Partial<ChecklistEntryDraft>,
        'version'
      > & { version?: 1 | 2 }

      if (parsed.version !== 1 && parsed.version !== 2) {
        window.localStorage.removeItem(draftStorageKey)
        setDraftReady(true)
        return
      }

      if (
        parsed.activeCategory &&
        CHECKLIST_CATEGORIES.some(
          (category) => category.id === parsed.activeCategory
        )
      ) {
        setActiveCategory(parsed.activeCategory)
      }

      if (
        parsed.selectedChecklistId &&
        checklists.some(
          (checklist) => checklist.id === parsed.selectedChecklistId
        )
      ) {
        setSelectedChecklistId(parsed.selectedChecklistId)

        const restoredChecklistItems = items.filter(
          (item) => item.checklist_id === parsed.selectedChecklistId
        )

        if (
          parsed.selectedTeam &&
          restoredChecklistItems.some(
            (item) =>
              (clean(item.printed_team) || 'Other / Unassigned') ===
              parsed.selectedTeam
          )
        ) {
          setSelectedTeam(parsed.selectedTeam)

          if (
            parsed.selectedSectionId &&
            restoredChecklistItems.some(
              (item) =>
                (clean(item.printed_team) || 'Other / Unassigned') ===
                  parsed.selectedTeam &&
                (item.section_id ||
                  `other:${parsed.selectedChecklistId}`) ===
                  parsed.selectedSectionId
            )
          ) {
            setSelectedSectionId(parsed.selectedSectionId)
          }
        }
      }

      if (parsed.entries && typeof parsed.entries === 'object') {
        const validItemIds = new Set(items.map((item) => item.id))
        const restoredEntries: EntryState = {}

        for (const [itemId, entry] of Object.entries(parsed.entries)) {
          if (!validItemIds.has(itemId) || !entry || typeof entry !== 'object') {
            continue
          }

          const candidate = entry as {
            quantity?: unknown
            notes?: unknown
            status?: unknown
          }

          restoredEntries[itemId] = {
            quantity:
              typeof candidate.quantity === 'string'
                ? candidate.quantity
                : '',
            notes:
              typeof candidate.notes === 'string' ? candidate.notes : '',
            status:
              typeof candidate.status === 'string'
                ? candidate.status
                : 'available',
          }
        }

        setEntries(restoredEntries)
      }

      if (
        parsed.version === 2 &&
        parsed.parallelEntries &&
        typeof parsed.parallelEntries === 'object'
      ) {
        const validItemIds = new Set(items.map((item) => item.id))
        const restoredParallelEntries: ParallelEntryState = {}

        for (const [itemId, rows] of Object.entries(parsed.parallelEntries)) {
          if (!validItemIds.has(itemId) || !Array.isArray(rows)) continue

          restoredParallelEntries[itemId] = rows
            .filter((row) => row && typeof row === 'object')
            .map((row) => {
              const candidate = row as Partial<ParallelEntry>

              return {
                id:
                  typeof candidate.id === 'string' && candidate.id
                    ? candidate.id
                    : crypto.randomUUID(),
                quantity:
                  typeof candidate.quantity === 'string'
                    ? candidate.quantity
                    : '',
                notes:
                  typeof candidate.notes === 'string'
                    ? candidate.notes
                    : '',
                status:
                  typeof candidate.status === 'string'
                    ? candidate.status
                    : 'available',
              }
            })
        }

        setParallelEntries(restoredParallelEntries)
      }

      if (typeof parsed.savedAt === 'string') {
        setDraftSavedAt(parsed.savedAt)
      }
    } catch {
      try {
        window.localStorage.removeItem(draftStorageKey)
      } catch {
        // Ignore storage cleanup failures.
      }
    } finally {
      setDraftReady(true)
    }
  }, [draftStorageKey, checklists, items])

  useEffect(() => {
    if (!draftReady) return

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current)
    }

    draftSaveTimerRef.current = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString()
        const draft: ChecklistEntryDraft = {
          version: 2,
          activeCategory,
          selectedChecklistId,
          selectedTeam,
          selectedSectionId,
          entries,
          parallelEntries,
          savedAt,
        }

        window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
        setDraftSavedAt(savedAt)
      } catch {
        // Autosave should never interrupt checklist entry.
      }
    }, 350)

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
      }
    }
  }, [
    draftReady,
    draftStorageKey,
    activeCategory,
    selectedChecklistId,
    selectedTeam,
    selectedSectionId,
    entries,
    parallelEntries,
  ])

  useEffect(() => {
    let cancelled = false

    async function loadSavedProgress() {
      const result = await getBreakChecklistEntryProgressAction(breakId)

      if (cancelled) return

      if (!result.ok) {
        setProgressReady(true)
        return
      }

      setSavedByChecklistItem(result.savedByChecklistItem)
      setAlreadyEnteredCount(result.alreadyEntered)

      // Saved inventory can come from Checklist Entry or Manual Entry.
      // Only clear base checklist quantities whose exact checklist item is
      // already saved. Manual inventory must never erase an unsaved checklist
      // draft when the user switches between entry modes.
      if (result.alreadyEntered > 0) {
        setEntries((current) => {
          const next = { ...current }

          for (const checklistItemId of Object.keys(result.savedByChecklistItem)) {
            if (!next[checklistItemId]) continue
            next[checklistItemId] = {
              ...next[checklistItemId],
              quantity: '',
            }
          }

          return next
        })
      }

      setProgressReady(true)
    }

    void loadSavedProgress()

    return () => {
      cancelled = true
    }
  }, [breakId, draftStorageKey])

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
        const yearCompare = compareNatural(clean(b.year), clean(a.year))
        if (yearCompare !== 0) return yearCompare
        return compareNatural(a.name, b.name)
      })
  }, [availableChecklists, activeCategory, checklistSearch])

  const selectedChecklist = useMemo(
    () => checklistById.get(selectedChecklistId),
    [checklistById, selectedChecklistId]
  )

  const selectedChecklistItems = useMemo(() => {
    if (!selectedChecklistId) return []
    return availableItems.filter((item) => item.checklist_id === selectedChecklistId)
  }, [availableItems, selectedChecklistId])

  const teamOptions = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of selectedChecklistItems) {
      const team = clean(item.printed_team) || 'Other / Unassigned'
      counts.set(team, (counts.get(team) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => compareNatural(a.name, b.name))
  }, [selectedChecklistItems])

  const selectedTeamItems = useMemo(() => {
    if (!selectedTeam) return []

    return selectedChecklistItems.filter(
      (item) => (clean(item.printed_team) || 'Other / Unassigned') === selectedTeam
    )
  }, [selectedChecklistItems, selectedTeam])

  const sectionOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; count: number; sortOrder: number }
    >()

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
  }, [selectedTeamItems, sectionById, selectedChecklistId])

  const totalEnteredQuantity = useMemo(() => {
    const baseTotal = Object.values(entries).reduce(
      (sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)),
      0
    )

    const parallelTotal = Object.values(parallelEntries).reduce(
      (sum, rows) =>
        sum +
        rows.reduce(
          (rowSum, row) =>
            rowSum + Math.max(0, Number(row.quantity || 0)),
          0
        ),
      0
    )

    return baseTotal + parallelTotal
  }, [entries, parallelEntries])

  const totalAccountedFor = alreadyEnteredCount + totalEnteredQuantity
  const remainingCount = Math.max(0, receivedCount - totalAccountedFor)

  const submittedEntries = useMemo(() => {
    const rows: Array<{
      key: string
      item: ChecklistItem
      quantity: string
      notes: string
      status: string
      entryKind: 'base' | 'parallel'
    }> = []

    for (const item of items) {
      const base = entries[item.id]

      if (Math.max(0, Number(base?.quantity || 0)) > 0) {
        rows.push({
          key: `base:${item.id}`,
          item,
          quantity: base?.quantity ?? '',
          notes: base?.notes ?? '',
          status: base?.status ?? 'available',
          entryKind: 'base',
        })
      }

      for (const parallel of parallelEntries[item.id] ?? []) {
        if (Math.max(0, Number(parallel.quantity || 0)) <= 0) continue

        rows.push({
          key: `parallel:${item.id}:${parallel.id}`,
          item,
          quantity: parallel.quantity,
          notes: parallel.notes,
          status: parallel.status ?? 'available',
          entryKind: 'parallel',
        })
      }
    }

    return rows
  }, [items, entries, parallelEntries])

  const parallelSuggestions = useMemo(() => {
    const values = new Set<string>()

    for (const item of items) {
      const knownParallel = clean(item.parallel_name)
      const knownVariation = clean(item.variation)

      if (knownParallel) values.add(knownParallel)
      if (knownVariation) values.add(knownVariation)
    }

    for (const rows of Object.values(parallelEntries)) {
      for (const row of rows) {
        const value = clean(row.notes)
        if (value) values.add(value)
      }
    }

    return Array.from(values).sort(compareNatural)
  }, [items, parallelEntries])

  function updateEntry(
    itemId: string,
    patch: Partial<{ quantity: string; notes: string; status: string }>
  ) {
    setEntries((current) => ({
      ...current,
      [itemId]: {
        quantity: current[itemId]?.quantity ?? '',
        notes: current[itemId]?.notes ?? '',
        status: current[itemId]?.status ?? 'available',
        ...patch,
      },
    }))
  }

  function addParallelEntry(itemId: string) {
    setParallelEntries((current) => ({
      ...current,
      [itemId]: [
        ...(current[itemId] ?? []),
        {
          id: crypto.randomUUID(),
          quantity: '1',
          notes: '',
          status: 'available',
        },
      ],
    }))
  }

  function updateParallelEntry(
    itemId: string,
    parallelId: string,
    patch: Partial<{ quantity: string; notes: string; status: string }>
  ) {
    setParallelEntries((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).map((row) =>
        row.id === parallelId ? { ...row, ...patch } : row
      ),
    }))
  }

  function removeParallelEntry(itemId: string, parallelId: string) {
    setParallelEntries((current) => {
      const nextRows = (current[itemId] ?? []).filter(
        (row) => row.id !== parallelId
      )

      const next = { ...current }

      if (nextRows.length > 0) {
        next[itemId] = nextRows
      } else {
        delete next[itemId]
      }

      return next
    })
  }

  const loadImportedChecklist = useCallback(
    async (checklistId: string, selectAfterLoad = true) => {
      try {
        const response = await fetch(
          `/api/checklists/${encodeURIComponent(checklistId)}/entry-data`,
          { cache: 'no-store' }
        )
        const json = (await response.json()) as {
          ok?: boolean
          checklist?: ChecklistOption
          sections?: ChecklistSection[]
          items?: ChecklistItem[]
          error?: string
        }

        if (!response.ok || !json.ok || !json.checklist) {
          throw new Error(json.error || 'The imported checklist could not be loaded.')
        }

        setAvailableChecklists((current) => {
          const withoutImported = current.filter(
            (checklist) => checklist.id !== checklistId
          )
          return [...withoutImported, json.checklist as ChecklistOption]
        })
        setAvailableSections((current) => [
          ...current.filter((section) => section.checklist_id !== checklistId),
          ...(json.sections ?? []),
        ])
        setAvailableItems((current) => [
          ...current.filter((item) => item.checklist_id !== checklistId),
          ...(json.items ?? []),
        ])

        if (selectAfterLoad) {
          setSelectedChecklistId(checklistId)
          setSelectedTeam('')
          setSelectedSectionId('')
          setChecklistSearch('')
          setActiveCategory(checklistCategory(json.checklist))
          setChecklistPickerOpen(false)
        }

        return json.checklist as ChecklistOption
      } catch (error) {
        throw error
      }
    },
    []
  )

  useEffect(() => {
    function handleChecklistImportMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return

      const data = event.data as
        | {
            type?: string
            checklistId?: string
            checklistIds?: string[]
          }
        | null

      if (!data) return

      const checklistIds =
        data.type === 'hits:checklists-imported' && Array.isArray(data.checklistIds)
          ? data.checklistIds.filter(
              (id): id is string => typeof id === 'string' && Boolean(id)
            )
          : data.type === 'hits:checklist-imported' &&
              typeof data.checklistId === 'string' &&
              data.checklistId
            ? [data.checklistId]
            : []

      if (checklistIds.length === 0) return

      void (async () => {
        setChecklistImportMessage(
          checklistIds.length === 1
            ? 'Loading imported checklist...'
            : `Loading ${checklistIds.length} imported checklists...`
        )

        try {
          const loaded: ChecklistOption[] = []

          for (const checklistId of checklistIds) {
            const checklist = await loadImportedChecklist(
              checklistId,
              checklistIds.length === 1
            )
            loaded.push(checklist)
          }

          if (loaded.length === 1) {
            setChecklistImportMessage(
              `Imported ${loaded[0].name}. Select a team to continue.`
            )
            return
          }

          setSelectedChecklistId('')
          setSelectedTeam('')
          setSelectedSectionId('')
          setChecklistSearch('')
          setChecklistPickerOpen(true)
          setChecklistImportMessage(
            `${loaded.length} checklists imported. Choose the checklist you want to use for this break.`
          )
        } catch (error) {
          setChecklistImportMessage(
            error instanceof Error
              ? error.message
              : 'One or more imported checklists could not be loaded.'
          )
        }
      })()
    }

    window.addEventListener('message', handleChecklistImportMessage)
    return () =>
      window.removeEventListener('message', handleChecklistImportMessage)
  }, [loadImportedChecklist])


  function openChecklistImporter() {
    const popup = window.open(
      `/app/checklists/import?popup=1&break_id=${encodeURIComponent(breakId)}`,
      'hitsChecklistImporter',
      'popup=yes,width=980,height=820,resizable=yes,scrollbars=yes'
    )

    if (!popup) {
      window.open(
        `/app/checklists/import?popup=1&break_id=${encodeURIComponent(breakId)}`,
        '_blank',
        'noopener,noreferrer'
      )
    }
  }

  function selectChecklist(checklistId: string) {
    setSelectedChecklistId(checklistId)
    setSelectedTeam('')
    setSelectedSectionId('')
    setChecklistSearch('')
    setChecklistPickerOpen(false)
  }

  function selectCategory(category: ChecklistCategory) {
    setActiveCategory(category)
    setSelectedChecklistId('')
    setSelectedTeam('')
    setSelectedSectionId('')
    setChecklistSearch('')
    setChecklistPickerOpen(false)
  }

  function selectTeam(team: string) {
    setSelectedTeam(team)
    setSelectedSectionId('')
  }

  function itemSavedCount(itemId: string) {
    return Math.max(0, Number(savedByChecklistItem[itemId] ?? 0))
  }

  function sectionSavedCount(sectionId: string) {
    return selectedTeamItems.reduce((sum, item) => {
      const itemSectionId = item.section_id || `other:${selectedChecklistId}`
      if (itemSectionId !== sectionId) return sum
      return sum + itemSavedCount(item.id)
    }, 0)
  }

  function teamSavedCount(team: string) {
    return selectedChecklistItems.reduce((sum, item) => {
      const itemTeam = clean(item.printed_team) || 'Other / Unassigned'
      if (itemTeam !== team) return sum
      return sum + itemSavedCount(item.id)
    }, 0)
  }

  function itemEnteredCount(itemId: string) {
    const base = Math.max(0, Number(entries[itemId]?.quantity || 0))
    const parallels = (parallelEntries[itemId] ?? []).reduce(
      (sum, row) => sum + Math.max(0, Number(row.quantity || 0)),
      0
    )

    return base + parallels
  }

  function sectionEnteredCount(sectionId: string) {
    return selectedTeamItems.reduce((sum, item) => {
      const itemSectionId = item.section_id || `other:${selectedChecklistId}`
      if (itemSectionId !== sectionId) return sum
      return sum + itemEnteredCount(item.id)
    }, 0)
  }

  function teamEnteredCount(team: string) {
    return selectedChecklistItems.reduce((sum, item) => {
      const itemTeam = clean(item.printed_team) || 'Other / Unassigned'
      if (itemTeam !== team) return sum
      return sum + itemEnteredCount(item.id)
    }, 0)
  }

  function saveReceivedCount() {
    const nextReceived = Math.max(0, Math.floor(Number(receivedInput || 0)))

    if (!Number.isFinite(nextReceived) || nextReceived < 1) {
      setReceivedMessage('Items Received must be at least 1.')
      return
    }

    startSavingReceived(async () => {
      const formData = new FormData()
      formData.set('break_id', breakId)
      formData.set('cards_received', String(nextReceived))

      const result =
        await updateBreakCardsReceivedFromChecklistAction(formData)

      if (!result.ok) {
        setReceivedMessage(result.error)
        return
      }

      setReceivedCount(result.cardsReceived)
      setReceivedInput(String(result.cardsReceived))
      setEditingReceived(false)
      setReceivedMessage(
        `Items Received updated to ${result.cardsReceived}.`
      )
    })
  }

  function handleChecklistSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    const totalAfterThisEntry = alreadyEnteredCount + totalEnteredQuantity

    if (totalAfterThisEntry > receivedCount) {
      event.preventDefault()
      window.alert(
        `This break already has ${alreadyEnteredCount} saved card${alreadyEnteredCount === 1 ? '' : 's'}. Adding ${totalEnteredQuantity} more would make ${totalAfterThisEntry}, but Items Received is ${receivedCount}. Update Items Received or reduce the new quantities before saving.`
      )
      return
    }

    if (totalAfterThisEntry < receivedCount) {
      const remaining = receivedCount - totalAfterThisEntry
      const confirmed = window.confirm(
        `${alreadyEnteredCount} card${alreadyEnteredCount === 1 ? '' : 's'} already saved + ${totalEnteredQuantity} in this entry = ${totalAfterThisEntry} of ${receivedCount}. ${remaining} card${remaining === 1 ? '' : 's'} will still be unentered. Continue anyway?`
      )

      if (!confirmed) {
        event.preventDefault()
      }
    }
  }

  return (
    <form
      action={addBreakChecklistCardsAction}
      onSubmit={handleChecklistSubmit}
      className="space-y-4"
    >
      <input type="hidden" name="break_id" value={breakId} />
      <input type="hidden" name="cards_received" value={receivedCount} />
      <input type="hidden" name="entry_mode" value="checklist" />
      <input type="hidden" name="manual_pending_json" value={manualDraftJson} />
      <input
        type="hidden"
        name="checklist_pending_json"
        value={JSON.stringify({ entries, parallelEntries })}
      />
      <input
        type="hidden"
        name="checklist_entry_count"
        value={submittedEntries.length}
      />

      {submittedEntries.map((entry, index) => (
        <div key={entry.key} className="hidden">
          <input
            type="hidden"
            name={`checklist_item_id_${index}`}
            value={entry.item.id}
          />
          <input
            type="hidden"
            name={`quantity_${index}`}
            value={entry.quantity}
          />
          <input
            type="hidden"
            name={`notes_${index}`}
            value={entry.notes}
          />
          <input
            type="hidden"
            name={`status_${index}`}
            value={entry.status}
          />
          <input
            type="hidden"
            name={`entry_kind_${index}`}
            value={entry.entryKind}
          />
        </div>
      ))}

      <datalist id={`parallel-suggestions-${breakId}`}>
        {parallelSuggestions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      <section className="app-section p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-200">
                Checklist
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Choose a category, then search using any identifying words.
              </p>
            </div>

            <div className="shrink-0 text-sm text-zinc-400">
              Saved:{' '}
              <span className="font-semibold text-emerald-300">
                {alreadyEnteredCount}
              </span>
              {' · '}
              This Entry:{' '}
              <span className="font-semibold text-zinc-100">
                {totalEnteredQuantity}
              </span>
              {' · '}
              Received:{' '}
              <span className="font-semibold text-zinc-100">
                {receivedCount}
              </span>
              {' · '}
              Remaining:{' '}
              <span className="font-semibold text-zinc-100">
                {remainingCount}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {CHECKLIST_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.id)}
                className={
                  activeCategory === category.id
                    ? 'app-button-primary'
                    : 'app-button'
                }
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
              <span
                className={
                  selectedChecklist
                    ? 'truncate text-zinc-100'
                    : 'truncate text-zinc-500'
                }
              >
                {selectedChecklist?.name ?? 'Search / select checklist...'}
              </span>
              <span className="shrink-0 text-zinc-500">
                {checklistPickerOpen ? '▲' : '▼'}
              </span>
            </button>

            {checklistPickerOpen && (
              <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
                <div className="border-b border-zinc-800 p-3">
                  <input
                    type="search"
                    value={checklistSearch}
                    onChange={(e) => setChecklistSearch(e.target.value)}
                    placeholder="Try: 2025 cosmic, 2026 bowman, chrome update..."
                    autoFocus
                    className="app-input w-full"
                  />
                  <div className="mt-2 text-xs text-zinc-500">
                    Search words can appear anywhere in the checklist name.
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto">
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
                        onClick={() => selectChecklist(checklist.id)}
                        className="flex w-full items-start border-b border-zinc-800 px-3 py-3 text-left last:border-b-0 hover:bg-zinc-900/70"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-zinc-100">
                            {checklist.name}
                          </div>
                          {meta ? (
                            <div className="mt-0.5 text-xs text-zinc-500">
                              {meta}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}

                  {filteredChecklistOptions.length === 0 && (
                    <div className="px-4 py-5 text-center">
                      <div className="text-sm font-medium text-zinc-200">
                        No checklist matches those search words.
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        If this product is not in HITS yet, you can import its checklist now without leaving this break.
                      </div>
                      <button
                        type="button"
                        onClick={openChecklistImporter}
                        className="app-button mt-3 inline-flex"
                      >
                        Upload Checklist
                      </button>
                    </div>
                  )}

                  {filteredChecklistOptions.length > 25 && (
                    <div className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">
                      Showing the first 25 matches. Add another identifying word
                      to narrow the results.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-black/30 px-3 py-3">
                  <span className="text-xs text-zinc-500">
                    Checklist not listed?
                  </span>
                  <button
                        type="button"
                        onClick={openChecklistImporter}
                        className="app-button"
                      >
                        Add / Import Checklist
                      </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </section>

      {checklistImportMessage && (
        <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
          {checklistImportMessage}
        </div>
      )}

      {selectedChecklistId && (
        <section className="app-section overflow-hidden">
          <div className="grid min-h-[540px] xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-b border-zinc-800 bg-zinc-950/30 xl:border-b-0 xl:border-r">
              <div className="border-b border-zinc-800 px-4 py-3">
                <div className="font-semibold text-zinc-100">
                  {selectedChecklist?.name ?? 'Checklist'}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Select one team at a time.
                </div>
              </div>

              <div className="max-h-[620px] overflow-y-auto p-2">
                {teamOptions.map((team) => {
                  const active = team.name === selectedTeam
                  const saved = teamSavedCount(team.name)
                  const entered = teamEnteredCount(team.name)
                  const accounted = saved + entered

                  return (
                    <button
                      key={team.name}
                      type="button"
                      onClick={() => selectTeam(team.name)}
                      className={[
                        'mb-1 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left',
                        active
                          ? 'border-cyan-700 bg-zinc-800/80 text-cyan-200'
                          : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/60',
                      ].join(' ')}
                    >
                      <span className="min-w-0 truncate">{team.name}</span>

                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        {accounted > 0 && (
                          <span className="rounded-full border border-emerald-800 bg-emerald-950/30 px-2 py-0.5 text-emerald-300">
                            {saved > 0 ? `${saved} saved` : `${entered} new`}
                          </span>
                        )}
                        <span className="text-zinc-500">{team.count}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </aside>

            <div className="min-w-0">
              {!selectedTeam ? (
                <div className="flex min-h-[540px] items-center justify-center p-8 text-center">
                  <div>
                    <div className="text-lg font-semibold text-zinc-200">
                      Choose a team
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      Select a team from the checklist on the left to begin entry.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-b border-zinc-800 px-4 py-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-zinc-100">
                          {selectedTeam}
                        </div>
                        <div className="mt-1 text-sm text-zinc-500">
                          Choose a checklist section, then enter the cards you received.
                        </div>
                      </div>

                      <div className="text-xs text-zinc-500">
                        {selectedTeamItems.length} checklist card
                        {selectedTeamItems.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {sectionOptions.map((section) => {
                        const active = section.id === selectedSectionId
                        const saved = sectionSavedCount(section.id)
                        const entered = sectionEnteredCount(section.id)
                        const accounted = saved + entered

                        const sectionItems = selectedTeamItems
                          .filter((item) => {
                            const id =
                              item.section_id || `other:${selectedChecklistId}`
                            return id === section.id
                          })
                          .sort((a, b) => {
                            const aSort = Number(a.sort_order ?? 999999)
                            const bSort = Number(b.sort_order ?? 999999)
                            if (aSort !== bSort) return aSort - bSort
                            return compareNatural(
                              clean(a.card_number),
                              clean(b.card_number)
                            )
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
                              onClick={() =>
                                setSelectedSectionId((current) =>
                                  current === section.id ? '' : section.id
                                )
                              }
                              className={[
                                'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
                                active
                                  ? 'bg-zinc-800/80'
                                  : 'hover:bg-zinc-900/60',
                              ].join(' ')}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-zinc-500">
                                    {active ? '▼' : '▶'}
                                  </span>
                                  <span
                                    className={
                                      active
                                        ? 'truncate font-semibold text-cyan-200'
                                        : 'truncate font-semibold text-zinc-100'
                                    }
                                  >
                                    {section.name}
                                  </span>
                                </div>

                                <div className="mt-1 pl-5 text-xs text-zinc-500">
                                  {section.count} card
                                  {section.count === 1 ? '' : 's'}
                                </div>
                              </div>

                              {accounted > 0 ? (
                                <span className="shrink-0 rounded-full border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-300">
                                  {saved > 0 ? `${saved} saved` : `${entered} new`}
                                </span>
                              ) : (
                                <span className="shrink-0 text-xs text-zinc-500">
                                  Not started
                                </span>
                              )}
                            </button>

                            {active && (
                              <div className="overflow-x-auto border-t border-zinc-800 bg-black/20">
                                <table className="w-full min-w-[760px] text-left text-sm">
                                  <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
                                    <tr>
                                      <th className="px-3 py-2.5">Card #</th>
                                      <th className="px-3 py-2.5">Player</th>
                                      <th className="px-3 py-2.5">Details</th>
                                      <th className="px-3 py-2.5">Qty</th>
                                      <th className="px-3 py-2.5">Status</th>
                                      <th className="px-3 py-2.5">Notes</th>
                                      <th className="w-12 px-2 py-2.5"></th>
                                    </tr>
                                  </thead>

                                  <tbody className="divide-y divide-zinc-800">
                                    {sectionItems.map((item, itemIndex) => {
                                      const savedCount = itemSavedCount(item.id)
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
                                          <tr
                                            className={
                                              savedCount > 0
                                                ? 'bg-emerald-950/15'
                                                : undefined
                                            }
                                          >
                                            <td className="px-3 py-2.5 font-semibold text-cyan-200">
                                              {item.card_number}
                                            </td>

                                            <td className="px-3 py-2.5 font-medium text-zinc-100">
                                              {item.player_name}
                                            </td>

                                            <td className="px-3 py-2.5 text-zinc-400">
                                              {details.length > 0
                                                ? details.join(' • ')
                                                : '—'}
                                              {savedCount > 0 ? (
                                                <span className="ml-2 inline-flex rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                                                  Saved: {savedCount}
                                                </span>
                                              ) : null}
                                            </td>

                                            <td className="px-3 py-2.5">
                                              <input
                                                type="number"
                                                min={0}
                                                value={
                                                  entries[item.id]?.quantity ?? ''
                                                }
                                                onChange={(e) =>
                                                  updateEntry(item.id, {
                                                    quantity: e.target.value,
                                                  })
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key === 'ArrowDown') {
                                                    e.preventDefault()
                                                    focusQuantityInput(
                                                      section.id,
                                                      e.currentTarget,
                                                      1
                                                    )
                                                  } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault()
                                                    focusQuantityInput(
                                                      section.id,
                                                      e.currentTarget,
                                                      -1
                                                    )
                                                  }
                                                }}
                                                data-checklist-section={section.id}
                                                data-checklist-qty="true"
                                                className="app-input w-20"
                                                placeholder="0"
                                              />
                                            </td>

                                            <td className="px-3 py-2.5">
                                              <select
                                                value={entries[item.id]?.status ?? 'available'}
                                                onChange={(e) =>
                                                  updateEntry(item.id, {
                                                    status: e.target.value,
                                                  })
                                                }
                                                className="app-select w-32"
                                              >
                                                <option value="available">For Sale</option>
                                                <option value="personal">Personal</option>
                                                <option value="junk">Junk</option>
                                              </select>
                                            </td>

                                            <td className="px-3 py-2.5">
                                              <input
                                                value={entries[item.id]?.notes ?? ''}
                                                onChange={(e) =>
                                                  updateEntry(item.id, {
                                                    notes: e.target.value,
                                                  })
                                                }
                                                className="app-input w-full min-w-64"
                                                placeholder="Optional notes"
                                              />
                                            </td>

                                            <td className="px-2 py-2.5 text-right">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  addParallelEntry(item.id)
                                                }
                                                className="app-button px-2.5"
                                                title="Add another version / parallel of this card"
                                                aria-label={`Add another version of ${item.player_name} ${item.card_number}`}
                                              >
                                                +
                                              </button>
                                            </td>
                                          </tr>

                                          {(parallelEntries[item.id] ?? []).map(
                                            (parallel) => (
                                              <tr
                                                key={`${item.id}:${parallel.id}`}
                                                className="bg-zinc-950/35"
                                              >
                                                <td className="px-3 py-2 text-cyan-300/80">
                                                  ↳ {item.card_number}
                                                </td>

                                                <td className="px-3 py-2 text-zinc-300">
                                                  {item.player_name}
                                                </td>

                                                <td className="px-3 py-2 text-xs text-zinc-500">
                                                  Added version
                                                </td>

                                                <td className="px-3 py-2">
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    value={parallel.quantity}
                                                    onChange={(e) =>
                                                      updateParallelEntry(
                                                        item.id,
                                                        parallel.id,
                                                        {
                                                          quantity:
                                                            e.target.value,
                                                        }
                                                      )
                                                    }
                                                    onKeyDown={(e) => {
                                                      if (
                                                        e.key === 'ArrowDown'
                                                      ) {
                                                        e.preventDefault()
                                                        focusQuantityInput(
                                                          section.id,
                                                          e.currentTarget,
                                                          1
                                                        )
                                                      } else if (
                                                        e.key === 'ArrowUp'
                                                      ) {
                                                        e.preventDefault()
                                                        focusQuantityInput(
                                                          section.id,
                                                          e.currentTarget,
                                                          -1
                                                        )
                                                      }
                                                    }}
                                                    data-checklist-section={
                                                      section.id
                                                    }
                                                    data-checklist-qty="true"
                                                    className="app-input w-20"
                                                    placeholder="1"
                                                  />
                                                </td>

                                                <td className="px-3 py-2">
                                                  <select
                                                    value={parallel.status ?? 'available'}
                                                    onChange={(e) =>
                                                      updateParallelEntry(
                                                        item.id,
                                                        parallel.id,
                                                        {
                                                          status: e.target.value,
                                                        }
                                                      )
                                                    }
                                                    className="app-select w-32"
                                                  >
                                                    <option value="available">For Sale</option>
                                                    <option value="personal">Personal</option>
                                                    <option value="junk">Junk</option>
                                                  </select>
                                                </td>

                                                <td className="px-3 py-2">
                                                  <input
                                                    value={parallel.notes}
                                                    onChange={(e) =>
                                                      updateParallelEntry(
                                                        item.id,
                                                        parallel.id,
                                                        {
                                                          notes:
                                                            e.target.value,
                                                        }
                                                      )
                                                    }
                                                    list={`parallel-suggestions-${breakId}`}
                                                    className="app-input w-full min-w-64"
                                                    placeholder="Parallel / variation, e.g. Reptilian"
                                                  />
                                                </td>

                                                <td className="px-2 py-2 text-right">
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      removeParallelEntry(
                                                        item.id,
                                                        parallel.id
                                                      )
                                                    }
                                                    className="app-button-danger px-2.5"
                                                    title="Remove this added version"
                                                    aria-label={`Remove added version of ${item.player_name} ${item.card_number}`}
                                                  >
                                                    ×
                                                  </button>
                                                </td>
                                              </tr>
                                            )
                                          )}
                                        </Fragment>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
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
      )}

      <div className="sticky bottom-3 z-30 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
          <span>
            Saved:{' '}
            <span className="font-semibold text-emerald-300">
              {alreadyEnteredCount}
            </span>
            {' · '}
            This Entry:{' '}
            <span className="font-semibold text-zinc-100">
              {totalEnteredQuantity}
            </span>
            {' · '}
            Received:{' '}
            <span className="font-semibold text-zinc-100">{receivedCount}</span>
            {' · '}
            Remaining:{' '}
            <span className="font-semibold text-zinc-100">{remainingCount}</span>
          </span>

          {editingReceived ? (
            <span className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                value={receivedInput}
                onChange={(event) => {
                  setReceivedInput(event.target.value)
                  setReceivedMessage(null)
                }}
                className="app-input w-24"
                aria-label="Items Received"
              />
              <button
                type="button"
                onClick={saveReceivedCount}
                disabled={isSavingReceived}
                className="app-button"
              >
                {isSavingReceived ? 'Saving...' : 'Save Received'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReceivedInput(String(receivedCount))
                  setEditingReceived(false)
                  setReceivedMessage(null)
                }}
                disabled={isSavingReceived}
                className="app-button"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setReceivedInput(String(receivedCount))
                setEditingReceived(true)
                setReceivedMessage(null)
              }}
              className="app-button"
            >
              Edit Received
            </button>
          )}

          <span className="text-xs text-zinc-500">
            {draftSavedAt ? 'Autosaved' : 'Autosave ready'}
          </span>

          {receivedMessage ? (
            <span className="text-xs text-zinc-400">{receivedMessage}</span>
          ) : null}
        </div>

        <button
          type="submit"
          className="app-button-primary"
          suppressHydrationWarning
          disabled={!progressReady || totalEnteredQuantity <= 0}
        >
          Save All Items To Inventory
        </button>
      </div>
    </form>
  )
}
