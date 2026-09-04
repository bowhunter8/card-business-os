import { createClient } from '@/lib/supabase/server'

type ChecklistRow = {
  id: string
  year: string | number | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  name: string | null
}

type ChecklistSectionRow = {
  id: string
  name: string | null
  section_type: string | null
}

type ChecklistItemRow = {
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
  print_run: number | null
  quantity_required: number | null
}

type ChecklistItemPersonRow = {
  checklist_item_id: string
  player_name: string | null
  printed_team: string | null
}

type InventoryRow = {
  id: string
  status: string | null
  title: string | null
  player_name: string | null
  year: string | number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  variation: string | null
  team: string | null
  quantity: number | null
  available_quantity: number | null
  notes: string | null
  rookie_flag: boolean | null
  auto_flag: boolean | null
  relic_flag: boolean | null
  serial_flag: boolean | null
  serial_number_text: string | null
}

type CandidateMatch = {
  user_id: string
  checklist_item_id: string
  inventory_item_id: string
  match_score: number
  match_type: 'automatic'
  is_preferred: boolean
}

type CandidateReason =
  | 'structured-player'
  | 'notes-player'
  | 'card-number'
  | 'team'
  | 'year'
  | 'product'
  | 'parallel'
  | 'variation'
  | 'section'
  | 'variant-protected'

type ScoredCandidate = {
  inventoryItemId: string
  score: number
  reasons: CandidateReason[]
  notesQuantity: number | null
}

export type ChecklistInventoryMatchResult =
  | {
      ok: true
      checklistId: string
      checklistItems: number
      availableInventoryItems: number
      candidateMatches: number
      strongMatches: number
      notesDerivedMatches: number
      protectedVariantMatches: number
    }
  | {
      ok: false
      code:
        | 'not_authenticated'
        | 'invalid_checklist'
        | 'checklist_not_found'
        | 'load_failed'
        | 'write_failed'
      error: string
    }

const PAGE_SIZE = 500
const INSERT_BATCH_SIZE = 400
const DELETE_BATCH_SIZE = 200

const STRONG_MATCH_SCORE = 70
const NOTES_MATCH_MIN_SCORE = 55
const STRUCTURED_MATCH_MIN_SCORE = 60
const PROTECTED_VARIANT_SCORE_CAP = 59

const NOTE_LIST_PREFIXES = [
  'players',
  'player',
  'includes',
  'include',
  'included',
  'cards',
  'card',
  'names',
  'name',
  'contents',
  'content',
]

const NOTE_NAME_STOP_WORDS = new Set([
  'base',
  'lot',
  'team',
  'set',
  'rookie',
  'rookies',
  'prospect',
  'prospects',
  'chrome',
  'paper',
  'insert',
  'inserts',
  'auto',
  'autograph',
  'autographs',
  'parallel',
  'parallels',
  'refractor',
  'refractors',
  'numbered',
  'serial',
  'cards',
  'card',
  'style',
])

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeText(value: unknown) {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCardNumber(value: unknown) {
  return clean(value)
    .toUpperCase()
    .replace(/^#/, '')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .trim()
}

function normalizePlayerName(value: unknown) {
  return normalizeText(value)
    .replace(/\b(?:rc|rookie|rookie card)\b$/i, '')
    .replace(/\b(?:1st|first bowman)\b$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTeam(value: unknown) {
  return normalizeText(value)
}

function normalizeYear(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, '')
}

function tokenSet(value: unknown) {
  return new Set(
    normalizeText(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  )
}

function sharedTokenCount(left: unknown, right: unknown) {
  const leftTokens = tokenSet(left)
  const rightTokens = tokenSet(right)

  let count = 0

  for (const token of leftTokens) {
    if (rightTokens.has(token)) count += 1
  }

  return count
}

function productIdentityTokens(value: unknown) {
  const generic = new Set([
    'baseball',
    'basketball',
    'football',
    'hockey',
    'soccer',
    'cards',
    'card',
    'checklist',
    'trading',
    'the',
    'and',
    'topps',
    'panini',
    'fanatics',
  ])

  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !generic.has(token) &&
        !/^20\d{2}$/.test(token)
    )
}

function checklistProductIdentityTokens(checklist: ChecklistRow) {
  return Array.from(
    new Set(
      productIdentityTokens(
        [checklist.brand, checklist.product_name, checklist.name]
          .filter(Boolean)
          .join(' ')
      )
    )
  )
}

function inventoryProductIdentityTokens(inventory: InventoryRow) {
  return Array.from(
    new Set(
      productIdentityTokens(
        [inventory.brand, inventory.set_name, inventory.title]
          .filter(Boolean)
          .join(' ')
      )
    )
  )
}

function structuredInventoryProductLabel(inventory: InventoryRow) {
  const title = clean(inventory.title)
  if (!title.includes('•')) return ''

  const parts = title
    .split('•')
    .map((part) => clean(part))
    .filter(Boolean)

  if (parts.length < 2) return ''

  // HITS titles commonly begin "YEAR • PRODUCT • ...". Treat that product
  // segment as stronger evidence than loose words elsewhere in the title.
  if (/^20\d{2}(?:[-–]\d{2})?$/.test(parts[0])) {
    return normalizeText(parts[1])
  }

  return ''
}

function checklistPrimaryProductTokens(checklist: ChecklistRow) {
  return Array.from(
    new Set(
      productIdentityTokens(
        [checklist.brand, checklist.product_name]
          .filter(Boolean)
          .join(' ')
      )
    )
  )
}

function hasStructuredTitleProductConflict(
  checklist: ChecklistRow,
  inventory: InventoryRow
) {
  const titleProduct = structuredInventoryProductLabel(inventory)
  if (!titleProduct) return false

  const checklistTokens = checklistPrimaryProductTokens(checklist)
  if (checklistTokens.length === 0) return false

  const titleTokens = productIdentityTokens(titleProduct)
  if (titleTokens.length === 0) return false

  // If the structured HITS product segment names a different product, reject
  // the candidate even when some older structured field is incomplete/wrong.
  return !checklistTokens.some((token) => titleTokens.includes(token))
}

function inventoryTitleYear(inventory: InventoryRow) {
  const title = clean(inventory.title)

  if (!title) return ''

  const match = title.match(/^\s*(20\d{2}(?:[-–]\d{2})?)\b/)
  return match ? normalizeYear(match[1]) : ''
}

function inventoryEffectiveYear(inventory: InventoryRow) {
  return normalizeYear(inventory.year) || inventoryTitleYear(inventory)
}

function checklistEffectiveYear(checklist: ChecklistRow) {
  return normalizeYear(checklist.year)
}

function sameChecklistYear(checklist: ChecklistRow, inventory: InventoryRow) {
  const checklistYear = checklistEffectiveYear(checklist)
  const inventoryYear = inventoryEffectiveYear(inventory)

  // Checklist matching is intentionally strict here. If we cannot establish
  // the same year, do not include the inventory row in this checklist.
  return Boolean(
    checklistYear &&
      inventoryYear &&
      checklistYear === inventoryYear
  )
}

function checklistCoreProductTokens(checklist: ChecklistRow) {
  const manufacturerTokens = new Set(
    productIdentityTokens(checklist.manufacturer)
  )

  return Array.from(
    new Set(
      productIdentityTokens(
        [checklist.brand, checklist.product_name, checklist.name]
          .filter(Boolean)
          .join(' ')
      ).filter((token) => !manufacturerTokens.has(token))
    )
  )
}

function inventoryCoreProductTokens(inventory: InventoryRow) {
  const titleProduct = structuredInventoryProductLabel(inventory)

  if (titleProduct) {
    return Array.from(new Set(productIdentityTokens(titleProduct)))
  }

  return Array.from(
    new Set(
      productIdentityTokens(
        [inventory.brand, inventory.set_name]
          .filter(Boolean)
          .join(' ')
      )
    )
  )
}

function sameChecklistProduct(checklist: ChecklistRow, inventory: InventoryRow) {
  const checklistTokens = checklistCoreProductTokens(checklist)
  const inventoryTokens = inventoryCoreProductTokens(inventory)

  if (checklistTokens.length === 0 || inventoryTokens.length === 0) {
    return false
  }

  // Require an actual product-family token from this checklist to be present
  // in the inventory product identity. For 2026 Bowman this means "Bowman";
  // "Topps", "Topps Finest", SMLB, etc. cannot qualify.
  return checklistTokens.some((token) => inventoryTokens.includes(token))
}

function sameChecklistIdentity(checklist: ChecklistRow, inventory: InventoryRow) {
  return (
    sameChecklistYear(checklist, inventory) &&
    sameChecklistProduct(checklist, inventory)
  )
}

function hasMeaningfulProductOverlap(checklist: ChecklistRow, inventory: InventoryRow) {
  const checklistTokens = checklistProductIdentityTokens(checklist)
  const inventoryTokens = inventoryProductIdentityTokens(inventory)

  if (checklistTokens.length === 0 || inventoryTokens.length === 0) {
    return false
  }

  return checklistTokens.some((token) => inventoryTokens.includes(token))
}

function hasExplicitProductConflict(checklist: ChecklistRow, inventory: InventoryRow) {
  if (hasStructuredTitleProductConflict(checklist, inventory)) {
    return true
  }

  const checklistTokens = checklistProductIdentityTokens(checklist)
  const inventoryTokens = inventoryProductIdentityTokens(inventory)

  if (checklistTokens.length === 0 || inventoryTokens.length === 0) {
    return false
  }

  // Product-specific words are present on both sides but none agree. This is
  // stronger negative evidence than a coincidental card number or player name.
  return !checklistTokens.some((token) => inventoryTokens.includes(token))
}

function splitPrintedTeams(value: string | null) {
  return clean(value)
    .split(/[\/|]/g)
    .map((part) => normalizeTeam(part))
    .filter(Boolean)
}

function yearsExplicitlyConflict(left: unknown, right: unknown) {
  const leftValue = normalizeYear(left)
  const rightValue = normalizeYear(right)

  return Boolean(leftValue && rightValue && leftValue !== rightValue)
}

function looksLikeSpecialVariant(inventory: InventoryRow) {
  const specialText = normalizeText(
    [
      inventory.parallel_name,
      inventory.variation,
      inventory.serial_number_text,
      inventory.title,
    ]
      .filter(Boolean)
      .join(' ')
  )

  return Boolean(
    clean(inventory.parallel_name) ||
      clean(inventory.variation) ||
      inventory.auto_flag === true ||
      inventory.relic_flag === true ||
      inventory.serial_flag === true ||
      clean(inventory.serial_number_text) ||
      /\b(auto|autograph|relic|patch|parallel|refractor|numbered|superfractor|wave|shimmer|atomic|lava|speckle|sapphire|gold|orange|red|blue|green|purple)\b/.test(
        specialText
      )
  )
}

function checklistItemIsOrdinary(item: ChecklistItemRow) {
  return !(
    clean(item.parallel_name) ||
    clean(item.variation) ||
    item.auto_flag === true ||
    item.relic_flag === true ||
    item.serial_flag === true ||
    Number(item.print_run ?? 0) > 0
  )
}

function sectionSubsetIdentity(section: ChecklistSectionRow | null) {
  const text = normalizeText(section?.name)

  if (!text) return ''

  // Named subsets/inserts inside the same overall product must stay in their
  // own checklist section. This prevents, for example, a Bowman Sterling lot
  // from satisfying an ordinary Bowman Base Set card.
  const identities = [
    'bowman sterling',
    'under the radar',
    'top 100',
    'electric sluggers',
    'power chords',
    'anime',
    'final draft',
    'crystallized',
    'bowman spotlights',
    'draft pick pairings',
  ]

  return identities.find((identity) => text.includes(identity)) ?? ''
}

function inventoryNamedSubsetIdentities(inventory: InventoryRow) {
  const text = normalizeText(
    [
      inventory.title,
      inventory.set_name,
      inventory.parallel_name,
      inventory.variation,
      inventory.notes,
    ]
      .filter(Boolean)
      .join(' ')
  )

  const identities = [
    'bowman sterling',
    'under the radar',
    'top 100',
    'electric sluggers',
    'power chords',
    'anime',
    'final draft',
    'crystallized',
    'bowman spotlights',
    'draft pick pairings',
  ]

  return identities.filter((identity) => text.includes(identity))
}

function sectionSubsetCompatible(
  section: ChecklistSectionRow | null,
  inventory: InventoryRow
) {
  const checklistSubset = sectionSubsetIdentity(section)
  const inventorySubsets = inventoryNamedSubsetIdentities(inventory)

  if (checklistSubset) {
    return inventorySubsets.includes(checklistSubset)
  }

  // Default/base checklist sections must not absorb a clearly named insert or
  // subset merely because year, product, player, or card number also match.
  return inventorySubsets.length === 0
}

function sectionLooksBaseLike(section: ChecklistSectionRow | null) {
  const value = normalizeText(section?.name)

  if (!value) return false

  if (
    /\b(autograph|auto|insert|parallel|variation|relic|patch|numbered|short print|ssp|sp)\b/.test(
      value
    )
  ) {
    return false
  }

  return (
    value === 'base set' ||
    value.includes('base set') ||
    value.includes('base prospect') ||
    value.includes('chrome prospect') ||
    value === 'prospects' ||
    value === 'prospect'
  )
}

function sectionCompatibilityScore(
  section: ChecklistSectionRow | null,
  inventory: InventoryRow
) {
  if (!section?.name) return 0

  const sectionText = normalizeText(section.name)
  const inventoryText = normalizeText(
    [inventory.set_name, inventory.title, inventory.parallel_name, inventory.variation]
      .filter(Boolean)
      .join(' ')
  )

  if (!inventoryText) return 0

  const sectionKeywords = [
    'chrome',
    'prospect',
    'base',
    'autograph',
    'auto',
    'insert',
    'sterling',
    'anime',
    'spotlight',
    'draft',
  ]

  let score = 0

  for (const keyword of sectionKeywords) {
    if (sectionText.includes(keyword) && inventoryText.includes(keyword)) {
      score += 3
    }
  }

  return Math.min(score, 9)
}

function stripKnownNotePrefix(value: string) {
  const colonIndex = value.indexOf(':')

  if (colonIndex < 0) return value.trim()

  const prefix = normalizeText(value.slice(0, colonIndex))

  if (NOTE_LIST_PREFIXES.includes(prefix)) {
    return value.slice(colonIndex + 1).trim()
  }

  return value.trim()
}

function parseQuantitySuffix(value: string) {
  const suffixMatch = value.match(/^(.*?)(?:\s+|\s*[-–—]\s*)x\s*(\d+)\s*$/i)

  if (suffixMatch) {
    return {
      name: clean(suffixMatch[1]),
      quantity: Math.max(1, Number(suffixMatch[2])),
    }
  }

  const parenMatch = value.match(/^(.*?)\s*\(\s*x?\s*(\d+)\s*\)\s*$/i)

  if (parenMatch) {
    return {
      name: clean(parenMatch[1]),
      quantity: Math.max(1, Number(parenMatch[2])),
    }
  }

  const prefixMatch = value.match(/^(\d+)\s*x\s+(.+)$/i)

  if (prefixMatch) {
    return {
      name: clean(prefixMatch[2]),
      quantity: Math.max(1, Number(prefixMatch[1])),
    }
  }

  return {
    name: clean(value),
    quantity: 1,
  }
}

function looksLikePlayerNameSegment(value: string) {
  const normalized = normalizePlayerName(value)

  if (!normalized) return false

  const words = normalized.split(' ').filter(Boolean)

  if (words.length < 2 || words.length > 6) return false
  if (words.some((word) => NOTE_NAME_STOP_WORDS.has(word))) return false
  if (/\d/.test(normalized)) return false

  return words.every((word) => /^[a-z][a-z-]*$/.test(word))
}

/**
 * Parses grouped-entry notes such as:
 *   Kade Anderson x2, Cal Raleigh x4, Julio Rodriguez
 *
 * Returns normalized player name -> quantity represented by that note list.
 * This is intentionally conservative so ordinary narrative notes do not become
 * fake checklist ownership.
 */
export function parseGroupedPlayerNotes(notes: string | null | undefined) {
  const result = new Map<string, number>()
  const source = clean(notes)

  if (!source) return result

  const segments = source
    .split(/[\n,;|]+/g)
    .map((segment) => stripKnownNotePrefix(segment))
    .map((segment) => segment.trim())
    .filter(Boolean)

  for (const rawSegment of segments) {
    const parsed = parseQuantitySuffix(rawSegment)

    if (!looksLikePlayerNameSegment(parsed.name)) continue

    const normalizedName = normalizePlayerName(parsed.name)

    if (!normalizedName) continue

    result.set(
      normalizedName,
      Math.max(result.get(normalizedName) ?? 0, parsed.quantity)
    )
  }

  return result
}

async function loadAllRows<T>(
  loader: (from: number, to: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>
) {
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const response = await loader(from, to)

    if (response.error) {
      throw new Error(response.error.message)
    }

    const batch = response.data ?? []
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break

    from += PAGE_SIZE
  }

  return rows
}

function addToMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  if (!key) return

  const existing = map.get(key)

  if (existing) {
    existing.push(value)
  } else {
    map.set(key, [value])
  }
}

function uniqueInventoryRows(rows: InventoryRow[]) {
  const byId = new Map<string, InventoryRow>()

  for (const row of rows) {
    byId.set(row.id, row)
  }

  return Array.from(byId.values())
}

function buildChecklistPeopleMap(people: ChecklistItemPersonRow[]) {
  const map = new Map<string, ChecklistItemPersonRow[]>()

  for (const person of people) {
    addToMapArray(map, person.checklist_item_id, person)
  }

  return map
}

function getChecklistPlayerNames(
  item: ChecklistItemRow,
  peopleByItemId: Map<string, ChecklistItemPersonRow[]>
) {
  const names = new Set<string>()

  const directName = normalizePlayerName(item.player_name)
  if (directName) names.add(directName)

  for (const person of peopleByItemId.get(item.id) ?? []) {
    const personName = normalizePlayerName(person.player_name)
    if (personName) names.add(personName)
  }

  return Array.from(names)
}

function getChecklistPrintedTeams(
  item: ChecklistItemRow,
  peopleByItemId: Map<string, ChecklistItemPersonRow[]>
) {
  const teams = new Set<string>()

  for (const team of splitPrintedTeams(item.printed_team)) {
    teams.add(team)
  }

  for (const person of peopleByItemId.get(item.id) ?? []) {
    for (const team of splitPrintedTeams(person.printed_team)) {
      teams.add(team)
    }
  }

  return Array.from(teams)
}

function itemTeamsCompatible(
  item: ChecklistItemRow,
  inventory: InventoryRow,
  peopleByItemId: Map<string, ChecklistItemPersonRow[]>
) {
  const inventoryTeam = normalizeTeam(inventory.team)

  if (!inventoryTeam) return false

  const checklistTeams = getChecklistPrintedTeams(item, peopleByItemId)

  return checklistTeams.some(
    (team) =>
      team === inventoryTeam ||
      team.includes(inventoryTeam) ||
      inventoryTeam.includes(team)
  )
}

function sectionIdentityPhrase(section: ChecklistSectionRow | null) {
  const source = normalizeSpecialEvidence(section?.name)

  if (!source) return ''

  const genericWords = new Set([
    'base',
    'chrome',
    'prospect',
    'prospects',
    'autograph',
    'autographs',
    'auto',
    'autos',
    'cards',
    'card',
    'set',
    'retail',
  ])

  return source
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token && !genericWords.has(token))
    .join(' ')
    .trim()
}

function sectionNeedsIdentityEvidence(section: ChecklistSectionRow | null) {
  return Boolean(sectionIdentityPhrase(section))
}

function inventoryHasSectionIdentityEvidence(
  section: ChecklistSectionRow | null,
  inventory: InventoryRow
) {
  const identity = sectionIdentityPhrase(section)

  if (!identity) return true

  return specialEvidenceStrength(identity, inventory) > 0
}

function specialRequirementsCompatible(
  item: ChecklistItemRow,
  section: ChecklistSectionRow | null,
  inventory: InventoryRow,
  allowDefaultFamilyFallback: boolean
) {
  const requiresNamedSectionIdentity = sectionNeedsIdentityEvidence(section)

  if (
    item.auto_flag === true &&
    !inventoryHasAutoEvidence(inventory) &&
    !(allowDefaultFamilyFallback && !requiresNamedSectionIdentity)
  ) {
    return false
  }

  if (
    item.relic_flag === true &&
    !inventoryHasRelicEvidence(inventory) &&
    !(allowDefaultFamilyFallback && !requiresNamedSectionIdentity)
  ) {
    return false
  }

  // The section name often carries the actual card/variant identity in Beckett.
  // Example: the checklist rows for CPA-GJ can appear in Chrome Prospect
  // Autographs, Gold Ink Autographs, and Packfractor Autographs. A generic
  // autograph match must not spill into Gold Ink or Packfractor without that
  // identity appearing in the inventory title/notes/set/variation fields.
  if (
    sectionNeedsIdentityEvidence(section) &&
    !inventoryHasSectionIdentityEvidence(section, inventory)
  ) {
    return false
  }

  if (
    (item.serial_flag === true || Number(item.print_run ?? 0) > 0) &&
    !inventoryHasSerialEvidence(inventory, item.print_run) &&
    !(allowDefaultFamilyFallback && !requiresNamedSectionIdentity)
  ) {
    return false
  }

  if (
    clean(item.parallel_name) &&
    normalizeText(item.parallel_name) !== normalizeText(inventory.parallel_name) &&
    !inventoryHasNamedSpecialEvidence(item.parallel_name, inventory)
  ) {
    return false
  }

  if (
    clean(item.variation) &&
    normalizeText(item.variation) !== normalizeText(inventory.variation) &&
    !inventoryHasNamedSpecialEvidence(item.variation, inventory)
  ) {
    return false
  }

  return true
}

function scoreStructuredCandidate({
  checklist,
  item,
  section,
  inventory,
  peopleByItemId,
}: {
  checklist: ChecklistRow
  item: ChecklistItemRow
  section: ChecklistSectionRow | null
  inventory: InventoryRow
  peopleByItemId: Map<string, ChecklistItemPersonRow[]>
}): ScoredCandidate | null {
  if (!sameChecklistIdentity(checklist, inventory)) return null
  if (!sectionSubsetCompatible(section, inventory)) return null

  const checklistPlayers = getChecklistPlayerNames(item, peopleByItemId)
  const inventoryPlayer = normalizePlayerName(inventory.player_name)
  const checklistCardNumber = normalizeCardNumber(item.card_number)
  const inventoryCardNumber = normalizeCardNumber(inventory.card_number)

  const playerMatches = Boolean(
    inventoryPlayer && checklistPlayers.includes(inventoryPlayer)
  )

  const cardNumberMatches = Boolean(
    checklistCardNumber &&
      inventoryCardNumber &&
      checklistCardNumber === inventoryCardNumber
  )

  // If both rows explicitly name a player, the wrong player can never be
  // rescued by a coincidental shared card number such as #5.
  if (
    checklistPlayers.length > 0 &&
    inventoryPlayer &&
    !checklistPlayers.includes(inventoryPlayer)
  ) {
    return null
  }

  if (hasExplicitProductConflict(checklist, inventory)) {
    return null
  }

  // A known conflicting card number is stronger negative evidence than a
  // matching player name is positive evidence.
  if (
    checklistCardNumber &&
    inventoryCardNumber &&
    checklistCardNumber !== inventoryCardNumber
  ) {
    return null
  }

  if (!playerMatches && !cardNumberMatches) return null

  const allowDefaultFamilyFallback =
    playerMatches &&
    cardNumberMatches &&
    !sectionNeedsIdentityEvidence(section) &&
    !clean(item.parallel_name) &&
    !clean(item.variation)

  if (
    !specialRequirementsCompatible(
      item,
      section,
      inventory,
      allowDefaultFamilyFallback
    )
  ) {
    return null
  }

  const reasons: CandidateReason[] = []
  let score = 0
  let strongEvidenceCount = 0

  if (cardNumberMatches) {
    score += 45
    strongEvidenceCount += 1
    reasons.push('card-number')
  }

  if (playerMatches) {
    score += 35
    strongEvidenceCount += 1
    reasons.push('structured-player')
  }

  const parallelEvidence = clean(item.parallel_name)
    ? specialEvidenceStrength(item.parallel_name, inventory)
    : 0
  const variationEvidence = clean(item.variation)
    ? specialEvidenceStrength(item.variation, inventory)
    : 0

  const hasSpecialChecklistRequirement =
    item.auto_flag === true ||
    item.relic_flag === true ||
    item.serial_flag === true ||
    Number(item.print_run ?? 0) > 0 ||
    Boolean(clean(item.parallel_name)) ||
    Boolean(clean(item.variation))

  let specialEvidenceMatched = false

  const sectionIdentity = sectionIdentityPhrase(section)
  const sectionIdentityMatched =
    Boolean(sectionIdentity) &&
    inventoryHasSectionIdentityEvidence(section, inventory)

  if (sectionIdentityMatched) {
    const identityStrength = specialEvidenceStrength(sectionIdentity, inventory)
    score += identityStrength >= 1 ? 24 : 18
    strongEvidenceCount += 1
    reasons.push('section')
  }

  if (clean(item.parallel_name) && parallelEvidence > 0) {
    score += parallelEvidence >= 1 ? 22 : 16
    specialEvidenceMatched = true
    reasons.push('parallel')
  }

  if (clean(item.variation) && variationEvidence > 0) {
    score += variationEvidence >= 1 ? 22 : 16
    specialEvidenceMatched = true
    reasons.push('variation')
  }

  if (item.auto_flag === true && inventoryHasAutoEvidence(inventory)) {
    score += 22
    specialEvidenceMatched = true
  }

  if (item.relic_flag === true && inventoryHasRelicEvidence(inventory)) {
    score += 22
    specialEvidenceMatched = true
  }

  if (
    (item.serial_flag === true || Number(item.print_run ?? 0) > 0) &&
    inventoryHasSerialEvidence(inventory, item.print_run)
  ) {
    score += 18
    specialEvidenceMatched = true
  }

  if (specialEvidenceMatched) {
    strongEvidenceCount += 1
  }

  if (itemTeamsCompatible(item, inventory, peopleByItemId)) {
    score += 9
    reasons.push('team')
  }

  if (
    normalizeYear(checklist.year) &&
    normalizeYear(inventory.year) &&
    normalizeYear(checklist.year) === normalizeYear(inventory.year)
  ) {
    score += 8
    reasons.push('year')
  }

  if (hasMeaningfulProductOverlap(checklist, inventory)) {
    score += 8
    reasons.push('product')
  }

  const sectionScore = sectionCompatibilityScore(section, inventory)

  if (sectionScore > 0 && !sectionIdentityMatched) {
    score += Math.min(sectionScore, 7)
    reasons.push('section')
  }

  // Two independent strong clues should be enough for a high-confidence
  // candidate even when fast-entry wording differs from the checklist.
  if (strongEvidenceCount >= 2 && score < 75) {
    score = 75
  }

  // Named/specific variations still require explicit evidence. If an exact
  // player + card-number match identifies the family but no variation evidence
  // exists, keep the least-special/default row instead of guessing a parallel.
  if (
    hasSpecialChecklistRequirement &&
    !specialEvidenceMatched &&
    !allowDefaultFamilyFallback
  ) {
    return null
  }

  const protectedVariant =
    checklistItemIsOrdinary(item) && looksLikeSpecialVariant(inventory)

  if (protectedVariant) {
    score = Math.min(score, PROTECTED_VARIANT_SCORE_CAP)
    reasons.push('variant-protected')

    if (score < 50) return null
  } else if (score < STRUCTURED_MATCH_MIN_SCORE) {
    return null
  }

  return {
    inventoryItemId: inventory.id,
    score: Math.min(score, 100),
    reasons,
    notesQuantity: null,
  }
}


type ChecklistCardFamily = 'paper' | 'chrome' | 'special' | 'unknown'

function checklistCardFamily(
  section: ChecklistSectionRow | null,
  item: ChecklistItemRow
): ChecklistCardFamily {
  const text = normalizeText(
    [section?.name, item.parallel_name, item.variation].filter(Boolean).join(' ')
  )

  if (
    item.auto_flag === true ||
    item.relic_flag === true ||
    item.serial_flag === true ||
    clean(item.parallel_name) ||
    clean(item.variation) ||
    /\b(auto|autograph|relic|patch|insert|parallel|variation|numbered|short print|ssp|sp)\b/.test(text)
  ) {
    return 'special'
  }

  if (/\bchrome\b/.test(text)) return 'chrome'

  if (
    /\bpaper\b/.test(text) ||
    /\bbase set\b/.test(text) ||
    /\bbase prospects?\b/.test(text) ||
    /\bprospects?\b/.test(text)
  ) {
    return 'paper'
  }

  return 'unknown'
}

function inventoryCardFamily(inventory: InventoryRow): 'paper' | 'chrome' | 'unknown' {
  const text = normalizeText(
    [inventory.title, inventory.brand, inventory.set_name, inventory.parallel_name, inventory.variation]
      .filter(Boolean)
      .join(' ')
  )

  if (/\bchrome\b/.test(text)) return 'chrome'
  if (/\bpaper\b/.test(text) || /\bbase\b/.test(text)) return 'paper'
  return 'unknown'
}

function groupedNotesFamilyCompatible(
  section: ChecklistSectionRow | null,
  item: ChecklistItemRow,
  inventory: InventoryRow
) {
  const checklistFamily = checklistCardFamily(section, item)
  const inventoryFamily = inventoryCardFamily(inventory)

  if (checklistFamily === 'chrome') return inventoryFamily === 'chrome'
  if (checklistFamily === 'paper') return inventoryFamily !== 'chrome'
  return checklistFamily === 'unknown'
}

function inventoryTextEvidence(inventory: InventoryRow) {
  return normalizeText(
    [
      inventory.title,
      inventory.brand,
      inventory.set_name,
      inventory.parallel_name,
      inventory.variation,
      inventory.notes,
      inventory.serial_number_text,
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function normalizeSpecialEvidence(value: unknown) {
  return normalizeText(value)
    .replace(/\brookie card\b/g, ' rookie ')
    .replace(/\brc\b/g, ' rookie ')
    .replace(/\brookies\b/g, ' rookie ')
    .replace(/\bautos?\b/g, ' autograph ')
    .replace(/\bautographs?\b/g, ' autograph ')
    .replace(/\bsigned\b/g, ' autograph ')
    .replace(/\bfirst bowman\b/g, ' 1st ')
    .replace(/\b1st bowman\b/g, ' 1st ')
    .replace(/\bfirst\b/g, ' 1st ')
    .replace(/\brefractors?\b/g, ' refractor ')
    .replace(/\bvariations?\b/g, ' ')
    .replace(/\bparallels?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function meaningfulSpecialTokens(value: unknown) {
  const ignored = new Set([
    'the', 'and', 'card', 'cards', 'set', 'edition', 'version',
    'chrome', 'prospect', 'prospects', 'base', 'variation', 'variations',
    'parallel', 'parallels',
  ])

  return normalizeSpecialEvidence(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !ignored.has(token))
}


function compactHobbyText(value: unknown) {
  return normalizeSpecialEvidence(value).replace(/\s+/g, '')
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = new Array<number>(right.length + 1)

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      )
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[right.length]
}

function hobbyTokenMatches(expected: string, actual: string) {
  if (!expected || !actual) return false
  if (expected === actual) return true

  const expectedCompact = expected.replace(/\s+/g, '')
  const actualCompact = actual.replace(/\s+/g, '')

  if (expectedCompact === actualCompact) return true

  const longest = Math.max(expectedCompact.length, actualCompact.length)
  if (longest < 5) return false

  const allowedDistance = longest >= 10 ? 2 : 1

  return levenshteinDistance(expectedCompact, actualCompact) <= allowedDistance
}

function evidenceHasHobbyToken(expected: string, evidenceTokens: string[]) {
  if (evidenceTokens.some((actual) => hobbyTokenMatches(expected, actual))) {
    return true
  }

  // Handles fast-entry spacing such as "pack fractor" vs "Packfractor".
  for (let index = 0; index < evidenceTokens.length - 1; index += 1) {
    const joined = `${evidenceTokens[index]}${evidenceTokens[index + 1]}`
    if (hobbyTokenMatches(expected, joined)) return true
  }

  return false
}

function specialEvidenceStrength(expected: unknown, inventory: InventoryRow) {
  const expectedTokens = meaningfulSpecialTokens(expected)
  if (expectedTokens.length === 0) return 0

  const evidenceTokens = normalizeSpecialEvidence(inventoryTextEvidence(inventory))
    .split(' ')
    .filter(Boolean)

  let matched = 0

  for (const expectedToken of expectedTokens) {
    if (evidenceHasHobbyToken(expectedToken, evidenceTokens)) {
      matched += 1
    }
  }

  if (matched === 0) {
    const expectedCompact = compactHobbyText(expected)
    const evidenceCompact = compactHobbyText(inventoryTextEvidence(inventory))

    if (
      expectedCompact.length >= 5 &&
      evidenceCompact.includes(expectedCompact)
    ) {
      return 1
    }

    return 0
  }

  return matched / expectedTokens.length
}

function inventoryHasNamedSpecialEvidence(expected: unknown, inventory: InventoryRow) {
  const expectedTokens = meaningfulSpecialTokens(expected)
  if (expectedTokens.length === 0) return false

  const strength = specialEvidenceStrength(expected, inventory)

  if (expectedTokens.length === 1) {
    return strength >= 1
  }

  // For a phrase such as "Red Rookie", require two agreeing hobby-language
  // concepts when available. For longer checklist wording, distinctive terms
  // such as "Packfractor" can carry the match even when generic words differ.
  return strength >= Math.min(1, 2 / expectedTokens.length)
}

function inventoryHasAutoEvidence(inventory: InventoryRow) {
  if (inventory.auto_flag === true) return true
  return /\b(auto|autograph|signed)\b/.test(inventoryTextEvidence(inventory))
}

function inventoryHasRelicEvidence(inventory: InventoryRow) {
  if (inventory.relic_flag === true) return true
  return /\b(relic|patch|jersey|memorabilia)\b/.test(inventoryTextEvidence(inventory))
}

function inventoryHasSerialEvidence(inventory: InventoryRow, printRun: number | null) {
  if (inventory.serial_flag === true || clean(inventory.serial_number_text)) {
    return true
  }

  const raw = [
    clean(inventory.title),
    clean(inventory.notes),
    clean(inventory.parallel_name),
    clean(inventory.variation),
  ].filter(Boolean).join(' ')

  if (printRun && printRun > 0) {
    const escaped = String(printRun).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const exactRun = new RegExp(`(?:/\\s*${escaped}\\b|\\b\\d+\\s*/\\s*${escaped}\\b)`)
    if (exactRun.test(raw)) return true
  }

  return /(?:\/\s*\d+\b|\b\d+\s*\/\s*\d+\b)/.test(raw)
}

function scoreNotesCandidate({
  checklist,
  item,
  section,
  inventory,
  peopleByItemId,
  parsedNotes,
}: {
  checklist: ChecklistRow
  item: ChecklistItemRow
  section: ChecklistSectionRow | null
  inventory: InventoryRow
  peopleByItemId: Map<string, ChecklistItemPersonRow[]>
  parsedNotes: Map<string, number>
}): ScoredCandidate | null {
  const namedSubsetSection = Boolean(sectionSubsetIdentity(section))

  // Grouped-note lots are useful beyond base/paper. If the checklist row is a
  // clearly named subset/insert (Bowman Sterling, Under The Radar, Top 100,
  // etc.), allow Notes-based player matching there too. sectionSubsetCompatible
  // below still requires the inventory lot to name the same subset, so a
  // Bowman Sterling lot cannot spill back into Base Set or another insert.
  if (!sectionLooksBaseLike(section) && !namedSubsetSection) return null
  if (!checklistItemIsOrdinary(item)) return null
  if (looksLikeSpecialVariant(inventory)) return null
  if (!groupedNotesFamilyCompatible(section, item, inventory)) return null
  if (!sameChecklistIdentity(checklist, inventory)) return null
  if (!sectionSubsetCompatible(section, inventory)) return null
  if (hasExplicitProductConflict(checklist, inventory)) return null

  // Notes can identify the player inside a grouped lot, but they cannot by
  // themselves prove that a Topps Finest/SMLB/etc. lot belongs to Bowman.
  if (!hasMeaningfulProductOverlap(checklist, inventory)) return null

  const checklistPlayers = getChecklistPlayerNames(item, peopleByItemId)

  let notesQuantity = 0

  for (const playerName of checklistPlayers) {
    notesQuantity = Math.max(notesQuantity, parsedNotes.get(playerName) ?? 0)
  }

  if (notesQuantity <= 0) return null

  const reasons: CandidateReason[] = ['notes-player']
  let score = 39

  const inventoryFamily = inventoryCardFamily(inventory)
  const checklistFamily = checklistCardFamily(section, item)

  if (
    (checklistFamily === 'paper' && inventoryFamily === 'paper') ||
    (checklistFamily === 'chrome' && inventoryFamily === 'chrome')
  ) {
    score += 7
    reasons.push('section')
  } else if (checklistFamily === 'paper' && inventoryFamily === 'unknown') {
    score += 3
  }

  const teamMatches = itemTeamsCompatible(item, inventory, peopleByItemId)

  if (teamMatches) {
    score += 12
    reasons.push('team')
  } else if (clean(item.printed_team) && clean(inventory.team)) {
    return null
  }

  if (
    normalizeYear(checklist.year) &&
    normalizeYear(inventory.year) &&
    normalizeYear(checklist.year) === normalizeYear(inventory.year)
  ) {
    score += 8
    reasons.push('year')
  }

  if (hasMeaningfulProductOverlap(checklist, inventory)) {
    score += 7
    reasons.push('product')
  }

  const sectionScore = sectionCompatibilityScore(section, inventory)

  if (sectionScore > 0) {
    score += Math.min(sectionScore, 6)
    reasons.push('section')
  }

  const notesEvidenceCount = [
    notesQuantity > 0,
    teamMatches,
    Boolean(
      normalizeYear(checklist.year) &&
        normalizeYear(inventory.year) &&
        normalizeYear(checklist.year) === normalizeYear(inventory.year)
    ),
    hasMeaningfulProductOverlap(checklist, inventory),
    inventoryFamily === checklistFamily ||
      (checklistFamily === 'paper' && inventoryFamily === 'unknown'),
  ].filter(Boolean).length

  if (notesEvidenceCount >= 2 && score < 70) {
    score = 70
  }

  if (score < NOTES_MATCH_MIN_SCORE) return null

  return {
    inventoryItemId: inventory.id,
    score: Math.min(score, 79),
    reasons,
    notesQuantity,
  }
}

function isGroupedInventoryCandidate(item: InventoryRow) {
  const quantity = Number(item.quantity ?? 0)
  const available = Number(item.available_quantity ?? 0)
  const title = normalizeText(item.title)
  const notesPlayers = parseGroupedPlayerNotes(item.notes)

  if (notesPlayers.size === 0) return false

  return (
    quantity > 1 ||
    available > 1 ||
    /\b(lot|base|team set|team lot|group)\b/.test(title)
  )
}

async function deleteOldAutomaticMatches({
  supabase,
  userId,
  checklistItemIds,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  checklistItemIds: string[]
}) {
  for (let index = 0; index < checklistItemIds.length; index += DELETE_BATCH_SIZE) {
    const batch = checklistItemIds.slice(index, index + DELETE_BATCH_SIZE)

    const { error } = await supabase
      .from('checklist_inventory_matches')
      .delete()
      .eq('user_id', userId)
      .eq('match_type', 'automatic')
      .in('checklist_item_id', batch)

    if (error) throw new Error(error.message)
  }
}

async function insertCandidateMatches({
  supabase,
  rows,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  rows: CandidateMatch[]
}) {
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE)

    const { error } = await supabase
      .from('checklist_inventory_matches')
      .upsert(batch, {
        onConflict: 'user_id,checklist_item_id,inventory_item_id',
        ignoreDuplicates: false,
      })

    if (error) throw new Error(error.message)
  }
}

/**
 * Candidate-only checklist matcher.
 *
 * It may write ONLY to checklist_inventory_matches.
 * It does not update inventory_items, inventory_transactions, sales, expenses,
 * builds, quantities, statuses, cost basis, COGS, or tax records.
 */
export async function runChecklistInventoryMatcher(
  checklistId: string
): Promise<ChecklistInventoryMatchResult> {
  const safeChecklistId = clean(checklistId)

  if (!safeChecklistId) {
    return {
      ok: false,
      code: 'invalid_checklist',
      error: 'A checklist ID is required.',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      code: 'not_authenticated',
      error: 'You must be signed in to match inventory.',
    }
  }

  const { data: checklistData, error: checklistError } = await supabase
    .from('checklists')
    .select('id, year, manufacturer, brand, product_name, name')
    .eq('id', safeChecklistId)
    .maybeSingle()

  if (checklistError) {
    return {
      ok: false,
      code: 'load_failed',
      error: checklistError.message,
    }
  }

  if (!checklistData) {
    return {
      ok: false,
      code: 'checklist_not_found',
      error: 'Checklist not found or you do not have permission to view it.',
    }
  }

  const checklist = checklistData as ChecklistRow

  try {
    const [sections, checklistItems, inventoryItems] = await Promise.all([
      loadAllRows<ChecklistSectionRow>((from, to) =>
        supabase
          .from('checklist_sections')
          .select('id, name, section_type')
          .eq('checklist_id', safeChecklistId)
          .order('sort_order', { ascending: true })
          .range(from, to)
      ),

      loadAllRows<ChecklistItemRow>((from, to) =>
        supabase
          .from('checklist_items')
          .select(`
            id,
            section_id,
            card_number,
            player_name,
            printed_team,
            parallel_name,
            variation,
            rookie_flag,
            auto_flag,
            relic_flag,
            serial_flag,
            print_run,
            quantity_required
          `)
          .eq('checklist_id', safeChecklistId)
          .order('sort_order', { ascending: true })
          .range(from, to)
      ),

      loadAllRows<InventoryRow>((from, to) =>
        supabase
          .from('inventory_items')
          .select(`
            id,
            status,
            title,
            player_name,
            year,
            brand,
            set_name,
            card_number,
            parallel_name,
            variation,
            team,
            quantity,
            available_quantity,
            notes,
            rookie_flag,
            auto_flag,
            relic_flag,
            serial_flag,
            serial_number_text
          `)
          .eq('user_id', user.id)
          .in('status', ['available', 'listed', 'personal', 'junk'])
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .range(from, to)
      ),
    ])

    const physicallyOwnedInventoryItems = inventoryItems.filter((inventory) => {
      const status = clean(inventory.status).toLowerCase()
      const available = Math.max(0, Number(inventory.available_quantity ?? 0))
      const quantity = Math.max(0, Number(inventory.quantity ?? 0))

      if (status === 'available' || status === 'listed') {
        return available > 0
      }

      if (status === 'personal' || status === 'junk') {
        return quantity > 0 || available > 0
      }

      return false
    })

    const people = await loadAllRows<ChecklistItemPersonRow>((from, to) =>
      supabase
        .from('checklist_item_people')
        .select(`
          checklist_item_id,
          player_name,
          printed_team,
          checklist_items!inner(checklist_id)
        `)
        .eq('checklist_items.checklist_id', safeChecklistId)
        .order('sort_order', { ascending: true })
        .range(from, to)
    )

    const sectionById = new Map(sections.map((section) => [section.id, section]))
    const peopleByItemId = buildChecklistPeopleMap(people)

    const inventoryByCardNumber = new Map<string, InventoryRow[]>()
    const inventoryByStructuredPlayer = new Map<string, InventoryRow[]>()
    const inventoryByNotesPlayer = new Map<string, InventoryRow[]>()
    const parsedNotesByInventoryId = new Map<string, Map<string, number>>()

    for (const inventory of physicallyOwnedInventoryItems) {
      const cardNumber = normalizeCardNumber(inventory.card_number)
      const playerName = normalizePlayerName(inventory.player_name)

      if (cardNumber) {
        addToMapArray(inventoryByCardNumber, cardNumber, inventory)
      }

      if (playerName) {
        addToMapArray(inventoryByStructuredPlayer, playerName, inventory)
      }

      if (isGroupedInventoryCandidate(inventory)) {
        const parsedNotes = parseGroupedPlayerNotes(inventory.notes)
        parsedNotesByInventoryId.set(inventory.id, parsedNotes)

        for (const playerNameFromNotes of parsedNotes.keys()) {
          addToMapArray(inventoryByNotesPlayer, playerNameFromNotes, inventory)
        }
      }
    }

    const matchRows: CandidateMatch[] = []
    let strongMatches = 0
    let notesDerivedMatches = 0
    let protectedVariantMatches = 0

    for (const item of checklistItems) {
      const section = item.section_id
        ? sectionById.get(item.section_id) ?? null
        : null

      const candidateInventoryRows: InventoryRow[] = []
      const cardNumber = normalizeCardNumber(item.card_number)

      if (cardNumber) {
        candidateInventoryRows.push(...(inventoryByCardNumber.get(cardNumber) ?? []))
      }

      const checklistPlayers = getChecklistPlayerNames(item, peopleByItemId)

      for (const playerName of checklistPlayers) {
        candidateInventoryRows.push(
          ...(inventoryByStructuredPlayer.get(playerName) ?? [])
        )
        candidateInventoryRows.push(
          ...(inventoryByNotesPlayer.get(playerName) ?? [])
        )
      }

      const uniqueCandidates = uniqueInventoryRows(candidateInventoryRows)

      for (const inventory of uniqueCandidates) {
        const parsedNotes =
          parsedNotesByInventoryId.get(inventory.id) ?? new Map<string, number>()

        const structuredMatch = scoreStructuredCandidate({
          checklist,
          item,
          section,
          inventory,
          peopleByItemId,
        })

        const notesMatch = scoreNotesCandidate({
          checklist,
          item,
          section,
          inventory,
          peopleByItemId,
          parsedNotes,
        })

        const winner =
          structuredMatch && notesMatch
            ? structuredMatch.score >= notesMatch.score
              ? structuredMatch
              : notesMatch
            : structuredMatch ?? notesMatch

        if (!winner) continue

        if (winner.score >= STRONG_MATCH_SCORE) {
          strongMatches += 1
        }

        if (winner.reasons.includes('notes-player')) {
          notesDerivedMatches += 1
        }

        if (winner.reasons.includes('variant-protected')) {
          protectedVariantMatches += 1
        }

        matchRows.push({
          user_id: user.id,
          checklist_item_id: item.id,
          inventory_item_id: inventory.id,
          match_score: winner.score,
          match_type: 'automatic',
          is_preferred: false,
        })
      }
    }

    try {
      await deleteOldAutomaticMatches({
        supabase,
        userId: user.id,
        checklistItemIds: checklistItems.map((item) => item.id),
      })

      await insertCandidateMatches({
        supabase,
        rows: matchRows,
      })
    } catch (error) {
      return {
        ok: false,
        code: 'write_failed',
        error:
          error instanceof Error
            ? error.message
            : 'Could not save checklist inventory candidates.',
      }
    }

    return {
      ok: true,
      checklistId: safeChecklistId,
      checklistItems: checklistItems.length,
      availableInventoryItems: physicallyOwnedInventoryItems.length,
      candidateMatches: matchRows.length,
      strongMatches,
      notesDerivedMatches,
      protectedVariantMatches,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Checklist matching failed.'

    return {
      ok: false,
      code: 'load_failed',
      error: message,
    }
  }
}
