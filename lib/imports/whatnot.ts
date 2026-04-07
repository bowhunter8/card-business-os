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

function cleanHeader(value: string) {
  return value.replace(/\uFEFF/g, '').trim()
}

function normalizeHeader(value: string) {
  return cleanHeader(value)
    .toLowerCase()
    .replace(/[\s/_-]+/g, ' ')
    .trim()
}

function parseCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

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
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result
}

export function parseCsv(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim() !== '')

  if (lines.length === 0) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] }
  }

  const headers = parseCsvLine(lines[0]).map(cleanHeader)

  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
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
    const value = normalizedMap.get(normalizeHeader(candidate))
    if (value != null && value !== '') {
      return value
    }
  }

  return ''
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
      const orderId = getValue(row, ['order id'])
      if (!orderId) return null

      return {
        rowNumber: index + 2,
        orderId,
        orderNumericId: getValue(row, ['order numeric id']) || null,
        processedDate: toIsoDate(getValue(row, ['processed date'])),
        processedDateDisplay: toDisplayDate(getValue(row, ['processed date'])),
        seller: getValue(row, ['seller']) || null,
        productName:
          getValue(row, ['product name']) || 'Imported Whatnot order',
        subtotal: parseMoney(getValue(row, ['subtotal'])),
        shippingPrice: parseMoney(getValue(row, ['shipping price'])),
        taxes: parseMoney(getValue(row, ['taxes'])),
        total: parseMoney(getValue(row, ['total'])),
        quantity: parseIntSafe(getValue(row, ['quantity']), 1),
        orderStatus: getValue(row, ['order status']) || null,
        raw: row,
      }
    })
    .filter((row): row is WhatnotPreviewRow => Boolean(row))

  return {
    headers,
    rows: previewRows,
  }
}