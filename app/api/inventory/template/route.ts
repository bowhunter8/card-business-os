import { NextRequest, NextResponse } from 'next/server'

const TEMPLATES: Record<string, string[]> = {
  quick: [
    'item',
    'purchase_price',
    'quantity',
    'notes',
  ],
  advanced: [
    'item',
    'purchase_price',
    'purchase_date',
    'quantity',
    'brand',
    'year',
    'category',
    'subcategory',
    'card_number',
    'condition',
    'purchased_from',
    'platform',
    'order_number',
    'location',
    'notes',
  ],
  giveaway: [
    'item',
    'purchase_price',
    'quantity',
    'notes',
  ],
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function buildCsvTemplate(columns: string[]) {
  return columns.map(csvEscape).join(',') + '\n'
}

export async function GET(request: NextRequest) {
  const type =
    request.nextUrl.searchParams.get('type')?.toLowerCase() ?? 'quick'

  const columns = TEMPLATES[type] ?? TEMPLATES.quick

  const filename =
    type === 'advanced'
      ? 'hits-advanced-inventory-template.csv'
      : type === 'giveaway'
        ? 'hits-giveaway-template.csv'
        : 'hits-quick-inventory-template.csv'

  return new NextResponse(buildCsvTemplate(columns), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}