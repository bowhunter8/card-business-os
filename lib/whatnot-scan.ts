export type ScanFormat = 'desktop_order' | 'mobile_order' | 'delivery_email' | 'unknown'

export type ExtractedWhatnotData = {
  detectedFormat: ScanFormat
  rawText: string
  normalizedText: string
  orderId: string | null
  trackingNumber: string | null
  seller: string | null
  orderDate: string | null
  total: number | null
  titles: string[]
}

type OrderCandidate = {
  id: string
  break_id: string | null
  order_id: string | null
  order_numeric_id: string | null
  seller: string | null
  product_name: string | null
  processed_date: string | null
  processed_date_display: string | null
  total: number | null
}

type BreakCandidate = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  notes: string | null
  total_cost: number | null
}

export function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitCleanLines(text: string) {
  return normalizeOcrText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }
  return null
}

function parseMoney(value: string | null) {
  if (!value) return null
  const cleaned = value.replace(/\$/g, '').replace(/,/g, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function detectFormat(lines: string[], normalizedText: string): ScanFormat {
  const lower = normalizedText.toLowerCase()

  if (
    lower.includes('your whatnot order has arrived') ||
    lower.includes('tracking id:') ||
    lower.includes('items in this shipment')
  ) {
    return 'delivery_email'
  }

  if (
    lower.includes('track your purchase') &&
    lower.includes('order details') &&
    (lower.includes('category') || lower.includes('qty'))
  ) {
    return 'mobile_order'
  }

  if (
    lower.includes('order details') &&
    lower.includes('shipment details') &&
    (lower.includes('track your purchase') || lower.includes('pending review'))
  ) {
    return 'desktop_order'
  }

  if (lines.some((line) => /order details/i.test(line))) {
    return 'desktop_order'
  }

  return 'unknown'
}

function extractOrderId(text: string) {
  return firstMatch(text, [
    /order\s*(?:id|number)\s*[:#]?\s*([0-9]{6,12})/i,
    /#\s*([0-9]{6,12})/i,
  ])
}

function extractTracking(text: string) {
  return firstMatch(text, [
    /track(?:ing)?\s*(?:your purchase|id|number)?\s*[:#]?\s*(9[0-9]{15,29})/i,
    /tracking\s*(?:id|number)\s*[:#]?\s*(9[0-9]{15,29})/i,
    /\b(9[0-9]{15,29})\b/,
  ])
}

function extractSeller(text: string) {
  return firstMatch(text, [
    /sold by\s+([a-z0-9._-]+)/i,
    /from\s+@([a-z0-9._-]+)/i,
    /@([a-z0-9._-]+)/i,
  ])
}

function extractOrderDate(text: string) {
  return firstMatch(text, [
    /order\s*date\s*[:#]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
    /order\s*date\s*[:#]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /processed\s*date\s*[:#]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ])
}

function extractTotal(text: string) {
  return parseMoney(
    firstMatch(text, [
      /order\s*total\s*\$?\s*([0-9,]+\.[0-9]{2})/i,
      /total\s*paid\s*\$?\s*([0-9,]+\.[0-9]{2})/i,
      /total\s*\$?\s*([0-9,]+\.[0-9]{2})/i,
    ])
  )
}

function isJunkTitleLine(line: string) {
  const lower = line.toLowerCase()

  if (!line) return true
  if (line.length < 8) return true
  if (/^(order details|shipment details|receipt|pending review|delivered today)$/i.test(line)) return true
  if (/^(order id|order number|order date|sold by|qty|quantity|category)$/i.test(line)) return true
  if (/^(track your purchase|message seller|get help|faq)$/i.test(line)) return true
  if (/^\$?[0-9,.]+$/.test(line)) return true
  if (/^[0-9]{6,}$/.test(line)) return true
  if (lower.includes('rapid city')) return true
  if (lower.includes('shipping to')) return true
  if (lower.includes('whatnot')) return true && !lower.includes('break')
  return false
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const key = value.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(value.trim())
  }

  return output
}

function extractTitles(lines: string[]) {
  const titles: string[] = []

  const shipmentIndex = lines.findIndex((line) =>
    /items in this shipment/i.test(line)
  )

  if (shipmentIndex >= 0) {
    for (let i = shipmentIndex + 1; i < Math.min(lines.length, shipmentIndex + 8); i += 1) {
      const line = lines[i]
      if (isJunkTitleLine(line)) continue
      titles.push(line)
    }
  }

  const orderDetailsIndex = lines.findIndex((line) =>
    /order details/i.test(line)
  )

  if (orderDetailsIndex >= 0) {
    for (let i = orderDetailsIndex + 1; i < Math.min(lines.length, orderDetailsIndex + 8); i += 1) {
      const line = lines[i]
      if (isJunkTitleLine(line)) continue
      if (/order\s*(?:id|number|date)/i.test(line)) break
      titles.push(line)
    }
  }

  for (const line of lines) {
    if (isJunkTitleLine(line)) continue

    if (
      /break|baseball|sports cards|heritage|edition|guardians|mariners|blue jays|brewers|auction/i.test(
        line
      )
    ) {
      titles.push(line)
    }
  }

  return dedupeStrings(titles).slice(0, 6)
}

export function extractWhatnotData(rawText: string): ExtractedWhatnotData {
  const normalizedText = normalizeOcrText(rawText)
  const lines = splitCleanLines(normalizedText)

  return {
    detectedFormat: detectFormat(lines, normalizedText),
    rawText,
    normalizedText,
    orderId: extractOrderId(normalizedText),
    trackingNumber: extractTracking(normalizedText),
    seller: extractSeller(normalizedText),
    orderDate: extractOrderDate(normalizedText),
    total: extractTotal(normalizedText),
    titles: extractTitles(lines),
  }
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string) {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'item',
    'items',
    'your',
    'from',
    'this',
    'that',
    'order',
    'details',
    'base',
    'card',
    'cards',
  ])

  return normalizeToken(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token))
}

function tokenOverlapScore(a: string, b: string) {
  const aTokens = new Set(tokenize(a))
  const bTokens = new Set(tokenize(b))

  if (aTokens.size === 0 || bTokens.size === 0) return 0

  let matches = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) matches += 1
  }

  return matches
}

function sameDateLoose(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false

  const aNorm = a.toLowerCase().replace(/,/g, '')
  const bNorm = b.toLowerCase().replace(/,/g, '')

  if (aNorm === bNorm) return true

  const bAsDate = new Date(b)
  if (!Number.isNaN(bAsDate.getTime())) {
    const month = bAsDate.toLocaleString('en-US', { month: 'short' }).toLowerCase()
    const day = String(bAsDate.getDate())
    const year = String(bAsDate.getFullYear())
    if (aNorm.includes(month) && aNorm.includes(day) && aNorm.includes(year)) {
      return true
    }
  }

  return false
}

function moneyClose(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return false
  return Math.abs(Number(a) - Number(b)) < 0.02
}

export function scoreWhatnotOrderMatch(
  extracted: ExtractedWhatnotData,
  order: OrderCandidate
) {
  let score = 0
  const reasons: string[] = []

  if (extracted.orderId) {
    if (order.order_id === extracted.orderId || order.order_numeric_id === extracted.orderId) {
      score += 100
      reasons.push('Exact order number match')
    }
  }

  if (extracted.seller && order.seller) {
    if (normalizeToken(extracted.seller) === normalizeToken(order.seller)) {
      score += 30
      reasons.push('Seller match')
    }
  }

  if (extracted.orderDate && sameDateLoose(extracted.orderDate, order.processed_date)) {
    score += 15
    reasons.push('Order date match')
  }

  if (moneyClose(extracted.total, order.total)) {
    score += 10
    reasons.push('Total match')
  }

  const extractedTitleText = extracted.titles.join(' ')
  const orderTitleText = order.product_name ?? ''
  const titleOverlap = tokenOverlapScore(extractedTitleText, orderTitleText)

  if (titleOverlap > 0) {
    score += Math.min(35, titleOverlap * 8)
    reasons.push(`Title overlap (${titleOverlap})`)
  }

  return { score, reasons }
}

export function scoreBreakMatch(
  extracted: ExtractedWhatnotData,
  breakRow: BreakCandidate
) {
  let score = 0
  const reasons: string[] = []

  if (extracted.orderId && breakRow.order_number === extracted.orderId) {
    score += 100
    reasons.push('Exact break order number match')
  }

  if (extracted.seller && breakRow.source_name) {
    if (normalizeToken(extracted.seller) === normalizeToken(breakRow.source_name)) {
      score += 30
      reasons.push('Breaker match')
    }
  }

  if (extracted.orderDate && sameDateLoose(extracted.orderDate, breakRow.break_date)) {
    score += 15
    reasons.push('Date match')
  }

  const extractedTitleText = extracted.titles.join(' ')
  const breakText = [breakRow.product_name, breakRow.notes].filter(Boolean).join(' ')
  const titleOverlap = tokenOverlapScore(extractedTitleText, breakText)

  if (titleOverlap > 0) {
    score += Math.min(35, titleOverlap * 8)
    reasons.push(`Title overlap (${titleOverlap})`)
  }

  return { score, reasons }
}