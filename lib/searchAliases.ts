export const SEARCH_PHRASE_ALIASES: Array<[RegExp, string]> = [
  [/\ba\s+and\s+g\b/g, 'ag'],
  [/\ballen\s+and\s+ginter\b/g, 'ag'],
  [/\ballen\s+ginter\b/g, 'ag'],
  [/\bb\s+and\s+w\b/g, 'bw'],
  [/\bblack\s+and\s+white\b/g, 'bw'],
  [/\ba\s+s\b/g, 'as'],
  [/\boakland\s+athletics\b/g, 'athletics'],
  [/\bsacramento\s+athletics\b/g, 'athletics'],
  [/\bchicago\s+white\s+sox\b/g, 'whitesox'],
  [/\bwhite\s+sox\b/g, 'whitesox'],
  [/\bboston\s+red\s+sox\b/g, 'redsox'],
  [/\bred\s+sox\b/g, 'redsox'],
  [/\bd\s+backs\b/g, 'dbacks'],
]

const SEARCH_TOKEN_ALIASES: Record<string, string[]> = {
  auto: ['autograph', 'autographed'],
  autograph: ['auto', 'autographed'],
  autographed: ['auto', 'autograph'],

  rc: ['rookie'],
  rookie: ['rc'],

  refractor: ['refr'],
  refr: ['refractor'],

  jr: ['junior'],
  junior: ['jr'],

  as: ['athletics'],
  athletics: ['as'],

  dbacks: ['diamondbacks'],
  diamondbacks: ['dbacks'],

  chisox: ['whitesox'],
  whitesox: ['chisox'],

  bosox: ['redsox'],
  redsox: ['bosox'],

  mariner: ['mariners'],
  mariners: ['mariner'],

  yankee: ['yankees'],
  yankees: ['yankee'],

  dodger: ['dodgers'],
  dodgers: ['dodger'],

  met: ['mets'],
  mets: ['met'],

  padre: ['padres'],
  padres: ['padre'],

  phillie: ['phillies'],
  phillies: ['phillie'],

  guardian: ['guardians'],
  guardians: ['guardian'],

  twin: ['twins'],
  twins: ['twin'],

  royal: ['royals'],
  royals: ['royal'],

  ranger: ['rangers'],
  rangers: ['ranger'],

  tiger: ['tigers'],
  tigers: ['tiger'],

  brewer: ['brewers'],
  brewers: ['brewer'],

  national: ['nationals'],
  nationals: ['national'],

  cardinal: ['cardinals'],
  cardinals: ['cardinal'],

  cub: ['cubs'],
  cubs: ['cub'],

  giant: ['giants'],
  giants: ['giant'],

  ray: ['rays'],
  rays: ['ray'],

  oriole: ['orioles'],
  orioles: ['oriole'],

  pirate: ['pirates'],
  pirates: ['pirate'],

  brave: ['braves'],
  braves: ['brave'],

  angel: ['angels'],
  angels: ['angel'],

  astro: ['astros'],
  astros: ['astro'],

  rockie: ['rockies'],
  rockies: ['rockie'],

  marlin: ['marlins'],
  marlins: ['marlin'],

  ag: ['allen', 'ginter'],
  bw: ['black', 'white'],
}

export function normalizeSearchText(
  value: string | number | null | undefined
) {
  return String(value ?? '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeSearchAliasPhrases(
  value: string | number | null | undefined
) {
  let normalized = normalizeSearchText(value)

  for (const [pattern, replacement] of SEARCH_PHRASE_ALIASES) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized.replace(/\s+/g, ' ').trim()
}

export function buildSearchTokenVariants(token: string) {
  const normalizedToken = normalizeSearchAliasPhrases(token)
  const variants = new Set<string>([normalizedToken])

  if (normalizedToken.endsWith('s') && normalizedToken.length > 3) {
    variants.add(normalizedToken.slice(0, -1))
  }

  if (!normalizedToken.endsWith('s') && normalizedToken.length > 3) {
    variants.add(`${normalizedToken}s`)
  }

  for (const alias of SEARCH_TOKEN_ALIASES[normalizedToken] ?? []) {
    variants.add(alias)
  }

  return Array.from(variants).filter(Boolean)
}

export function buildSearchTokens(
  value: string,
  options?: {
    minLength?: number
    limit?: number
    escapeToken?: (token: string) => string
  }
) {
  const minLength = options?.minLength ?? 2
  const limit = options?.limit ?? 10
  const escapeToken = options?.escapeToken ?? ((token: string) => token)

  return Array.from(
    new Set(
      normalizeSearchAliasPhrases(value)
        .split(' ')
        .map((token) => escapeToken(token.trim()))
        .filter((token) => token.length >= minLength)
    )
  ).slice(0, limit)
}

export function buildSearchableText(
  values: Array<string | number | null | undefined>
) {
  return normalizeSearchAliasPhrases(
    values.map((value) => String(value ?? '')).join(' ')
  )
}

export function tokenMatchesSearchableText(
  searchableText: string,
  token: string
) {
  return buildSearchTokenVariants(token).some((variant) =>
    searchableText.includes(variant)
  )
}

export function matchesAllSearchTokens(
  searchableText: string,
  tokens: string[]
) {
  if (tokens.length === 0) return true

  return tokens.every((token) =>
    tokenMatchesSearchableText(searchableText, token)
  )
}

export function tokenMatchScore(
  searchableText: string,
  tokens: string[]
) {
  if (tokens.length === 0) return 0

  return tokens.reduce((score, token) => {
    let bestScore = 0

    for (const variant of buildSearchTokenVariants(token)) {
      if (searchableText.includes(` ${variant} `)) {
        bestScore = Math.max(
          bestScore,
          variant === token ? 6 : 4
        )
      } else if (searchableText.includes(variant)) {
        bestScore = Math.max(
          bestScore,
          variant === token ? 3 : 2
        )
      }
    }

    return score + bestScore
  }, 0)
}

export function buildYearSearchAliases(
  value: string | number | null | undefined
) {
  const normalized = normalizeSearchAliasPhrases(value)
  const years = new Set<string>()

  for (const token of normalized.split(' ')) {
    if (/^\d{4}$/.test(token)) {
      years.add(token)
      continue
    }

    const seasonMatch = token.match(/^(\d{4})-(\d{2})$/)
    if (!seasonMatch) continue

    const startYear = Number(seasonMatch[1])
    const endYearTwoDigits = Number(seasonMatch[2])
    const century = Math.floor(startYear / 100) * 100
    let endYear = century + endYearTwoDigits

    if (endYear < startYear) {
      endYear += 100
    }

    years.add(String(startYear))
    years.add(String(endYear))
  }

  return Array.from(years)
}
