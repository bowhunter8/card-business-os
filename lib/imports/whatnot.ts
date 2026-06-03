export type WhatnotPreviewRow = {
  rowNumber: number
  orderId: string
  orderNumericId: string | null
  processedDate: string | null
  processedDateDisplay: string | null
  seller: string | null
  productName: string
  subtotal: number
  shippingPrice: number
  taxes: number
  total: number
  quantity: number
  orderStatus: string | null
  raw: Record<string, string>
}

export const WHATNOT_PARSER_VERSION =
  'whatnot-parser-2026-06-03-duplicate-headers-plus-row-fallback'

function cleanHeader(value: string) {
  return value.replace(/\uFEFF/g, '').trim()
}

function normalizeHeader(value: string) {
  return cleanHeader(value)
    .toLowerCase()
    .replace(/[\s/_-]+/g, ' ')
    .trim()
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeCandidate(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function sanitizeOrderIdLike(value: unknown) {
  const cleaned = cleanText(decodeCandidate(String(value ?? '')))
    .replace(/\s+/g, '')
    .trim()

  if (!cleaned) return null
  if (cleaned.includes(',')) return null
  if (
    /UTC|USD|direct_order|completed|imported|subtotal|shipping|tax|seller|product|quantity|category/i.test(
      cleaned
    )
  ) {
    return null
  }

  return cleaned
}

function sanitizeNumericOrderId(value: unknown) {
  const cleaned = cleanText(String(value ?? ''))
  if (!cleaned) return null

  const digitsOnly = cleaned.replace(/\D/g, '')
  if (!digitsOnly) return null
  if (digitsOnly.length < 6) return null

  return digitsOnly
}

function looksLikeWhatnotOrderId(value: unknown) {
  const cleaned = sanitizeOrderIdLike(value)
  if (!cleaned) return null

  if (cleaned.length < 12 || cleaned.length > 40) return null
  if (!/[A-Za-z]/.test(cleaned)) return null
  if (!/[0-9]/.test(cleaned)) return null
  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) return null

  return cleaned
}

function parseCsvRecords(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const records: string[][] = []
  let record: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]
    const next = normalized[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      record.push(current)
      current = ''
      continue
    }

    if (char === '\n' && !inQuotes) {
      record.push(current)

      if (record.some((value) => value.trim() !== '')) {
        records.push(record)
      }

      record = []
      current = ''
      continue
    }

    current += char
  }

  record.push(current)

  if (record.some((value) => value.trim() !== '')) {
    records.push(record)
  }

  return records
}

function makeUniqueHeaders(headers: string[]) {
  const seenHeaders = new Map<string, number>()

  return headers.map((header, index) => {
    const cleaned = cleanHeader(header)
    const normalized = normalizeHeader(cleaned)
    const seenCount = seenHeaders.get(normalized) ?? 0

    seenHeaders.set(normalized, seenCount + 1)

    if (seenCount === 0) {
      return cleaned || `column_${index + 1}`
    }

    return `${cleaned || `column_${index + 1}`}__duplicate_${seenCount + 1}`
  })
}

export function parseCsv(text: string) {
  const records = parseCsvRecords(text)

  if (records.length === 0) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] }
  }

  const headers = makeUniqueHeaders(records[0])

  const rows = records.slice(1).map((values) => {
    const row: Record<string, string> = {}

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? '').trim()
    })

    return row
  })

  return { headers, rows }
}

function getValue(row: Record<string, string>, candidates: string[]) {
  const normalizedMap = new Map<string, string>()

  Object.keys(row).forEach((key) => {
    normalizedMap.set(normalizeHeader(key), row[key])
  })

  for (const candidate of candidates) {
    const candidateKey = normalizeHeader(candidate)

    for (const [normalizedKey, value] of normalizedMap.entries()) {
      if (
        normalizedKey === candidateKey ||
        normalizedKey.startsWith(`${candidateKey} duplicate`)
      ) {
        if (value != null && value !== '') {
          return value
        }
      }
    }
  }

  return ''
}

function getFallbackOrderId(row: Record<string, string>) {
  for (const value of Object.values(row)) {
    const candidate = looksLikeWhatnotOrderId(value)
    if (candidate) return candidate
  }

  return null
}

function getFallbackNumericOrderId(row: Record<string, string>, orderId: string | null) {
  for (const value of Object.values(row)) {
    const cleaned = cleanText(value)

    if (!cleaned) continue
    if (orderId && cleaned === orderId) continue
    if (/[A-Za-z]/.test(cleaned)) continue

    const candidate = sanitizeNumericOrderId(cleaned)
    if (candidate) return candidate
  }

  return null
}

function parseMoney(value: string) {
  if (!value) return 0

  const cleaned = value
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\(/g, '-')
    .replace(/\)/g, '')
    .trim()

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseIntSafe(value: string, fallback = 0) {
  const parsed = Number(String(value).trim())
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function toIsoDate(value: string) {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

function toDisplayDate(value: string) {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const year = String(parsed.getFullYear()).slice(-2)

  return `${month}/${day}/${year}`
}

export function buildWhatnotPreviewRows(text: string) {
  const { headers, rows } = parseCsv(text)

  const previewRows: WhatnotPreviewRow[] = rows
    .map((row, index) => {
      const headerOrderId = sanitizeOrderIdLike(
        getValue(row, [
          'order id',
          'order',
          'whatnot order id',
          'transaction id',
          'id',
          'orderid',
          'order_id',
          'order identifier',
          'transaction',
          'purchase id',
          'purchase identifier',
        ])
      )

      const orderId = headerOrderId || getFallbackOrderId(row)

      if (!orderId) return null

      const headerNumericOrderId = sanitizeNumericOrderId(
        getValue(row, [
          'order numeric id',
          'order number',
          'numeric order id',
          'order #',
          'order no',
          'order id numeric',
          'number',
          'numeric id',
          'purchase number',
          'purchase id',
          'id number',
          'order_number',
        ])
      )

      return {
        rowNumber: index + 2,
        orderId,
        orderNumericId: headerNumericOrderId || getFallbackNumericOrderId(row, orderId),
        processedDate: toIsoDate(getValue(row, ['processed date'])),
        processedDateDisplay: toDisplayDate(getValue(row, ['processed date'])),
        seller: cleanText(getValue(row, ['seller'])) || null,
        productName:
          cleanText(getValue(row, ['product name'])) || 'Imported Whatnot order',
        subtotal: parseMoney(getValue(row, ['subtotal'])),
        shippingPrice: parseMoney(getValue(row, ['shipping price'])),
        taxes: parseMoney(getValue(row, ['taxes'])),
        total: parseMoney(getValue(row, ['total'])),
        quantity: parseIntSafe(getValue(row, ['quantity']), 1),
        orderStatus: cleanText(getValue(row, ['order status'])) || null,
        raw: row,
      }
    })
    .filter((row): row is WhatnotPreviewRow => Boolean(row))

  return {
    headers,
    rows: previewRows,
    parserVersion: WHATNOT_PARSER_VERSION,
  }
}