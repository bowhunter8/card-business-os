import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildWhatnotPreviewRows } from '@/lib/imports/whatnot'

type ImportBody = {
  csvText: string
  fileName?: string
}

const ROUTE_VERSION = 'whatnot-import-route-2026-06-03-order-id-only-dedupe'

function parseMoneyLike(value: unknown) {
  const parsed = Number(String(value ?? '0').replace(/\$/g, '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function createHitsImportId() {
  return randomUUID()
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
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

  if (!cleaned) return null
  if (cleaned.includes(',')) return null
  if (/\s/.test(cleaned)) return null
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

function summarizeRowForDebug(row: unknown) {
  if (!row || typeof row !== 'object') return null

  const candidate = row as {
    orderId?: unknown
    orderNumericId?: unknown
    order_id?: unknown
    order_numeric_id?: unknown
    seller?: unknown
    productName?: unknown
    product_name?: unknown
    total?: unknown
    raw?: Record<string, unknown>
  }

  return {
    orderId: candidate.orderId ?? candidate.order_id ?? null,
    orderNumericId: candidate.orderNumericId ?? candidate.order_numeric_id ?? null,
    seller: candidate.seller ?? null,
    productName: candidate.productName ?? candidate.product_name ?? null,
    total: candidate.total ?? null,
    rawKeys: candidate.raw ? Object.keys(candidate.raw).slice(0, 30) : [],
  }
}

async function readImportBody(request: NextRequest): Promise<ImportBody> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Partial<ImportBody>

    return {
      csvText: typeof body.csvText === 'string' ? body.csvText : '',
      fileName: typeof body.fileName === 'string' ? body.fileName : undefined,
    }
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await request.formData()

    const csvTextField = formData.get('csvText')
    const fileField = formData.get('file')
    const fileNameField = formData.get('fileName')

    let csvText = ''
    let fileName: string | undefined

    if (typeof csvTextField === 'string' && csvTextField.trim()) {
      csvText = csvTextField
    }

    if (fileField instanceof File) {
      csvText = await fileField.text()
      fileName = fileField.name || undefined
    }

    if (!fileName && typeof fileNameField === 'string' && fileNameField.trim()) {
      fileName = fileNameField.trim()
    }

    return {
      csvText,
      fileName,
    }
  }

  return {
    csvText: '',
    fileName: undefined,
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', routeVersion: ROUTE_VERSION }, { status: 401 })
    }

    const body = await readImportBody(request)

    if (!body.csvText || typeof body.csvText !== 'string') {
      return NextResponse.json(
        { error: 'CSV text or uploaded CSV file is required', routeVersion: ROUTE_VERSION },
        { status: 400 }
      )
    }

    const parsed = buildWhatnotPreviewRows(body.csvText)

    if (!parsed.rows || parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'No Whatnot rows found in CSV', routeVersion: ROUTE_VERSION },
        { status: 400 }
      )
    }

    const sanitizedRows = parsed.rows
      .map((row) => {
        const sanitizedOrderId = sanitizeOrderIdLike(row.orderId)
        const sanitizedOrderNumericId = sanitizeNumericOrderId(row.orderNumericId)

        return {
          ...row,
          orderId: sanitizedOrderId,
          orderNumericId: sanitizedOrderNumericId,
        }
      })
      .filter((row) => row.orderId)

    const uniqueParsedRows: typeof sanitizedRows = []
    const seenOrderIds = new Set<string>()
    let skippedCsvDuplicates = 0

    for (const row of sanitizedRows) {
      const orderId = typeof row.orderId === 'string' ? row.orderId.trim() : ''

      if (!orderId) {
        continue
      }

      if (seenOrderIds.has(orderId)) {
        skippedCsvDuplicates += 1
        continue
      }

      seenOrderIds.add(orderId)
      uniqueParsedRows.push(row)
    }

    if (uniqueParsedRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid unique Whatnot order IDs found in CSV', routeVersion: ROUTE_VERSION },
        { status: 400 }
      )
    }

    const uniqueOrderIds = uniqueParsedRows.map((row) => row.orderId).filter(Boolean) as string[]

    const existingRows: Array<{
      order_id: string | null
      order_numeric_id: string | null
    }> = []

    const orderIdChunks = chunkArray(uniqueOrderIds, 100)

    for (const orderIdChunk of orderIdChunks) {
      const { data, error } = await supabase
        .from('whatnot_orders')
        .select('order_id, order_numeric_id')
        .eq('user_id', user.id)
        .in('order_id', orderIdChunk)

      if (error) {
        console.error('Whatnot import existing order_id lookup failed:', error)
        return NextResponse.json(
          {
            error: `Failed checking existing orders: ${error.message}`,
            routeVersion: ROUTE_VERSION,
          },
          { status: 500 }
        )
      }

      if (data?.length) {
        existingRows.push(...data)
      }
    }

    const existingOrderSet = new Set(
      existingRows
        .map((row) => (row.order_id ? String(row.order_id).trim() : ''))
        .filter(Boolean)
    )

    const skippedExamples: string[] = []

    const rowsToInsert = uniqueParsedRows
      .filter((row) => {
        if (!row.orderId) return false

        const orderId = String(row.orderId).trim()
        const orderAlreadyExists = existingOrderSet.has(orderId)

        if (orderAlreadyExists) {
          if (skippedExamples.length < 500) {
            skippedExamples.push(`order:${orderId}`)
          }

          return false
        }

        return true
      })
      .map((row) => ({
        user_id: user.id,
        hits_import_id: createHitsImportId(),
        order_id: row.orderId,
        order_numeric_id: row.orderNumericId,
        buyer: row.raw?.['buyer'] ?? null,
        seller: row.seller,
        product_name: row.productName,
        product_description: row.raw?.['product description'] ?? null,
        product_category: row.raw?.['product category'] ?? null,
        processed_date: row.processedDate,
        processed_date_display: row.processedDateDisplay,
        order_status: row.orderStatus,
        order_style: row.raw?.['order style'] ?? null,
        order_currency: row.raw?.['order currency'] ?? null,
        sold_price: parseMoneyLike(row.raw?.['sold price']),
        quantity: row.quantity,
        subtotal: row.subtotal,
        shipping_price: row.shippingPrice,
        taxes: row.taxes,
        taxes_currency: row.raw?.['taxes currency'] ?? null,
        credits_applied: parseMoneyLike(row.raw?.['credits applied']),
        total: row.total,
        source_file_name: body.fileName?.trim() || null,
        notes: [
          'Imported from Whatnot CSV',
          row.orderId ? `Order ${row.orderId}` : null,
          row.orderNumericId ? `Order Numeric ${row.orderNumericId}` : null,
          row.seller ? `Seller ${row.seller}` : null,
          row.productName ? `Product ${row.productName}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
      }))

    const skippedExistingDuplicates = uniqueParsedRows.filter(
      (row) => row.orderId && existingOrderSet.has(String(row.orderId).trim())
    ).length

    const skippedDuplicates = skippedCsvDuplicates + skippedExistingDuplicates

    const debugTargetOrderId = '7ttAxgffe8VRCDuA9V3cy8'
    const debugTargetNumericId = '1034007068'

    const rowMatchesDebugTarget = (row: unknown) => {
      try {
        const text = JSON.stringify(row)
        return text.includes(debugTargetOrderId) || text.includes(debugTargetNumericId)
      } catch {
        return false
      }
    }

    const importDebug = {
      routeVersion: ROUTE_VERSION,
      fileName: body.fileName ?? null,
      parsedRows: parsed.rows.length,
      sanitizedRows: sanitizedRows.length,
      uniqueParsedRows: uniqueParsedRows.length,
      existingRows: existingRows.length,
      rowsToInsert: rowsToInsert.length,
      skippedCsvDuplicates,
      skippedExistingDuplicates,
      duplicateMode: 'order_id_only_numeric_id_is_stored_but_not_blocking',
      targetOrderId: debugTargetOrderId,
      targetNumericOrderId: debugTargetNumericId,
      csvTextContainsTargetOrderId: body.csvText.includes(debugTargetOrderId),
      csvTextContainsTargetNumericId: body.csvText.includes(debugTargetNumericId),
      targetParsedRow: summarizeRowForDebug(parsed.rows.find(rowMatchesDebugTarget)),
      targetSanitizedRow: summarizeRowForDebug(sanitizedRows.find(rowMatchesDebugTarget)),
      targetUniqueRow: summarizeRowForDebug(uniqueParsedRows.find(rowMatchesDebugTarget)),
      targetExistingRow: summarizeRowForDebug(existingRows.find(rowMatchesDebugTarget)),
      targetInsertRow: summarizeRowForDebug(rowsToInsert.find(rowMatchesDebugTarget)),
      sampleSkippedExamples: skippedExamples.slice(0, 20),
    }

    console.info('Whatnot import debug:', importDebug)

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        routeVersion: ROUTE_VERSION,
        imported: 0,
        skippedDuplicates,
        skippedExamples,
        importDebug,
        message: 'No new Whatnot orders to import.',
      })
    }

    const insertChunks = chunkArray(rowsToInsert, 250)
    let insertedCount = 0

    for (const insertChunk of insertChunks) {
      const { error } = await supabase.from('whatnot_orders').insert(insertChunk)

      if (error) {
        console.error('Whatnot insert failed:', error)
        return NextResponse.json(
          {
            error: `Failed inserting Whatnot orders: ${error.message}`,
            routeVersion: ROUTE_VERSION,
            importDebug,
          },
          { status: 500 }
        )
      }

      insertedCount += insertChunk.length
    }

    return NextResponse.json({
      success: true,
      routeVersion: ROUTE_VERSION,
      imported: insertedCount,
      skippedDuplicates,
      skippedExamples,
      importDebug,
    })
  } catch (error) {
    console.error('Whatnot import failed:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error during import',
        routeVersion: ROUTE_VERSION,
      },
      { status: 500 }
    )
  }
}