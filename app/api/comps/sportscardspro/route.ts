import { NextRequest, NextResponse } from 'next/server'

type SearchPayload = {
  q?: string
  query?: string
  year?: string | number
  setName?: string
  playerName?: string
  cardNumber?: string
  parallel?: string
  brand?: string
  limit?: number
  card?: {
    year?: string | number
    brand?: string
    setName?: string
    playerName?: string
    player_name?: string
    cardNumber?: string
    card_number?: string
    parallel?: string
  }
}

type NormalizedInput = {
  q: string
  year?: string
  brand?: string
  setName?: string
  playerName?: string
  cardNumber?: string
  parallel?: string
  limit: number
}

type SportsCardsProEstimate = {
  title: string
  sourceUrl: string
  ungraded: number | null
  grade7?: number | null
  grade8?: number | null
  grade9?: number | null
  grade95?: number | null
  psa10?: number | null
  confidence: number
  reason: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SearchPayload
    const input = normalizePayload(body)

    if (!input.q) {
      return NextResponse.json(
        {
          ok: false,
          provider: 'sportscardspro',
          warnings: ['Not enough card details to search SportsCardsPro.'],
          searchUrl: buildSportsCardsProSearchUrl(''),
          estimate: null,
          estimates: [],
        },
        { status: 400 }
      )
    }

    const searchUrl = buildSportsCardsProSearchUrl(input.q)

    let response: Response
    try {
      response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Referer: 'https://www.sportscardspro.com/',
        },
        cache: 'no-store',
      })
    } catch (error) {
      return NextResponse.json({
        ok: false,
        provider: 'sportscardspro',
        blocked: true,
        query: input.q,
        searchUrl,
        estimate: null,
        estimates: [],
        warnings: [
          error instanceof Error
            ? error.message
            : 'SportsCardsPro automatic lookup failed before the page loaded.',
          'Open SportsCardsPro manually, review the Ungraded value, then use Manual Apply.',
        ],
      })
    }

    const html = await response.text()

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        provider: 'sportscardspro',
        blocked: response.status === 403,
        query: input.q,
        searchUrl,
        estimate: null,
        estimates: [],
        warnings: [
          `SportsCardsPro automatic lookup failed with status ${response.status}.`,
          response.status === 403
            ? 'SportsCardsPro opened in your browser, but blocked the app server from reading the page automatically. Use Open SportsCardsPro and Manual Apply.'
            : 'Open SportsCardsPro manually, review the Ungraded value, then use Manual Apply.',
        ],
        debug: {
          status: response.status,
          sample: sanitizeHtmlSample(html),
        },
      })
    }

    const estimates = parseSportsCardsProHtml(html, input)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, input.limit)

    const best = estimates[0] ?? null

    if (!best || best.ungraded == null) {
      return NextResponse.json({
        ok: false,
        provider: 'sportscardspro',
        query: input.q,
        searchUrl,
        estimate: best,
        estimates,
        warnings: [
          'SportsCardsPro page loaded, but no reliable Ungraded value could be read automatically.',
          'Open SportsCardsPro manually, review the Ungraded value, then use Manual Apply.',
        ],
      })
    }

    return NextResponse.json({
      ok: true,
      provider: 'sportscardspro',
      query: input.q,
      searchUrl: best.sourceUrl || searchUrl,
      estimate: best,
      estimates,
      warnings:
        best.confidence < 0.45
          ? ['Low-confidence SportsCardsPro match. Review the opened source page before applying.']
          : [],
    })
  } catch (error) {
    console.error('SportsCardsPro route error:', error)

    return NextResponse.json(
      {
        ok: false,
        provider: 'sportscardspro',
        estimate: null,
        estimates: [],
        warnings: [
          error instanceof Error
            ? error.message
            : 'Unexpected server error while searching SportsCardsPro.',
        ],
      },
      { status: 500 }
    )
  }
}

function normalizePayload(body: SearchPayload): NormalizedInput {
  const nested = body.card || {}

  const year = cleanText(body.year) || cleanText(nested.year)
  const brand = cleanText(body.brand) || cleanText(nested.brand)
  const setName = cleanText(body.setName) || cleanText(nested.setName)
  const playerName =
    cleanText(body.playerName) || cleanText(nested.playerName) || cleanText(nested.player_name)
  const cardNumber =
    cleanText(body.cardNumber) || cleanText(nested.cardNumber) || cleanText(nested.card_number)
  const parallel = cleanText(body.parallel) || cleanText(nested.parallel)

  const q =
    cleanText(body.q) ||
    cleanText(body.query) ||
    buildQueryFromParts([year, brand, setName, playerName, cardNumber, parallel])

  return {
    q: q || '',
    year,
    brand,
    setName,
    playerName,
    cardNumber,
    parallel,
    limit:
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? clamp(Math.floor(body.limit), 1, 10)
        : 5,
  }
}

function buildSportsCardsProSearchUrl(query: string) {
  const url = new URL('https://www.sportscardspro.com/search-products')
  url.searchParams.set('q', query)
  url.searchParams.set('type', 'prices')
  return url.toString()
}

function parseSportsCardsProHtml(html: string, input: NormalizedInput): SportsCardsProEstimate[] {
  const rows = extractTableRows(html)
  const estimates: SportsCardsProEstimate[] = []

  for (const row of rows) {
    const cells = extractCells(row)
    if (cells.length < 3) continue

    const link = firstMatch(row, /<a[^>]+href=["']([^"']+)["'][^>]*>/i)
    const title = htmlDecode(cells[0] || firstMatch(row, /<a[^>]*>([\s\S]*?)<\/a>/i) || '')
    if (!title || /collection|wishlist/i.test(title)) continue

    const prices = cells.map((cell) => parseMoneyValue(htmlDecode(cell)))
    const ungraded = firstPositive(prices)

    const sourceUrl = link ? absolutizeSportsCardsProUrl(link) : buildSportsCardsProSearchUrl(input.q)
    const confidenceInfo = scoreSportsCardsProTitle(title, input)

    if (ungraded == null) continue

    estimates.push({
      title,
      sourceUrl,
      ungraded,
      grade7: null,
      grade8: null,
      grade9: prices[prices.length >= 3 ? prices.length - 2 : 2] ?? null,
      grade95: null,
      psa10: prices[prices.length - 1] ?? null,
      confidence: confidenceInfo.confidence,
      reason: confidenceInfo.reason,
    })
  }

  const directTitle = htmlDecode(
    firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
      ''
  )

  const directUngraded = parseLabelPrice(html, 'Ungraded')
  if (directTitle && directUngraded != null) {
    const confidenceInfo = scoreSportsCardsProTitle(directTitle, input)
    estimates.unshift({
      title: directTitle.replace(/\s*Prices.*$/i, '').trim(),
      sourceUrl: buildSportsCardsProSearchUrl(input.q),
      ungraded: directUngraded,
      grade7: parseLabelPrice(html, 'Grade 7'),
      grade8: parseLabelPrice(html, 'Grade 8'),
      grade9: parseLabelPrice(html, 'Grade 9'),
      grade95: parseLabelPrice(html, 'Grade 9.5'),
      psa10: parseLabelPrice(html, 'PSA 10'),
      confidence: confidenceInfo.confidence,
      reason: confidenceInfo.reason,
    })
  }

  return dedupeEstimates(estimates)
}

function extractTableRows(html: string) {
  const rows: string[] = []
  const regex = /<tr[\s\S]*?<\/tr>/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html))) {
    rows.push(match[0])
  }

  return rows.slice(0, 200)
}

function extractCells(row: string) {
  const cells: string[] = []
  const regex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(row))) {
    cells.push(match[1])
  }

  return cells
}

function parseLabelPrice(html: string, label: string) {
  const escaped = escapeRegExp(label)
  const regexes = [
    new RegExp(`${escaped}[\\s\\S]{0,240}?\\$\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i'),
    new RegExp(`\\$\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)[\\s\\S]{0,160}?${escaped}`, 'i'),
  ]

  for (const regex of regexes) {
    const match = html.match(regex)
    if (match?.[1]) return parseMoneyValue(match[1])
  }

  return null
}

function scoreSportsCardsProTitle(title: string, input: NormalizedInput) {
  const normalized = normalizeForMatch(title)
  let score = 0.05
  const reason: string[] = []

  if (input.playerName && phraseOrWordsMatch(normalized, input.playerName)) {
    score += 0.45
    reason.push('player')
  }

  if (input.year && normalized.includes(` ${normalizeForMatch(input.year).trim()} `)) {
    score += 0.1
    reason.push('year')
  }

  if (input.setName && phraseOrWordsMatch(normalized, input.setName)) {
    score += 0.18
    reason.push('set')
  }

  if (input.brand && phraseOrWordsMatch(normalized, input.brand)) {
    score += 0.08
    reason.push('brand')
  }

  if (input.cardNumber && matchesCardNumber(title, input.cardNumber)) {
    score += 0.15
    reason.push('card number')
  }

  if (input.parallel && phraseOrWordsMatch(normalized, input.parallel)) {
    score += 0.08
    reason.push('parallel')
  }

  return {
    confidence: Math.max(0, Math.min(1, round3(score))),
    reason,
  }
}

function phraseOrWordsMatch(normalizedTitle: string, value: string) {
  const normalizedValue = normalizeForMatch(value).trim()
  if (!normalizedValue) return false
  if (normalizedTitle.includes(` ${normalizedValue} `)) return true

  const words = normalizedValue.split(' ').filter((word) => word.length >= 3)
  if (words.length === 0) return false
  return words.every((word) => normalizedTitle.includes(` ${word} `))
}

function matchesCardNumber(title: string, cardNumber: string) {
  const raw = cleanText(cardNumber)?.replace(/^#/, '')
  if (!raw) return false
  const escaped = escapeRegExp(raw)
  return new RegExp(`(?:#|no\\.?\\s*)${escaped}\\b|\\b${escaped}\\b`, 'i').test(title)
}

function dedupeEstimates(estimates: SportsCardsProEstimate[]) {
  const seen = new Set<string>()
  const out: SportsCardsProEstimate[] = []

  for (const estimate of estimates) {
    const key = `${normalizeForMatch(estimate.title)}|${estimate.ungraded ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(estimate)
  }

  return out
}

function firstPositive(values: Array<number | null>) {
  for (const value of values) {
    if (value != null && value > 0) return value
  }
  return null
}

function parseMoneyValue(text: string) {
  if (!text) return null
  const cleaned = text.replace(/,/g, '')
  const match = cleaned.match(/\$?\s*([0-9][0-9]*(?:\.[0-9]{1,2})?)/)
  if (!match?.[1]) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

function buildQueryFromParts(parts: Array<string | undefined>) {
  return parts.map(cleanText).filter(Boolean).join(' ')
}

function cleanText(value?: string | number | null) {
  if (value == null) return undefined
  const cleaned = String(value).replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}

function htmlDecode(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstMatch(text: string, regex: RegExp) {
  const match = text.match(regex)
  return match?.[1] ?? null
}

function normalizeForMatch(value: string) {
  return ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9#./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `
}

function absolutizeSportsCardsProUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value
  return `https://www.sportscardspro.com${value.startsWith('/') ? value : `/${value}`}`
}

function sanitizeHtmlSample(html: string) {
  return html.replace(/\s+/g, ' ').replace(/></g, '> <').slice(0, 1200)
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
