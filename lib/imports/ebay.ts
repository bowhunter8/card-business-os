export type EbayPreviewRow = {
  rowNumber: number
  orderNumber: string | null
  orderDate: string | null
  itemTitle: string
  buyer: string | null
  quantity: number
  grossSale: number
  shippingCharged: number
  platformFees: number
  postageCost: number
  netProceeds: number
  notes: string
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

  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10)
  }

  const parts = value.split(/[\/-]/).map((v) => v.trim())
  if (parts.length === 3) {
    const [a, b, c] = parts
    const year = c.length === 2 ? `20${c}` : c
    const maybe = new Date(`${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`)
    if (!Number.isNaN(maybe.getTime())) {
      return maybe.toISOString().slice(0, 10)
    }
  }

  return null
}

function feeTotal(row: Record<string, string>) {
  const candidates = [
    'Fees',
    'Fee',
    'Total fees',
    'Final value fee - fixed',
    'Final value fee - variable',
    'Final value fee',
    'Per order fee',
    'Promoted Listings Standard fee',
    'Promoted Listings Advanced fee',
    'International fee',
    'Regulatory operating fee',
    'Very high item not as described fee',
  ]

  let total = 0

  candidates.forEach((header) => {
    total += parseMoney(getValue(row, [header]))
  })

  if (total > 0) return total

  return parseMoney(
    getValue(row, ['Fees', 'Fee amount', 'Total fees', 'Selling costs'])
  )
}

export function buildEbayPreviewRows(text: string) {
  const { headers, rows } = parseCsv(text)

  const previewRows: EbayPreviewRow[] = rows.map((row, index) => {
    const orderNumber =
      getValue(row, ['Order number', 'Order ID', 'Sales record number']) || null

    const orderDate = toIsoDate(
      getValue(row, ['Order date', 'Date sold', 'Sale date', 'Created date'])
    )

    const itemTitle =
      getValue(row, ['Item title', 'Title', 'Listing title', 'Item name']) ||
      'Imported eBay item'

    const buyer =
      getValue(row, ['Buyer username', 'Buyer', 'Buyer name', 'Username']) || null

    const quantity = parseIntSafe(
      getValue(row, ['Quantity', 'Quantity sold', 'Qty']),
      1
    )

    const grossSale = parseMoney(
      getValue(row, ['Sale price', 'Item subtotal', 'Item price', 'Sold for'])
    )

    const shippingCharged = parseMoney(
      getValue(row, [
        'Shipping and handling',
        'Shipping',
        'Shipping paid by buyer',
        'Shipping charged',
      ])
    )

    const platformFees = feeTotal(row)

    const postageCost = parseMoney(
      getValue(row, [
        'Shipping label',
        'Shipping labels',
        'Label cost',
        'Postage',
        'Postage cost',
        'Shipping cost',
      ])
    )

    const noteParts = [
      'Imported from eBay CSV',
      orderNumber ? `Order ${orderNumber}` : null,
      buyer ? `Buyer ${buyer}` : null,
      itemTitle ? `Item ${itemTitle}` : null,
      getValue(row, ['Item ID', 'eBay item ID']) ? `Item ID ${getValue(row, ['Item ID', 'eBay item ID'])}` : null,
      getValue(row, ['Custom label (SKU)', 'SKU', 'Custom label']) ? `SKU ${getValue(row, ['Custom label (SKU)', 'SKU', 'Custom label'])}` : null,
    ].filter(Boolean)

    const netProceeds =
      grossSale + shippingCharged - platformFees - postageCost

    return {
      rowNumber: index + 2,
      orderNumber,
      orderDate,
      itemTitle,
      buyer,
      quantity,
      grossSale,
      shippingCharged,
      platformFees,
      postageCost,
      netProceeds,
      notes: noteParts.join(' | '),
      raw: row,
    }
  })

  return {
    headers,
    rows: previewRows,
  }
}