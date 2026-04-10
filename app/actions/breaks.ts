'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type RestorableEntryRow = {
  year: string
  set_name: string
  player_name: string
  card_number: string
  item_type: string
  quantity: string
  status: string
  notes: string
}

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function safeNumber(value: FormDataEntryValue | null) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

function normalizeInventoryStatus(value: string) {
  if (value === 'personal') return 'personal'
  return 'available'
}

function normalizeItemType(value: string) {
  if (value === 'lot') return 'lot'
  return 'single_card'
}

function buildCardTitle(input: {
  year: string
  setName: string
  playerName: string
  cardNumber: string
  notes: string
  itemType: string
  quantity: number
}) {
  const base = [
    input.year,
    input.setName,
    input.playerName,
    input.cardNumber ? `#${input.cardNumber}` : '',
    input.notes,
  ]
    .filter(Boolean)
    .join(' • ')

  if (input.itemType === 'lot' && input.quantity > 1) {
    return `${base || 'Lot'} • Qty ${input.quantity}`
  }

  return base
}

function buildRestoreRows(formData: FormData, rowCount: number): RestorableEntryRow[] {
  const rows: RestorableEntryRow[] = []

  for (let i = 0; i < rowCount; i++) {
    rows.push({
      year: safeText(formData.get(`year_${i}`)),
      set_name: safeText(formData.get(`set_name_${i}`)),
      player_name: safeText(formData.get(`player_name_${i}`)),
      card_number: safeText(formData.get(`card_number_${i}`)),
      item_type: safeText(formData.get(`item_type_${i}`)) || 'single_card',
      quantity: String(Math.max(1, safeNumber(formData.get(`quantity_${i}`)) || 1)),
      status: safeText(formData.get(`status_${i}`)) || 'available',
      notes: safeText(formData.get(`notes_${i}`)),
    })
  }

  return rows
}

function redirectBackToAddCardsWithRestore(args: {
  breakId: string
  error: string
  rowCount: number
  cardsReceived: number
  restoreRows: RestorableEntryRow[]
}) {
  const params = new URLSearchParams()
  params.set('error', args.error)
  params.set('row_count', String(args.rowCount))
  params.set('cards_received', String(args.cardsReceived))
  params.set('restore', JSON.stringify(args.restoreRows))
  redirect(`/app/breaks/${args.breakId}/add-cards?${params.toString()}`)
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

  const selectedWhatnotOrderIds = formData
    .getAll('whatnot_order_ids')
    .map((value) => safeText(value))
    .filter(Boolean)

  if (!breakDate || !sourceName || !productName) {
    const whatnotQuery =
      selectedWhatnotOrderIds.length > 0
        ? `&whatnot_order_ids=${encodeURIComponent(selectedWhatnotOrderIds.join(','))}`
        : ''

    redirect(
      `/app/breaks/new?error=Break date, source, and product name are required${whatnotQuery}`
    )
  }

  const teams = teamsRaw
    ? teamsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : []

  if (selectedWhatnotOrderIds.length > 0) {
    const { data: selectedOrders, error: selectedOrdersError } = await supabase
      .from('whatnot_orders')
      .select('id, break_id, seller')
      .eq('user_id', user.id)
      .in('id', selectedWhatnotOrderIds)

    if (
      selectedOrdersError ||
      !selectedOrders ||
      selectedOrders.length !== selectedWhatnotOrderIds.length
    ) {
      redirect(
        `/app/breaks/new?error=${encodeURIComponent(
          selectedOrdersError?.message || 'Could not load selected Whatnot orders'
        )}&whatnot_order_ids=${encodeURIComponent(selectedWhatnotOrderIds.join(','))}`
      )
    }

    const alreadyLinked = selectedOrders.filter((order) => !!order.break_id)
    if (alreadyLinked.length > 0) {
      redirect(
        `/app/breaks/new?error=One or more selected Whatnot orders are already linked to a break&whatnot_order_ids=${encodeURIComponent(
          selectedWhatnotOrderIds.join(',')
        )}`
      )
    }

    const distinctSellers = Array.from(
      new Set(
        selectedOrders
          .map((order) => String(order.seller ?? '').trim())
          .filter(Boolean)
      )
    )

    if (distinctSellers.length > 1) {
      redirect(
        `/app/breaks/new?error=Please select orders from only one seller at a time&whatnot_order_ids=${encodeURIComponent(
          selectedWhatnotOrderIds.join(',')
        )}`
      )
    }
  }

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
    const whatnotQuery =
      selectedWhatnotOrderIds.length > 0
        ? `&whatnot_order_ids=${encodeURIComponent(selectedWhatnotOrderIds.join(','))}`
        : ''

    redirect(
      `/app/breaks/new?error=${encodeURIComponent(
        error?.message ?? 'Could not save break'
      )}${whatnotQuery}`
    )
  }

  if (selectedWhatnotOrderIds.length > 0) {
    const { error: linkError } = await supabase
      .from('whatnot_orders')
      .update({
        break_id: data.id,
      })
      .eq('user_id', user.id)
      .in('id', selectedWhatnotOrderIds)

    if (linkError) {
      redirect(
        `/app/breaks/new?error=${encodeURIComponent(
          linkError.message || 'Break was created but Whatnot orders could not be linked'
        )}&whatnot_order_ids=${encodeURIComponent(selectedWhatnotOrderIds.join(','))}`
      )
    }
  }

  redirect(`/app/breaks/${data.id}`)
}

export async function updateBreakAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const breakId = safeText(formData.get('break_id'))
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

  if (!breakId) {
    redirect('/app/breaks?error=Missing break id')
  }

  if (!breakDate || !sourceName || !productName) {
    redirect(
      `/app/breaks/${breakId}/edit?error=Break date, source, and product name are required`
    )
  }

  const { data: existingBreak, error: existingBreakError } = await supabase
    .from('breaks')
    .select('id, user_id, reversed_at')
    .eq('id', breakId)
    .eq('user_id', user.id)
    .single()

  if (existingBreakError || !existingBreak) {
    redirect('/app/breaks?error=Break not found')
  }

  if (existingBreak.reversed_at) {
    redirect(`/app/breaks/${breakId}?error=Reversed breaks cannot be edited`)
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

  const { error: updateError } = await supabase
    .from('breaks')
    .update({
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
    .eq('id', breakId)
    .eq('user_id', user.id)

  if (updateError) {
    redirect(
      `/app/breaks/${breakId}/edit?error=${encodeURIComponent(
        updateError.message || 'Could not update break'
      )}`
    )
  }

  redirect(`/app/breaks/${breakId}?success=Break updated`)
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

  const restoreRows = buildRestoreRows(formData, cardCount)

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

  type InsertedInventoryRow = {
    id: string
    cost_basis_total: number | null
    quantity: number | null
    status: string | null
  }

  const enteredRows: InsertRow[] = []

  const maxRows = Math.min(cardCount, 100)

  for (let i = 0; i < maxRows; i++) {
    const yearRaw = safeText(formData.get(`year_${i}`))
    const setName = safeText(formData.get(`set_name_${i}`))
    const playerName = safeText(formData.get(`player_name_${i}`))
    const cardNumber = safeText(formData.get(`card_number_${i}`))
    const itemTypeRaw = safeText(formData.get(`item_type_${i}`))
    const quantityRaw = safeNumber(formData.get(`quantity_${i}`))
    const statusRaw = safeText(formData.get(`status_${i}`))
    const notes = safeText(formData.get(`notes_${i}`))

    const rowHasMeaningfulData =
      playerName || cardNumber || notes || setName || yearRaw

    if (!rowHasMeaningfulData) continue

    const year = yearRaw ? Number(yearRaw) : null
    const normalizedStatus = normalizeInventoryStatus(statusRaw)
    const normalizedItemType = normalizeItemType(itemTypeRaw)
    const quantity = Math.max(1, quantityRaw || 1)

    enteredRows.push({
      user_id: user.id,
      source_type: 'break',
      source_break_id: breakId,
      item_type: normalizedItemType,
      status: normalizedStatus,
      quantity,
      available_quantity: normalizedStatus === 'personal' ? 0 : quantity,
      title:
        buildCardTitle({
          year: yearRaw,
          setName,
          playerName,
          cardNumber,
          notes,
          itemType: normalizedItemType,
          quantity,
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

  const enteredUnitCount = enteredRows.reduce(
    (sum, row) => sum + Number(row.quantity ?? 0),
    0
  )

  if (enteredUnitCount > cardsReceived) {
    redirectBackToAddCardsWithRestore({
      breakId,
      error: `You entered ${enteredUnitCount} total cards but this break only has ${cardsReceived} cards received`,
      rowCount: cardCount,
      cardsReceived,
      restoreRows,
    })
  }

  const blankRemainderCount = cardsReceived - enteredUnitCount
  const totalUnits = cardsReceived

  const totalCost = Number(breakRow.total_cost ?? 0)
  const totalCents = Math.round(totalCost * 100)
  const baseCents = Math.floor(totalCents / totalUnits)
  const remainder = totalCents % totalUnits

  let runningIndex = 0

  for (const row of enteredRows) {
    let rowTotalCents = 0

    for (let i = 0; i < row.quantity; i++) {
      const cents = runningIndex < remainder ? baseCents + 1 : baseCents
      rowTotalCents += cents
      runningIndex += 1
    }

    const rowTotal = rowTotalCents / 100
    const rowUnit = row.quantity > 0 ? rowTotal / row.quantity : 0

    row.cost_basis_unit = Number(rowUnit.toFixed(4))
    row.cost_basis_total = Number(rowTotal.toFixed(2))
  }

  const rowsToInsert: InsertRow[] = [...enteredRows]

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
      item_type: 'lot',
      status: 'available',
      quantity: blankRemainderCount,
      available_quantity: blankRemainderCount,
      title: `Bulk / Common Lot • Qty ${blankRemainderCount}`,
      player_name: 'Bulk / Common Lot',
      year: null,
      brand: null,
      set_name: null,
      card_number: null,
      parallel_name: null,
      team: null,
      cost_basis_unit: Number(bulkUnitCost.toFixed(4)),
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

  if (insertError || !insertedRows || insertedRows.length === 0) {
    redirectBackToAddCardsWithRestore({
      breakId,
      error: insertError?.message ?? 'Could not add cards',
      rowCount: cardCount,
      cardsReceived,
      restoreRows,
    })
  }

  const insertedRowsSafe: InsertedInventoryRow[] = insertedRows as InsertedInventoryRow[]

  const txRows = insertedRowsSafe.map((item) => ({
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

  const { error: txError } = await supabase
    .from('inventory_transactions')
    .insert(txRows)

  if (txError) {
    redirectBackToAddCardsWithRestore({
      breakId,
      error: txError.message || 'Cards were added but inventory transactions failed',
      rowCount: cardCount,
      cardsReceived,
      restoreRows,
    })
  }

  redirect(`/app/breaks/${breakId}`)
}