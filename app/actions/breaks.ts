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

type DuplicateCheckRow = {
  item_type: string
  status: string
  quantity: number
  year: number | null
  set_name: string | null
  player_name: string | null
  card_number: string | null
  notes: string | null
}

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function safeNumber(value: FormDataEntryValue | null) {
  const num = Number(String(value ?? '').replace(/,/g, '').trim() || 0)
  return Number.isFinite(num) ? num : 0
}

function normalizeInventoryStatus(value: string) {
  if (value === 'personal') return 'personal'
  if (value === 'junk') return 'junk'
  return 'available'
}

function normalizeItemType(value: string) {
  if (value === 'lot') return 'team_lot_line'
  return 'single_card'
}

function normalizeKeyPart(value: string | number | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function buildDuplicateKey(input: {
  itemType: string
  status: string
  quantity: number
  year: string | number | null
  setName: string | null
  playerName: string | null
  cardNumber: string | null
  notes: string | null
}) {
  return [
    normalizeKeyPart(input.itemType),
    normalizeKeyPart(input.status),
    normalizeKeyPart(input.quantity),
    normalizeKeyPart(input.year),
    normalizeKeyPart(input.setName),
    normalizeKeyPart(input.playerName),
    normalizeKeyPart(input.cardNumber),
    normalizeKeyPart(input.notes),
  ].join('||')
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

  if (input.itemType === 'team_lot_line' && input.quantity > 1) {
    return `${base || 'Lot'} • Qty ${input.quantity}`
  }

  return base
}

function rowHasMeaningfulData(row: RestorableEntryRow) {
  return (
    row.player_name.trim() !== '' ||
    row.card_number.trim() !== '' ||
    row.notes.trim() !== '' ||
    row.item_type !== 'single_card' ||
    row.quantity !== '1' ||
    row.status !== 'available'
  )
}

function buildRestoreRows(formData: FormData, rowCount: number): RestorableEntryRow[] {
  const rows: RestorableEntryRow[] = []

  for (let i = 0; i < rowCount; i++) {
    const row: RestorableEntryRow = {
      year: safeText(formData.get(`year_${i}`)),
      set_name: safeText(formData.get(`set_name_${i}`)),
      player_name: safeText(formData.get(`player_name_${i}`)),
      card_number: safeText(formData.get(`card_number_${i}`)),
      item_type: safeText(formData.get(`item_type_${i}`)) || 'single_card',
      quantity: String(Math.max(1, safeNumber(formData.get(`quantity_${i}`)) || 1)),
      status: safeText(formData.get(`status_${i}`)) || 'available',
      notes: safeText(formData.get(`notes_${i}`)),
    }

    rows.push(row)
  }

  return rows
}

function buildReturnPath({
  returnTo,
  breakId,
  inventoryItemId,
}: {
  returnTo: string
  breakId?: string
  inventoryItemId?: string
}) {
  if (returnTo === 'break' && breakId) {
    return `/app/breaks/${breakId}`
  }

  if (inventoryItemId) {
    return `/app/inventory/${inventoryItemId}`
  }

  return '/app/inventory'
}

function redirectBackToAddCards(args: {
  breakId: string
  error: string
  rowCount: number
  cardsReceived: number
}) {
  const params = new URLSearchParams()
  params.set('error', args.error)
  params.set('row_count', String(args.rowCount))
  params.set('cards_received', String(args.cardsReceived))
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
      `/app/breaks/new?error=${encodeURIComponent(
        'Break date, source, and product name are required'
      )}${whatnotQuery}`
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
        `/app/breaks/new?error=${encodeURIComponent(
          'One or more selected Whatnot orders are already linked to a break'
        )}&whatnot_order_ids=${encodeURIComponent(selectedWhatnotOrderIds.join(','))}`
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
        `/app/breaks/new?error=${encodeURIComponent(
          'Please select orders from only one seller at a time'
        )}&whatnot_order_ids=${encodeURIComponent(selectedWhatnotOrderIds.join(','))}`
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

  redirect(`/app/breaks/${data.id}/add-cards`)
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
    redirect('/app/breaks?error=Missing%20break%20id')
  }

  if (!breakDate || !sourceName || !productName) {
    redirect(
      `/app/breaks/${breakId}/edit?error=${encodeURIComponent(
        'Break date, source, and product name are required'
      )}`
    )
  }

  const { data: existingBreak, error: existingBreakError } = await supabase
    .from('breaks')
    .select('id, user_id, cards_received')
    .eq('id', breakId)
    .eq('user_id', user.id)
    .single()

  if (existingBreakError || !existingBreak) {
    redirect(
      `/app/breaks?error=${encodeURIComponent(
        existingBreakError?.message || 'Break not found'
      )}`
    )
  }

  const previousCardsReceived = Number(existingBreak.cards_received ?? 0)

  const { count: existingInventoryCount, error: existingInventoryCountError } =
    await supabase
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_type', 'break')
      .eq('source_break_id', breakId)

  if (existingInventoryCountError) {
    redirect(
      `/app/breaks/${breakId}/edit?error=${encodeURIComponent(
        existingInventoryCountError.message || 'Could not check existing break inventory'
      )}`
    )
  }

  const shouldRedirectToAddCards =
    cardsReceived > 0 &&
    Number(existingInventoryCount ?? 0) === 0 &&
    previousCardsReceived !== cardsReceived

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

  if (shouldRedirectToAddCards) {
    redirect(`/app/breaks/${breakId}/add-cards`)
  }

  redirect(`/app/breaks/${breakId}?success=${encodeURIComponent('Break updated')}`)
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
  const cardCount = Math.max(0, Math.floor(safeNumber(formData.get('card_count'))))
  const declaredCardsReceived = safeNumber(formData.get('cards_received'))

  if (!breakId || cardCount < 1) {
    redirect(
      `/app/breaks/${breakId || ''}/add-cards?error=${encodeURIComponent(
        'Invalid card count'
      )}`
    )
  }

  const { data: breakRow, error: breakError } = await supabase
    .from('breaks')
    .select('id, total_cost, cards_received')
    .eq('id', breakId)
    .eq('user_id', user.id)
    .single()

  if (breakError || !breakRow) {
    redirect(`/app?error=${encodeURIComponent(breakError?.message || 'Break not found')}`)
  }

  const cardsReceived = Math.max(
    0,
    Number(breakRow.cards_received ?? declaredCardsReceived ?? 0)
  )

  if (cardsReceived < 1) {
    redirect(
      `/app/breaks/${breakId}/add-cards?error=${encodeURIComponent(
        'This break needs a Cards Received value before cards can be added'
      )}`
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
  const submittedKeySet = new Set<string>()

  for (let i = 0; i < maxRows; i++) {
    const restoreRow = restoreRows[i]
    if (!restoreRow || !rowHasMeaningfulData(restoreRow)) {
      continue
    }

    const yearRaw = restoreRow.year
    const setName = restoreRow.set_name
    const playerName = restoreRow.player_name
    const cardNumber = restoreRow.card_number
    const itemTypeRaw = restoreRow.item_type
    const quantityRaw = safeNumber(restoreRow.quantity)
    const statusRaw = restoreRow.status
    const notes = restoreRow.notes

    const year = yearRaw ? Number(yearRaw) : null
    const normalizedStatus = normalizeInventoryStatus(statusRaw)
    const normalizedItemType = normalizeItemType(itemTypeRaw)
    const quantity = Math.max(1, Math.floor(quantityRaw || 1))
    const isAvailableForSale = normalizedStatus === 'available'

    const submittedKey = buildDuplicateKey({
      itemType: normalizedItemType,
      status: normalizedStatus,
      quantity,
      year: yearRaw,
      setName,
      playerName,
      cardNumber,
      notes,
    })

    if (submittedKeySet.has(submittedKey)) {
      redirectBackToAddCards({
        breakId,
        error:
          'Duplicate row detected in this entry. Combine duplicate quantities or remove the repeated row before saving.',
        rowCount: cardCount,
        cardsReceived,
      })
    }

    submittedKeySet.add(submittedKey)

    enteredRows.push({
      user_id: user.id,
      source_type: 'break',
      source_break_id: breakId,
      item_type: normalizedItemType,
      status: normalizedStatus,
      quantity,
      available_quantity: isAvailableForSale ? quantity : 0,
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
      year: year !== null && !Number.isNaN(year) ? year : null,
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
    redirectBackToAddCards({
      breakId,
      error: `You entered ${enteredUnitCount} total cards but this break only has ${cardsReceived} cards received`,
      rowCount: cardCount,
      cardsReceived,
    })
  }

  if (enteredUnitCount === 0) {
    redirectBackToAddCards({
      breakId,
      error: 'Enter at least one card or lot before saving',
      rowCount: cardCount,
      cardsReceived,
    })
  }

  const { data: existingBreakItems, error: existingBreakItemsError } = await supabase
    .from('inventory_items')
    .select(`
      item_type,
      status,
      quantity,
      year,
      set_name,
      player_name,
      card_number,
      notes
    `)
    .eq('user_id', user.id)
    .eq('source_type', 'break')
    .eq('source_break_id', breakId)

  if (existingBreakItemsError) {
    redirectBackToAddCards({
      breakId,
      error: existingBreakItemsError.message || 'Could not validate existing break items',
      rowCount: cardCount,
      cardsReceived,
    })
  }

  const existingBreakItemsSafe = (existingBreakItems ?? []) as DuplicateCheckRow[]

  const existingUnitCount = existingBreakItemsSafe.reduce(
    (sum, item) => sum + Number(item.quantity ?? 0),
    0
  )

  const existingKeySet = new Set(
    existingBreakItemsSafe.map((item) =>
      buildDuplicateKey({
        itemType: item.item_type,
        status: item.status,
        quantity: Number(item.quantity ?? 0),
        year: item.year,
        setName: item.set_name,
        playerName: item.player_name,
        cardNumber: item.card_number,
        notes: item.notes,
      })
    )
  )

  for (const row of enteredRows) {
    const duplicateKey = buildDuplicateKey({
      itemType: row.item_type,
      status: row.status,
      quantity: row.quantity,
      year: row.year,
      setName: row.set_name,
      playerName: row.player_name,
      cardNumber: row.card_number,
      notes: row.notes,
    })

    if (existingKeySet.has(duplicateKey)) {
      redirectBackToAddCards({
        breakId,
        error:
          'This break already has one or more matching items. Open the break and edit the existing item instead of entering it again.',
        rowCount: cardCount,
        cardsReceived,
      })
    }
  }

  const totalUnits = enteredUnitCount
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

  const { data: insertedRows, error: insertError } = await supabase
    .from('inventory_items')
    .insert(enteredRows)
    .select('id, cost_basis_total, quantity, status')

  if (insertError || !insertedRows || insertedRows.length === 0) {
    redirectBackToAddCards({
      breakId,
      error: insertError?.message ?? 'Could not add cards',
      rowCount: cardCount,
      cardsReceived,
    })
  }

  const insertedRowsSafe = insertedRows as InsertedInventoryRow[]

  const txRows = insertedRowsSafe.map((item) => ({
    user_id: user.id,
    inventory_item_id: item.id,
    transaction_type: 'break_receive',
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
    redirectBackToAddCards({
      breakId,
      error: txError.message || 'Cards were added but inventory transactions failed',
      rowCount: cardCount,
      cardsReceived,
    })
  }

  const totalEnteredAfterSave = existingUnitCount + enteredUnitCount
  const remainingAfterSave = Math.max(0, cardsReceived - totalEnteredAfterSave)

  const successMessage =
    remainingAfterSave === 0
      ? `Success! ${enteredUnitCount} item(s) added to inventory. All ${totalEnteredAfterSave} item(s) are now entered.`
      : `Success! ${enteredUnitCount} item(s) added to inventory. ${remainingAfterSave} item(s) remaining.`

  redirect(`/app/breaks/${breakId}?success=${encodeURIComponent(successMessage)}`)
}

export async function deleteInventoryItemAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const inventoryItemId = safeText(formData.get('inventory_item_id'))
  const returnTo = safeText(formData.get('return_to'))
  const breakIdFromForm = safeText(formData.get('break_id'))

  if (!inventoryItemId) {
    redirect('/app/inventory?error=Missing%20inventory%20item%20id')
  }

  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('id, source_break_id')
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)
    .single()

  if (itemError || !item) {
    redirect('/app/inventory?error=Inventory%20item%20not%20found')
  }

  const breakId = breakIdFromForm || String(item.source_break_id ?? '')

  const { data: activeSales, error: salesError } = await supabase
    .from('sales')
    .select('id')
    .eq('user_id', user.id)
    .eq('inventory_item_id', inventoryItemId)
    .is('reversed_at', null)
    .limit(1)

  if (salesError) {
    const fallback = `${buildReturnPath({
      returnTo,
      breakId,
      inventoryItemId,
    })}?error=${encodeURIComponent('Could not validate sales before delete')}`
    redirect(fallback)
  }

  if ((activeSales ?? []).length > 0) {
    const fallback = `${buildReturnPath({
      returnTo,
      breakId,
      inventoryItemId,
    })}?error=${encodeURIComponent('Cannot delete an item with active sales. Reverse the sale first.')}`
    redirect(fallback)
  }

  const { error: txDeleteError } = await supabase
    .from('inventory_transactions')
    .delete()
    .eq('user_id', user.id)
    .eq('inventory_item_id', inventoryItemId)

  if (txDeleteError) {
    const fallback = `${buildReturnPath({
      returnTo,
      breakId,
      inventoryItemId,
    })}?error=${encodeURIComponent(txDeleteError.message)}`
    redirect(fallback)
  }

  const { error: itemDeleteError } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (itemDeleteError) {
    const fallback = `${buildReturnPath({
      returnTo,
      breakId,
      inventoryItemId,
    })}?error=${encodeURIComponent(itemDeleteError.message)}`
    redirect(fallback)
  }

  const successPath = `${buildReturnPath({
    returnTo,
    breakId,
  })}?success=${encodeURIComponent('Item deleted')}`

  redirect(successPath)
}

export async function bulkDeleteInventoryItemsAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const returnTo = safeText(formData.get('return_to'))
  const breakId = safeText(formData.get('break_id'))
  const selectedIds = formData
    .getAll('inventory_item_ids')
    .map((value) => safeText(value))
    .filter(Boolean)

  const fallbackBase = buildReturnPath({
    returnTo,
    breakId,
  })

  if (selectedIds.length === 0) {
    redirect(
      `${fallbackBase}?error=${encodeURIComponent(
        'Select at least one item before bulk delete.'
      )}`
    )
  }

  const uniqueSelectedIds = Array.from(new Set(selectedIds))

  let itemsQuery = supabase
    .from('inventory_items')
    .select('id, source_break_id')
    .eq('user_id', user.id)
    .in('id', uniqueSelectedIds)

  if (returnTo === 'break' && breakId) {
    itemsQuery = itemsQuery.eq('source_break_id', breakId)
  }

  const { data: foundItems, error: foundItemsError } = await itemsQuery

  if (foundItemsError) {
    redirect(
      `${fallbackBase}?error=${encodeURIComponent(
        foundItemsError.message || 'Could not load selected items.'
      )}`
    )
  }

  const foundIds = new Set((foundItems ?? []).map((item) => String(item.id)))
  const validIds = uniqueSelectedIds.filter((id) => foundIds.has(id))

  if (validIds.length === 0) {
    redirect(
      `${fallbackBase}?error=${encodeURIComponent(
        'No valid items were selected for bulk delete.'
      )}`
    )
  }

  const { data: activeSales, error: salesError } = await supabase
    .from('sales')
    .select('inventory_item_id')
    .eq('user_id', user.id)
    .in('inventory_item_id', validIds)
    .is('reversed_at', null)

  if (salesError) {
    redirect(
      `${fallbackBase}?error=${encodeURIComponent(
        salesError.message || 'Could not validate selected item sales.'
      )}`
    )
  }

  const blockedIds = new Set(
    (activeSales ?? []).map((sale) => String(sale.inventory_item_id))
  )

  const deletableIds = validIds.filter((id) => !blockedIds.has(id))
  const skippedCount = validIds.length - deletableIds.length

  if (deletableIds.length === 0) {
    redirect(
      `${fallbackBase}?error=${encodeURIComponent(
        'Selected items could not be deleted because they have active sales.'
      )}`
    )
  }

  const { error: txDeleteError } = await supabase
    .from('inventory_transactions')
    .delete()
    .eq('user_id', user.id)
    .in('inventory_item_id', deletableIds)

  if (txDeleteError) {
    redirect(
      `${fallbackBase}?error=${encodeURIComponent(
        txDeleteError.message || 'Could not delete inventory transactions for selected items.'
      )}`
    )
  }

  const { error: itemDeleteError } = await supabase
    .from('inventory_items')
    .delete()
    .eq('user_id', user.id)
    .in('id', deletableIds)

  if (itemDeleteError) {
    redirect(
      `${fallbackBase}?error=${encodeURIComponent(
        itemDeleteError.message || 'Could not delete selected items.'
      )}`
    )
  }

  const successMessage =
    skippedCount > 0
      ? `Deleted ${deletableIds.length} item(s). Skipped ${skippedCount} item(s) with active sales.`
      : `Deleted ${deletableIds.length} item(s).`

  redirect(`${fallbackBase}?success=${encodeURIComponent(successMessage)}`)
}