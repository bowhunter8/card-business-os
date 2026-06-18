import { NextResponse } from 'next/server'

type TemplateColumn = {
  header: string
}

const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { header: 'item' },
  { header: 'purchase_price' },
  { header: 'purchase_date' },
  { header: 'quantity' },
  { header: 'brand' },
  { header: 'year' },
  { header: 'category' },
  { header: 'subcategory' },
  { header: 'card_number' },
  { header: 'condition' },
  { header: 'purchased_from' },
  { header: 'platform' },
  { header: 'order_number' },
  { header: 'location' },
  { header: 'notes' },
]

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function buildCsvTemplate() {
  return (
    TEMPLATE_COLUMNS.map((column) => csvEscape(column.header)).join(',') +
    '\n'
  )
}

export async function GET() {
  const csv = buildCsvTemplate()

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        'attachment; filename="hits-inventory-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}