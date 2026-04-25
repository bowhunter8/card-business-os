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

  // Pull ALL user data
  const [
    breaks,
    inventory,
    sales,
    expenses,
    shippingProfiles,
    taxSettings,
    whatnotOrders,
    whatnotSuggestions,
    startingInventory,
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
  ])

  const backup = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    data: {
      breaks: breaks.data ?? [],
      inventory: inventory.data ?? [],
      sales: sales.data ?? [],
      expenses: expenses.data ?? [],
      shipping_profiles: shippingProfiles.data ?? [],
      tax_year_settings: taxSettings.data ?? [],
      whatnot_orders: whatnotOrders.data ?? [],
      whatnot_suggestions: whatnotSuggestions.data ?? [],
      starting_inventory: startingInventory.data ?? [],
    },
  }

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename=card-business-os-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`,
    },
  })
}