import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type CsvRow = Record<string, string>

type SkippedRow = {
  row: number
  item: string
  reason: string
}

type WarningRow = {
  row: number
  item: string
  warning: string
}

type ImportResult = {
  imported: number
  skipped: number
  errors: string[]
  duplicates: number
  warnings: number
  skippedRows: SkippedRow[]
  warningRows: WarningRow[]
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (char === ',' && !insideQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

function parseCsv(text: string) {
  const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleanText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return { headers: [], rows: [] as CsvRow[] }
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index]?.trim() || ''
      return row
    }, {})
  })

  return { headers, rows }
}

function toNumber(value: string | undefined) {
  const cleaned = String(value || '').replace(/[$,]/g, '').trim()
  if (!cleaned) return Number.NaN

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : Number.NaN
}

function cleanText(value: string | undefined) {
  return String(value || '').trim()
}

function firstValue(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const value = cleanText(row[key])
    if (value) return value
  }

  return ''
}

function getItemName(row: CsvRow) {
  return firstValue(row, ['item', 'player_item_name', 'player', 'item_name', 'title'])
}

function getPurchasePrice(row: CsvRow) {
  return toNumber(firstValue(row, ['purchase_price', 'cost_basis', 'cost', 'price_paid']))
}

function addSkipped(result: ImportResult, row: number, item: string, reason: string) {
  result.skipped += 1
  result.errors.push(`Row ${row}: ${reason}`)
  result.skippedRows.push({
    row,
    item: item || '—',
    reason,
  })
}

function addDuplicateSkipped(result: ImportResult, row: number, item: string) {
  result.skipped += 1
  result.duplicates += 1
  result.skippedRows.push({
    row,
    item: item || '—',
    reason: 'This exact CSV row was already imported.',
  })
}

function buildCsvRowFingerprint(row: CsvRow) {
  const normalizedRow = Object.keys(row)
    .sort()
    .map((key) => `${key}:${cleanText(row[key]).toLowerCase()}`)
    .join('|')

  return createHash('sha256')
    .update(normalizedRow)
    .digest('hex')
    .slice(0, 24)
}

function buildSourceReference(row: CsvRow) {
  return `csv-row:${buildCsvRowFingerprint(row)}`
}

function getInventoryItemType(row: CsvRow, quantity: number) {
  const explicitType = cleanText(row.item_type)

  const allowedTypes = new Set([
    'single_card',
    'multi_quantity_card',
    'bulk_lot_line',
    'team_lot_line',
    'insert_lot_line',
    'common_lot_line',
    'sealed_item',
    'set_piece',
  ])

  if (allowedTypes.has(explicitType)) {
    return explicitType
  }

  const category = cleanText(row.category).toLowerCase()
  const item = getItemName(row).toLowerCase()

  if (
    category.includes('sealed') ||
    item.includes('sealed') ||
    item.includes('box') ||
    item.includes('pack') ||
    item.includes('blaster') ||
    item.includes('mega')
  ) {
    return 'sealed_item'
  }

  if (
    category.includes('lot') ||
    item.includes(' lot') ||
    item.endsWith('lot') ||
    quantity > 1
  ) {
    return 'multi_quantity_card'
  }

  return 'single_card'
}

function buildNotes(row: CsvRow) {
  const notes = cleanText(row.notes)
  const purchaseDate = cleanText(row.purchase_date || row.date_purchased)
  const category = cleanText(row.category)
  const subcategory = cleanText(row.subcategory)
  const platform = cleanText(row.platform)
  const orderNumber = cleanText(row.order_number)

  const extras = [
    purchaseDate ? `Purchase Date: ${purchaseDate}` : '',
    category ? `Category: ${category}` : '',
    subcategory ? `Subcategory: ${subcategory}` : '',
    platform ? `Platform: ${platform}` : '',
    orderNumber ? `Order Number: ${orderNumber}` : '',
  ].filter(Boolean)

  if (notes && extras.length > 0) {
    return `${notes}\n\nCSV Import Details: ${extras.join(' | ')}`
  }

  if (notes) return notes
  if (extras.length > 0) return `CSV Import Details: ${extras.join(' | ')}`

  return null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'CSV file is required.' }, { status: 400 })
  }

  const text = await file.text()
  const { headers, rows } = parseCsv(text)

  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json({ error: 'CSV file does not contain any inventory rows.' }, { status: 400 })
  }

  const hasItemColumn = ['item', 'player_item_name', 'player', 'item_name', 'title'].some((header) =>
    headers.includes(header)
  )
  const hasPurchasePriceColumn = ['purchase_price', 'cost_basis', 'cost', 'price_paid'].some((header) =>
    headers.includes(header)
  )

  if (!hasItemColumn || !hasPurchasePriceColumn) {
    const missingHeaders = [
      !hasItemColumn ? 'item' : null,
      !hasPurchasePriceColumn ? 'purchase_price' : null,
    ].filter(Boolean)

    return NextResponse.json(
      {
        error: `Missing required column${missingHeaders.length === 1 ? '' : 's'}: ${missingHeaders.join(', ')}`,
      },
      { status: 400 },
    )
  }

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: 0,
    warnings: 0,
    skippedRows: [],
    warningRows: [],
  }

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2
    const itemName = getItemName(row)
    const purchasePrice = getPurchasePrice(row)
    const quantityRaw = firstValue(row, ['quantity', 'qty'])
    const parsedQuantity = toNumber(quantityRaw)
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? Math.max(1, Math.floor(parsedQuantity))
      : 1

    if (!itemName) {
      addSkipped(result, rowNumber, itemName, 'Item is required.')
      continue
    }

    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      addSkipped(result, rowNumber, itemName, 'Purchase Price must be a valid number.')
      continue
    }

    const sourceReference = buildSourceReference(row)

    const { data: existingImportRow, error: duplicateCheckError } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('source_type', 'csv_import')
      .eq('source_reference', sourceReference)
      .is('deleted_at', null)
      .maybeSingle()

    if (duplicateCheckError) {
      addSkipped(result, rowNumber, itemName, `Could not check whether this CSV row was already imported: ${duplicateCheckError.message}`)
      continue
    }

    if (existingImportRow) {
      addDuplicateSkipped(result, rowNumber, itemName)
      continue
    }

    const costBasisTotal = purchasePrice * quantity
    const purchaseSource = firstValue(row, ['purchased_from', 'purchase_source', 'source', 'platform'])
    const now = new Date().toISOString()

    const insertPayload = {
      user_id: user.id,
      source_type: 'csv_import',
      source_reference: sourceReference,
      item_type: getInventoryItemType(row, quantity),
      status: cleanText(row.status) || 'available',
      quantity,
      available_quantity: quantity,
      title: itemName,
      player_name: cleanText(row.player_item_name || row.player || row.item_name) || itemName,
      year: cleanText(row.year) || null,
      brand: cleanText(row.brand) || null,
      set_name: cleanText(row.set_name || row.set || row.product) || null,
      card_number: cleanText(row.card_number || row.item_number || row.number) || null,
      parallel_name: cleanText(row.parallel_name || row.parallel) || null,
      variation: cleanText(row.variation) || null,
      team: cleanText(row.team) || null,
      condition_note: cleanText(row.condition || row.condition_note) || null,
      purchase_source: purchaseSource || 'CSV Import',
      cost_basis_unit: purchasePrice,
      cost_basis_total: costBasisTotal,
      estimated_value_unit: null,
      estimated_value_total: null,
      storage_location: cleanText(row.location || row.storage_location) || null,
      tax_lot_method: cleanText(row.tax_lot_method) || 'specific',
      notes: buildNotes(row),
      created_at: now,
      updated_at: now,
    }

    const { error: insertError } = await supabase.from('inventory_items').insert(insertPayload)

    if (insertError) {
      addSkipped(result, rowNumber, itemName, insertError.message)
      continue
    }

    result.imported += 1
  }

  return NextResponse.json(result)
}
