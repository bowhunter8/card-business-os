import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type SearchParams = Promise<{
  q?: string | string[]
}>

type ChecklistRow = {
  id: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  name: string
  is_active: boolean
}

type ChecklistItemRow = {
  id: string
  checklist_id: string
  section_id: string | null
  card_number: string | null
  player_name: string
  printed_team: string | null
  variation: string | null
  parallel_name: string | null
  notes: string | null
  print_run: string | null
  rookie_flag: boolean | null
  auto_flag: boolean | null
  relic_flag: boolean | null
  serial_flag: boolean | null
}

type ChecklistSectionRow = {
  id: string
  checklist_id: string
  name: string
}

type SearchResult = {
  item: ChecklistItemRow
  checklist: ChecklistRow
  sectionName: string
  score: number
}

type ChecklistMatch = {
  checklist: ChecklistRow
  score: number
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function normalize(value: string | null | undefined) {
  return clean(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeCardNumber(value: string | null | undefined) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function checklistTitle(checklist: ChecklistRow) {
  return (
    clean(checklist.name) ||
    [clean(checklist.year), clean(checklist.brand), clean(checklist.product_name)]
      .filter(Boolean)
      .join(' ') ||
    'Untitled Checklist'
  )
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

function splitQuery(query: string) {
  return normalize(query).split(' ').filter(Boolean)
}

function isRookieToken(token: string) {
  return token === 'rc' || token === 'rookie' || token === 'rookies'
}

function isAutoToken(token: string) {
  return (
    token === 'auto' ||
    token === 'autos' ||
    token === 'autograph' ||
    token === 'autographs'
  )
}

function isRelicToken(token: string) {
  return (
    token === 'relic' ||
    token === 'relics' ||
    token === 'mem' ||
    token === 'memorabilia'
  )
}

function isSerialToken(token: string) {
  return (
    token === 'numbered' ||
    token === 'serial' ||
    token === 'serialnumbered'
  )
}

function isFlagToken(token: string) {
  return (
    isRookieToken(token) ||
    isAutoToken(token) ||
    isRelicToken(token) ||
    isSerialToken(token)
  )
}

function checklistSearchText(checklist: ChecklistRow) {
  return normalize(
    [
      checklist.year,
      checklist.manufacturer,
      checklist.brand,
      checklist.product_name,
      checklist.name,
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function checklistSearchTokens(checklist: ChecklistRow) {
  return new Set(checklistSearchText(checklist).split(' ').filter(Boolean))
}

function itemMatchesFlagToken(item: ChecklistItemRow, token: string) {
  if (isRookieToken(token)) return item.rookie_flag === true
  if (isAutoToken(token)) return item.auto_flag === true
  if (isRelicToken(token)) return item.relic_flag === true
  if (isSerialToken(token)) return item.serial_flag === true
  return false
}

function scoreChecklistMatch(query: string, checklist: ChecklistRow) {
  const tokens = splitQuery(query).filter((token) => !isFlagToken(token))
  if (tokens.length === 0) return 0

  const text = checklistSearchText(checklist)
  const title = normalize(checklistTitle(checklist))
  const product = normalize(checklist.product_name)
  const brand = normalize(checklist.brand)
  const manufacturer = normalize(checklist.manufacturer)
  const year = normalize(checklist.year)
  const words = checklistSearchTokens(checklist)

  for (const token of tokens) {
    if (!text.includes(token)) return 0
  }

  let score = tokens.length * 25
  const normalizedQuery = normalize(query)

  if (title === normalizedQuery) score += 300
  else if (title.startsWith(normalizedQuery)) score += 180
  else if (title.includes(normalizedQuery)) score += 140

  if (product === normalizedQuery) score += 220
  else if (product.startsWith(normalizedQuery)) score += 130
  else if (product.includes(normalizedQuery)) score += 100

  for (const token of tokens) {
    if (year === token) score += 45
    if (brand === token) score += 25
    if (manufacturer === token) score += 20
    if (words.has(token)) score += 15
  }

  return score
}

function scoreResult(
  query: string,
  item: ChecklistItemRow,
  checklist: ChecklistRow,
  sectionName: string
) {
  const tokens = splitQuery(query)
  if (tokens.length === 0) return 0

  const cardNumber = normalizeCardNumber(item.card_number)
  const player = normalize(item.player_name)
  const team = normalize(item.printed_team)
  const section = normalize(sectionName)
  const checklistText = checklistSearchText(checklist)
  const variation = normalize(item.variation)
  const parallel = normalize(item.parallel_name)
  const notes = normalize(item.notes)
  const printRun = normalize(item.print_run)

  const generalText = [
    player,
    team,
    section,
    checklistText,
    variation,
    parallel,
    notes,
    printRun,
  ].join(' ')

  for (const token of tokens) {
    if (isFlagToken(token)) {
      if (!itemMatchesFlagToken(item, token)) return 0
      continue
    }

    const compact = token.replace(/[^a-z0-9]/g, '')

    if (
      !generalText.includes(token) &&
      !(compact && cardNumber.includes(compact))
    ) {
      return 0
    }
  }

  let score = tokens.length * 10
  const normalizedQuery = normalize(query)
  const compactQuery = normalizeCardNumber(query)

  if (compactQuery && cardNumber === compactQuery) score += 120
  if (normalizedQuery === player) score += 100

  for (const token of tokens) {
    const compact = token.replace(/[^a-z0-9]/g, '')

    if (isFlagToken(token)) {
      score += 30
      continue
    }

    if (compact && cardNumber === compact) score += 55
    if (player.split(' ').includes(token)) score += 22
    else if (player.includes(token)) score += 12

    if (normalize(checklist.year) === token) score += 10
    if (checklistText.includes(token)) score += 7
    if (team.includes(token)) score += 5
    if (section.includes(token)) score += 4
  }

  return score
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, '')
}

function chooseStrongItemToken(tokens: string[], productMatchedTokens: Set<string>) {
  const nonFlags = tokens.filter(
    (token) => !isFlagToken(token) && !productMatchedTokens.has(token)
  )

  const likelyCardNumber = nonFlags.find((token) => {
    const compact = token.replace(/[^a-z0-9]/g, '')
    return (
      compact.length >= 2 &&
      /\d/.test(compact) &&
      /[a-z]/.test(compact)
    )
  })

  if (likelyCardNumber) return likelyCardNumber

  const likelyName = nonFlags
    .filter((token) => !/^\d{4}$/.test(token))
    .filter((token) => token.length >= 2)
    .sort((a, b) => b.length - a.length)[0]

  return likelyName ?? ''
}

function tokensSatisfiedByChecklist(query: string, checklist: ChecklistRow) {
  const text = checklistSearchText(checklist)
  return new Set(
    splitQuery(query).filter(
      (token) => !isFlagToken(token) && text.includes(token)
    )
  )
}

function queryLooksProductOnly(query: string, matches: ChecklistMatch[]) {
  if (matches.length === 0) return false

  const nonFlagTokens = splitQuery(query).filter((token) => !isFlagToken(token))
  if (nonFlagTokens.length === 0) return false

  return matches.some((match) => {
    const text = checklistSearchText(match.checklist)
    return nonFlagTokens.every((token) => text.includes(token))
  })
}

async function loadCandidateItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  candidateChecklistIds: string[],
  productMatchedTokens: Set<string>
) {
  const tokens = splitQuery(query)
  const strongToken = chooseStrongItemToken(tokens, productMatchedTokens)
  const hasRookie = tokens.some(isRookieToken)
  const hasAuto = tokens.some(isAutoToken)
  const hasRelic = tokens.some(isRelicToken)
  const hasSerial = tokens.some(isSerialToken)

  let request = supabase
    .from('checklist_items')
    .select(
      'id, checklist_id, section_id, card_number, player_name, printed_team, variation, parallel_name, notes, print_run, rookie_flag, auto_flag, relic_flag, serial_flag'
    )
    .limit(750)

  if (candidateChecklistIds.length > 0 && candidateChecklistIds.length <= 100) {
    request = request.in('checklist_id', candidateChecklistIds)
  }

  if (hasRookie) request = request.eq('rookie_flag', true)
  if (hasAuto) request = request.eq('auto_flag', true)
  if (hasRelic) request = request.eq('relic_flag', true)
  if (hasSerial) request = request.eq('serial_flag', true)

  if (strongToken) {
    const safe = escapeLike(strongToken)
    request = request.or(
      [
        `player_name.ilike.%${safe}%`,
        `card_number.ilike.%${safe}%`,
        `printed_team.ilike.%${safe}%`,
        `variation.ilike.%${safe}%`,
        `parallel_name.ilike.%${safe}%`,
        `notes.ilike.%${safe}%`,
      ].join(',')
    )
  }

  const { data, error } = await request

  if (error) {
    throw new Error(`Unable to search checklist cards: ${error.message}`)
  }

  return (data ?? []) as ChecklistItemRow[]
}

export default async function ChecklistSearchPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const params = await searchParams
  const query = firstParam(params.q).trim()

  const { data: checklistData, error: checklistError } = await supabase
    .from('checklists')
    .select('id, year, manufacturer, brand, product_name, name, is_active')
    .eq('is_active', true)

  const checklists = (checklistData ?? []) as ChecklistRow[]
  const checklistById = new Map(checklists.map((row) => [row.id, row]))

  const checklistMatches: ChecklistMatch[] = query
    ? checklists
        .map((checklist) => ({
          checklist,
          score: scoreChecklistMatch(query, checklist),
        }))
        .filter((row) => row.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return checklistTitle(a.checklist).localeCompare(
            checklistTitle(b.checklist),
            undefined,
            { numeric: true, sensitivity: 'base' }
          )
        })
        .slice(0, 40)
    : []

  const productOnlySearch = queryLooksProductOnly(query, checklistMatches)

  let results: SearchResult[] = []
  let searchError = ''

  if (query && !checklistError && !productOnlySearch) {
    try {
      const candidateChecklistIds = checklistMatches.map(
        (match) => match.checklist.id
      )

      const productMatchedTokens =
        checklistMatches.length > 0
          ? tokensSatisfiedByChecklist(query, checklistMatches[0].checklist)
          : new Set<string>()

      const items = await loadCandidateItems(
        supabase,
        query,
        candidateChecklistIds,
        productMatchedTokens
      )

      const sectionIds = Array.from(
        new Set(items.map((item) => clean(item.section_id)).filter(Boolean))
      )

      let sectionById = new Map<string, string>()

      if (sectionIds.length > 0) {
        const { data: sectionData, error: sectionError } = await supabase
          .from('checklist_sections')
          .select('id, checklist_id, name')
          .in('id', sectionIds)

        if (sectionError) {
          throw new Error(
            `Unable to load checklist sections: ${sectionError.message}`
          )
        }

        sectionById = new Map(
          ((sectionData ?? []) as ChecklistSectionRow[]).map((section) => [
            section.id,
            section.name,
          ])
        )
      }

      results = items
        .map((item) => {
          const checklist = checklistById.get(item.checklist_id)
          if (!checklist) return null

          const sectionName = item.section_id
            ? sectionById.get(item.section_id) ?? ''
            : ''

          const score = scoreResult(query, item, checklist, sectionName)
          if (score <= 0) return null

          return {
            item,
            checklist,
            sectionName,
            score,
          } satisfies SearchResult
        })
        .filter((row): row is SearchResult => row !== null)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score

          const titleCompare = checklistTitle(a.checklist).localeCompare(
            checklistTitle(b.checklist),
            undefined,
            { numeric: true, sensitivity: 'base' }
          )

          if (titleCompare !== 0) return titleCompare

          return clean(a.item.card_number).localeCompare(
            clean(b.item.card_number),
            undefined,
            { numeric: true, sensitivity: 'base' }
          )
        })
        .slice(0, 250)
    } catch (error) {
      searchError =
        error instanceof Error
          ? error.message
          : 'Unable to search the HITS checklist library.'
    }
  }

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Checklist Search Results</h1>
          <p className="app-subtitle">
            Start with a year, product, or shorthand. HITS will show matching
            checklists first, or search cards when you include player, card,
            team, section, or card-attribute details.
          </p>
        </div>

        <Link href="/app/checklists" className="app-button">
          Checklist Library
        </Link>
      </div>

      <section className="app-section space-y-4">
        <form
          method="get"
          action="/app/checklists/search"
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoFocus
            autoComplete="off"
            placeholder="Try: 2026 Topps Finest, Chrome, Kurtz RC, ATT-2..."
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-600"
          />

          <button type="submit" className="app-button-primary">
            Search
          </button>
        </form>

        {checklistError && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
            Unable to load the checklist library: {checklistError.message}
          </div>
        )}

        {searchError && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
            {searchError}
          </div>
        )}

        {!query && !checklistError && !searchError && (
          <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5 text-sm text-zinc-400">
            Enter anything you know. Product searches are matched against known
            HITS checklists before HITS searches individual cards.
          </div>
        )}

        {query && !checklistError && (
          <div className="space-y-5">
            {checklistMatches.length > 0 && (
              <div className="space-y-3">
                <div>
                  <div className="font-semibold text-zinc-100">
                    Matching Checklists
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {checklistMatches.length === 40
                      ? 'Showing the top 40 known checklist matches.'
                      : `${checklistMatches.length} known checklist${
                          checklistMatches.length === 1 ? '' : 's'
                        } match your search.`}{' '}
                    Keep typing to narrow the product, or open the checklist you
                    want.
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {checklistMatches.map(({ checklist }) => (
                    <Link
                      key={checklist.id}
                      href={`/app/checklists/${checklist.id}`}
                      prefetch={false}
                      className="rounded-xl border border-cyan-950 bg-zinc-950/70 p-4 transition hover:border-cyan-700 hover:bg-zinc-900/80"
                    >
                      <div className="font-semibold text-zinc-100">
                        {checklistTitle(checklist)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {checklistMeta(checklist)}
                      </div>
                      <div className="mt-3 text-sm font-semibold text-cyan-300">
                        Open Checklist →
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {!productOnlySearch && !searchError && (
              <div className="space-y-3">
                <div className="border-t border-zinc-800 pt-4">
                  <div className="font-semibold text-zinc-100">
                    Matching Cards
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {results.length === 250
                      ? 'Showing the top 250 card matches'
                      : `${results.length} card match${
                          results.length === 1 ? '' : 'es'
                        }`}
                    {' for '}
                    <span className="font-semibold text-zinc-200">
                      “{query}”
                    </span>
                  </div>
                </div>

                {results.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5">
                    <div className="font-semibold text-zinc-200">
                      No individual checklist cards matched that search.
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">
                      Try fewer words, a card number, player name, team, section,
                      or product term. RC/rookie, auto/autograph, relic, and
                      numbered are recognized as card attributes.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-zinc-800">
                    <div className="divide-y divide-zinc-800">
                      {results.map((result) => {
                        const details = [
                          clean(result.sectionName),
                          clean(result.item.printed_team),
                          result.item.rookie_flag ? 'RC' : '',
                          result.item.auto_flag ? 'Autograph' : '',
                          result.item.relic_flag ? 'Relic' : '',
                          clean(result.item.variation),
                          clean(result.item.parallel_name),
                          clean(result.item.print_run),
                        ].filter(Boolean)

                        const cardSearch = [
                          clean(result.item.card_number),
                          clean(result.item.player_name),
                        ]
                          .filter(Boolean)
                          .join(' ')

                        const href = `/app/checklists/${
                          result.checklist.id
                        }?q=${encodeURIComponent(cardSearch)}`

                        return (
                          <Link
                            key={result.item.id}
                            href={href}
                            prefetch={false}
                            className="grid gap-2 px-4 py-3 transition hover:bg-zinc-900/70 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-zinc-100">
                                {checklistTitle(result.checklist)}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500">
                                {checklistMeta(result.checklist)}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                {clean(result.item.card_number) && (
                                  <span className="font-semibold text-cyan-300">
                                    #{result.item.card_number}
                                  </span>
                                )}

                                <span className="font-semibold text-zinc-100">
                                  {result.item.player_name}
                                </span>
                              </div>

                              {details.length > 0 && (
                                <div className="mt-1 text-xs text-zinc-400">
                                  {Array.from(new Set(details)).join(' • ')}
                                </div>
                              )}
                            </div>

                            <span className="text-sm font-semibold text-cyan-300">
                              Open Checklist →
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {productOnlySearch && checklistMatches.length > 0 && (
              <div className="rounded-xl border border-cyan-950 bg-cyan-950/10 p-4 text-sm text-zinc-300">
                HITS recognized this as a checklist/product search, so it did
                not run the heavier all-card search. Add a player, card number,
                team, section, RC, auto, relic, or other card detail to search
                inside the matching checklist products.
              </div>
            )}

            {!searchError &&
              checklistMatches.length === 0 &&
              results.length === 0 && (
                <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5">
                  <div className="font-semibold text-zinc-200">
                    No checklist or card matched that search.
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">
                    Try fewer words or another known year, product, player,
                    card number, team, or section.
                  </p>
                </div>
              )}
          </div>
        )}
      </section>
    </div>
  )
}
