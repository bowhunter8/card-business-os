import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const userId = user.id

  const [
    breaksRes,
    inventoryItemsRes,
    salesRes,
    expensesRes,
    shippingProfilesRes,
    taxYearSettingsRes,
    whatnotOrdersRes,
    whatnotSuggestionsRes,
    startingInventoryItemsRes,
    inventoryTransactionsRes,
  ] = await Promise.all([
    supabase.from('breaks').select('*').eq('user_id', userId),
    supabase.from('inventory_items').select('*').eq('user_id', userId),
    supabase.from('sales').select('*').eq('user_id', userId),
    supabase.from('expenses').select('*').eq('user_id', userId),
    supabase.from('shipping_profiles').select('*').eq('user_id', userId),
    supabase.from('tax_year_settings').select('*').eq('user_id', userId),
    supabase.from('whatnot_orders').select('*').eq('user_id', userId),
    supabase.from('whatnot_order_group_suggestions').select('*').eq('user_id', userId),
    supabase.from('starting_inventory_items').select('*').eq('user_id', userId),
    supabase.from('inventory_transactions').select('*').eq('user_id', userId),
  ])

  const backup = {
    backup_type: 'card_business_os_full_user_backup',
    backup_version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    tables: {
      breaks: breaksRes.data ?? [],
      inventory_items: inventoryItemsRes.data ?? [],
      sales: salesRes.data ?? [],
      expenses: expensesRes.data ?? [],
      shipping_profiles: shippingProfilesRes.data ?? [],
      tax_year_settings: taxYearSettingsRes.data ?? [],
      whatnot_orders: whatnotOrdersRes.data ?? [],
      whatnot_order_group_suggestions: whatnotSuggestionsRes.data ?? [],
      starting_inventory_items: startingInventoryItemsRes.data ?? [],
      inventory_transactions: inventoryTransactionsRes.data ?? [],
    },
    errors: {
      breaks: breaksRes.error?.message ?? null,
      inventory_items: inventoryItemsRes.error?.message ?? null,
      sales: salesRes.error?.message ?? null,
      expenses: expensesRes.error?.message ?? null,
      shipping_profiles: shippingProfilesRes.error?.message ?? null,
      tax_year_settings: taxYearSettingsRes.error?.message ?? null,
      whatnot_orders: whatnotOrdersRes.error?.message ?? null,
      whatnot_order_group_suggestions: whatnotSuggestionsRes.error?.message ?? null,
      starting_inventory_items: startingInventoryItemsRes.error?.message ?? null,
      inventory_transactions: inventoryTransactionsRes.error?.message ?? null,
    },
  }

  const fileDate = new Date().toISOString().slice(0, 10)

  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="card-business-os-backup-${fileDate}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}