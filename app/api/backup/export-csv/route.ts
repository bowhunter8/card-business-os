import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type CsvRow = Record<string, unknown>

type CsvFileConfig = {
  fileName: string
  tableName: string
  headers: string[]
}

const CSV_FILES: CsvFileConfig[] = [
  {
    fileName: 'orders.csv',
    tableName: 'whatnot_orders',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'order_number',
      'order_date',
      'seller',
      'purchased_from',
      'description',
      'amount',
      'shipping',
      'tax',
      'total',
      'status',
      'notes',
      'break_id',
      'order_id',
      'buyer',
      'product_name',
      'product_category',
      'product_condition',
      'processed_at',
      'processed_date',
      'order_status',
      'order_style',
      'order_currency',
      'sold_price',
      'quantity',
    ],
  },
  {
    fileName: 'orders_received.csv',
    tableName: 'breaks',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'break_date',
      'title',
      'seller',
      'platform',
      'total_cost',
      'shipping_cost',
      'tax_amount',
      'status',
      'notes',
      'source_type',
      'source_id',
      'order_number',
      'order_id',
      'purchase_date',
      'purchased_from',
      'description',
      'amount',
      'shipping',
      'tax',
      'total',
    ],
  },
  {
    fileName: 'breaks.csv',
    tableName: 'breaks',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'break_date',
      'title',
      'seller',
      'platform',
      'total_cost',
      'shipping_cost',
      'tax_amount',
      'status',
      'notes',
      'source_type',
      'source_id',
      'order_number',
      'order_id',
      'purchase_date',
      'purchased_from',
      'description',
      'amount',
      'shipping',
      'tax',
      'total',
    ],
  },
  {
    fileName: 'inventory_items.csv',
    tableName: 'inventory_items',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'title',
      'item_name',
      'player_name',
      'year',
      'set_name',
      'card_number',
      'item_number',
      'status',
      'quantity',
      'cost_basis',
      'allocated_cost',
      'estimated_value',
      'sale_price',
      'sold_at',
      'notes',
      'break_id',
      'source_type',
      'source_id',
      'source_reference',
      'item_type',
      'available_quantity',
      'brand',
      'parallel_name',
      'variation',
      'team',
      'rookie_card',
      'serial_number',
      'grade',
      'grader',
      'condition',
      'purchase_date',
      'purchase_source',
    ],
  },
  {
    fileName: 'sales.csv',
    tableName: 'sales',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'inventory_item_id',
      'item_name',
      'title',
      'sale_date',
      'sold_at',
      'platform',
      'buyer_name',
      'sale_price',
      'shipping_charged',
      'postage_cost',
      'shipping_supplies_cost',
      'platform_fees',
      'payment_fees',
      'other_fees',
      'gross_amount',
      'net_amount',
      'cost_basis',
      'profit',
      'quantity',
      'notes',
    ],
  },
  {
    fileName: 'expenses.csv',
    tableName: 'expenses',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'expense_date',
      'date',
      'vendor',
      'description',
      'category',
      'subcategory',
      'amount',
      'tax_year',
      'payment_method',
      'receipt_url',
      'notes',
    ],
  },
  {
    fileName: 'starting_inventory_items.csv',
    tableName: 'starting_inventory_items',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'title',
      'item_name',
      'player_name',
      'year',
      'set_name',
      'card_number',
      'item_number',
      'quantity',
      'cost_basis',
      'estimated_value',
      'status',
      'notes',
      'source_type',
      'source_id',
      'brand',
      'team',
      'condition',
    ],
  },
  {
    fileName: 'inventory_transactions.csv',
    tableName: 'inventory_transactions',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'inventory_item_id',
      'transaction_type',
      'quantity',
      'amount',
      'reason',
      'notes',
      'source_type',
      'source_id',
      'transaction_date',
    ],
  },
  {
    fileName: 'break_entries.csv',
    tableName: 'break_entries',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'break_id',
      'description',
      'amount',
      'quantity',
      'notes',
    ],
  },
  {
    fileName: 'inventory_entries.csv',
    tableName: 'inventory_entries',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'inventory_item_id',
      'break_id',
      'title',
      'item_name',
      'player_name',
      'year',
      'set_name',
      'card_number',
      'item_number',
      'quantity',
      'cost_basis',
      'allocated_cost',
      'estimated_value',
      'status',
      'notes',
    ],
  },
  {
    fileName: 'order_group_suggestions.csv',
    tableName: 'whatnot_order_group_suggestions',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'group_key',
      'order_ids',
      'suggested_title',
      'seller',
      'purchased_from',
      'order_date',
      'status',
      'notes',
    ],
  },
  {
    fileName: 'shipping_profiles.csv',
    tableName: 'shipping_profiles',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'name',
      'shipping_charged_default',
      'supplies_cost_default',
      'notes',
    ],
  },
  {
    fileName: 'tax_year_settings.csv',
    tableName: 'tax_year_settings',
    headers: [
      'id',
      'user_id',
      'created_at',
      'updated_at',
      'tax_year',
      'year',
      'business_name',
      'business_type',
      'accounting_method',
      'inventory_method',
      'notes',
    ],
  },
]

function collectHeaders(rows: CsvRow[], preferredHeaders: string[]) {
  const headerSet = new Set<string>()

  preferredHeaders.forEach((header) => headerSet.add(header))

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => headerSet.add(key))
  })

  return Array.from(headerSet)
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return ''

  const stringValue =
    typeof value === 'object' ? JSON.stringify(value) : String(value)

  return `"${stringValue.replace(/"/g, '""')}"`
}

function convertToCSV(rows: CsvRow[], preferredHeaders: string[]) {
  const headers = collectHeaders(rows, preferredHeaders)

  const csvRows = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ]

  return csvRows.join('\n')
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const files: Record<string, string> = {}
  const errors: Record<string, string | null> = {}

  await Promise.all(
    CSV_FILES.map(async (config) => {
      const { data, error } = await supabase
        .from(config.tableName)
        .select('*')
        .eq('user_id', user.id)

      if (error) {
        errors[config.fileName] = error.message
        files[config.fileName] = convertToCSV([], config.headers)
        return
      }

      errors[config.fileName] = null
      files[config.fileName] = convertToCSV(
        (data ?? []) as CsvRow[],
        config.headers
      )
    })
  )

  return NextResponse.json({
    ok: true,
    files,
    errors,
  })
}
