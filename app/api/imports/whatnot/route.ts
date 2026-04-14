import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildWhatnotPreviewRows } from '@/lib/imports/whatnot'

type ImportBody = {
  csvText: string
  fileName?: string
}

function parseMoneyLike(value: unknown) {
  const parsed = Number(String(value ?? '0').replace(/\$/g, '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readImportBody(request)

    if (!body.csvText || typeof body.csvText !== 'string') {
      return NextResponse.json(
        { error: 'CSV text or uploaded CSV file is required' },
        { status: 400 }
      )
    }

    const parsed = buildWhatnotPreviewRows(body.csvText)

    if (!parsed.rows || parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'No Whatnot rows found in CSV' },
        { status: 400 }
      )
    }

    // First dedupe the incoming CSV rows by order ID so the same import
    // cannot try to insert the same order more than once.
    const uniqueParsedRows: typeof parsed.rows = []
    const seenOrderIds = new Set<string>()
    let skippedCsvDuplicates = 0

    for (const row of parsed.rows) {
      const orderId =
        typeof row.orderId === 'string' ? row.orderId.trim() : ''

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
        { error: 'No valid unique Whatnot order IDs found in CSV' },
        { status: 400 }
      )
    }

    const uniqueOrderIds = uniqueParsedRows.map((row) => row.orderId)
    const existingRows: Array<{ order_id: string }> = []

    const orderIdChunks = chunkArray(uniqueOrderIds, 100)

    for (const orderIdChunk of orderIdChunks) {
      const { data, error } = await supabase
        .from('whatnot_orders')
        .select('order_id')
        .eq('user_id', user.id)
        .in('order_id', orderIdChunk)

      if (error) {
        console.error('Whatnot import existing lookup failed:', error)
        return NextResponse.json(
          { error: `Failed checking existing orders: ${error.message}` },
          { status: 500 }
        )
      }

      if (data?.length) {
        existingRows.push(...data)
      }
    }

    const existingOrderSet = new Set(existingRows.map((row) => String(row.order_id)))

    const rowsToInsert = uniqueParsedRows
      .filter((row) => row.orderId && !existingOrderSet.has(row.orderId))
      .map((row) => ({
        user_id: user.id,
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

    const skippedExistingDuplicates = uniqueParsedRows.length - rowsToInsert.length
    const skippedDuplicates = skippedCsvDuplicates + skippedExistingDuplicates

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        imported: 0,
        skippedDuplicates,
        message: 'No new Whatnot orders to import.',
      })
    }

    const insertChunks = chunkArray(rowsToInsert, 250)
    let insertedCount = 0

    for (const insertChunk of insertChunks) {
      const { error } = await supabase
        .from('whatnot_orders')
        .insert(insertChunk)

      if (error) {
        console.error('Whatnot insert failed:', error)
        return NextResponse.json(
          { error: `Failed inserting Whatnot orders: ${error.message}` },
          { status: 500 }
        )
      }

      insertedCount += insertChunk.length
    }

    return NextResponse.json({
      success: true,
      imported: insertedCount,
      skippedDuplicates,
    })
  } catch (error) {
    console.error('Whatnot import failed:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unexpected server error during import',
      },
      { status: 500 }
    )
  }
}