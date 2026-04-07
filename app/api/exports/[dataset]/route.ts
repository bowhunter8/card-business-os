import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Dataset = 'breaks' | 'inventory' | 'sales' | 'whatnot_orders'

function isValidDataset(value: string): value is Dataset {
  return (
    value === 'breaks' ||
    value === 'inventory' ||
    value === 'sales' ||
    value === 'whatnot_orders'
  )
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return ''

  if (Array.isArray(value)) {
    return `"${value.map((v) => String(v)).join(', ').replace(/"/g, '""')}"`
  }

  const stringValue =
    typeof value === 'object' ? JSON.stringify(value) : String(value)

  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return ''
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key))
      return set
    }, new Set<string>())
  )

  const headerLine = headers.map(escapeCsvValue).join(',')

  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvValue(row[header])).join(',')
  )

  return [headerLine, ...dataLines].join('\n')
}

function buildFileName(dataset: Dataset) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `${dataset}-export-${stamp}.csv`
}

function buildCsvResponse(dataset: Dataset, rows: Record<string, unknown>[]) {
  const csv = toCsv(rows)

  // UTF-8 BOM helps Excel on Windows open the CSV with the correct encoding
  const csvWithBom = '\uFEFF' + csv

  return new NextResponse(csvWithBom, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${buildFileName(dataset)}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await context.params

  if (!isValidDataset(dataset)) {
    return NextResponse.json({ error: 'Invalid export dataset' }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (dataset === 'breaks') {
    const { data, error } = await supabase
      .from('breaks')
      .select('*')
      .eq('user_id', user.id)
      .order('break_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return buildCsvResponse('breaks', (data ?? []) as Record<string, unknown>[])
  }

  if (dataset === 'inventory') {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return buildCsvResponse('inventory', (data ?? []) as Record<string, unknown>[])
  }

  if (dataset === 'sales') {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', user.id)
      .order('sale_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return buildCsvResponse('sales', (data ?? []) as Record<string, unknown>[])
  }

  const { data, error } = await supabase
    .from('whatnot_orders')
    .select('*')
    .eq('user_id', user.id)
    .order('processed_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return buildCsvResponse(
    'whatnot_orders',
    (data ?? []) as Record<string, unknown>[]
  )
}