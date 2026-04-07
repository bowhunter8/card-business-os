'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function safeNumber(value: FormDataEntryValue | null) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

function buildCardTitle(input: {
  year: string
  setName: string
  playerName: string
  cardNumber: string
  notes: string
}) {
  return [
    input.year,
    input.setName,
    input.playerName,
    input.cardNumber ? `#${input.cardNumber}` : '',
    input.notes,
  ]
    .filter(Boolean)
    .join(' • ')
}

export async function createBreakAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const breakDate = safeText(formData.get('break_date'))
  const sourceName = safeText(formData.get('source_name'))
  const productName = safeText(formData.get('product_name'))
  const formatType = safeText(formData.get('format_type'))
  const teamsRaw = safeText(formData.get('teams'))
  const orderNumber = safeText(formData.get('order_number'))
  const notes = safeText(formData.get('notes'))

  const purchasePrice = safeNumber(formData.get('purchase_price'))
  const salesTax = safeNumber(formData.get('sales_tax'))
  const shippingCost = safeNumber(formData.get('shipping_cost'))
  const otherFees = safeNumber(formData.get('other_fees'))
  const cardsReceived = safeNumber(formData.get('cards_received'))

  const allocationMethod =
    safeText(formData.get('allocation_method')) || 'equal_per_item'

  if (!breakDate || !sourceName || !productName) {
    redirect('/app/breaks/new?error=Break date, source, and product name are required')
  }

  const teams = teamsRaw
    ? teamsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : []

  const totalCost = Number(
    (purchasePrice + salesTax + shippingCost + otherFees).toFixed(2)
  )

  const { data, error } = await supabase
    .from('breaks')
    .insert({
      user_id: user.id,
      break_date: breakDate,
      source_name: sourceName,
      product_name: productName,
      format_type: formatType || null,
      teams,
      order_number: orderNumber || null,
      purchase_price: purchasePrice,
      sales_tax: salesTax,
      shipping_cost: shippingCost,
      other_fees: otherFees,
      total_cost: totalCost,
      allocation_method: allocationMethod,
      cards_received: cardsReceived > 0 ? cardsReceived : 0,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (error || !data) {
    redirect(
      `/app/breaks/new?error=${encodeURIComponent(
        error?.message ?? 'Could not save break'
      )}`
    )
  }

  redirect(`/app/breaks/${data.id}`)
}

export async function addBreakCardsAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const breakId = safeText(formData.get('break_id'))
  const cardCount = safeNumber(formData.get('card_count'))
  const declaredCardsReceived = safeNumber(formData.get('cards_received'))

  if (!breakId || cardCount < 1) {
    redirect(`/app/breaks/${breakId}/add-cards?error=Invalid card count`)
  }

  const { data: breakRow, error: breakError } = await supabase
    .from('breaks')
    .select('id, total_cost, cards_received')
    .eq('id', breakId)
    .eq('user_id', user.id)
    .single()

  if (breakError || !breakRow) {
    redirect('/app?error=Break not found')
  }

  const cardsReceived = Math.max(
    0,
    Number(breakRow.cards_received ?? declaredCardsReceived ?? 0)
  )

  if (cardsReceived < 1) {
    redirect(
      `/app/breaks/${breakId}/add-cards?error=This break needs a Cards Received value before cards can be added`
    )
  }

  type InsertRow = {
    user_id: string
    source_type: string
    source_break_id: string
    item_type: string
    status: string
    quantity: number
    available_quantity: number
    title: string | null
    player_name: string | null
    year: number | null
    brand: string | null
    set_name: string | null
    card_number: string | null
    parallel_name: string | null
    team: string | null
    cost_basis_unit: number
    cost_basis_total: number
    estimated_value_unit: null
    estimated_value_total: null
    storage_location: null
    notes: string | null
  }

  const individualRows: InsertRow[] = []

  const maxRows = Math.min(cardCount, cardsReceived, 100)

  for (let i = 0; i < maxRows; i++) {
    const yearRaw = safeText(formData.get(`year_${i}`))
    const setName = safeText(formData.get(`set_name_${i}`))
    const playerName = safeText(formData.get(`player_name_${i}`))
    const cardNumber = safeText(formData.get(`card_number_${i}`))
    const notes = safeText(formData.get(`notes_${i}`))

    const rowHasMeaningfulCardData =
      playerName || cardNumber || notes

    if (!rowHasMeaningfulCardData) continue

    const year = yearRaw ? Number(yearRaw) : null

    individualRows.push({
      user_id: user.id,
      source_type: 'break',
      source_break_id: breakId,
      item_type: 'single_card',
      status: 'available',
      quantity: 1,
      available_quantity: 1,
      title:
        buildCardTitle({
          year: yearRaw,
          setName,
          playerName,
          cardNumber,
          notes,
        }) || null,
      player_name: playerName || null,
      year: year && !Number.isNaN(year) ? year : null,
      brand: null,
      set_name: setName || null,
      card_number: cardNumber || null,
      parallel_name: null,
      team: null,
      cost_basis_unit: 0,
      cost_basis_total: 0,
      estimated_value_unit: null,
      estimated_value_total: null,
      storage_location: null,
      notes: notes || null,
    })
  }

  if (individualRows.length > cardsReceived) {
    redirect(
      `/app/breaks/${breakId}/add-cards?error=You entered more individual cards than the break received`
    )
  }

  const blankRemainderCount = cardsReceived - individualRows.length

  const totalUnits = cardsReceived

  const totalCost = Number(breakRow.total_cost ?? 0)
  const totalCents = Math.round(totalCost * 100)
  const baseCents = Math.floor(totalCents / totalUnits)
  const remainder = totalCents % totalUnits

  let runningIndex = 0

  for (const row of individualRows) {
    const cents = runningIndex < remainder ? baseCents + 1 : baseCents
    const value = cents / 100
    row.cost_basis_unit = value
    row.cost_basis_total = value
    runningIndex += 1
  }

  const rowsToInsert: InsertRow[] = [...individualRows]

  if (blankRemainderCount > 0) {
    let bulkTotalCents = 0

    for (let i = 0; i < blankRemainderCount; i++) {
      const cents = runningIndex < remainder ? baseCents + 1 : baseCents
      bulkTotalCents += cents
      runningIndex += 1
    }

    const bulkUnitCost = bulkTotalCents / 100 / blankRemainderCount
    const bulkTotalCost = bulkTotalCents / 100

    rowsToInsert.push({
      user_id: user.id,
      source_type: 'break',
      source_break_id: breakId,
      item_type: 'single_card',
      status: 'available',
      quantity: blankRemainderCount,
      available_quantity: blankRemainderCount,
      title: 'Bulk / Common Lot',
      player_name: 'Bulk / Common Lot',
      year: null,
      brand: null,
      set_name: null,
      card_number: null,
      parallel_name: null,
      team: null,
      cost_basis_unit: Number(bulkUnitCost.toFixed(2)),
      cost_basis_total: Number(bulkTotalCost.toFixed(2)),
      estimated_value_unit: null,
      estimated_value_total: null,
      storage_location: null,
      notes: 'Common / bulk cards grouped automatically from blank rows',
    })
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('inventory_items')
    .insert(rowsToInsert)
    .select('id, cost_basis_total, quantity, status')

  if (insertError || !insertedRows) {
    redirect(
      `/app/breaks/${breakId}/add-cards?error=${encodeURIComponent(
        insertError?.message ?? 'Could not add cards'
      )}`
    )
  }

  const txRows = insertedRows.map((item) => ({
    user_id: user.id,
    inventory_item_id: item.id,
    transaction_type: 'break_add',
    quantity_change: Number(item.quantity ?? 1),
    to_status: String(item.status ?? 'available'),
    linked_entity_type: 'break',
    linked_entity_id: breakId,
    amount: item.cost_basis_total ?? 0,
    event_date: new Date().toISOString().slice(0, 10),
    notes: 'Created from break import',
  }))

  await supabase.from('inventory_transactions').insert(txRows)

  redirect(`/app/breaks/${breakId}`)
}