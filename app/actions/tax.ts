'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function safeNumber(value: FormDataEntryValue | null) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function clampTaxYear(raw: FormDataEntryValue | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return Math.floor(parsed)
}

async function requireUser() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return { supabase, user }
}

function buildTaxSettingsRedirect({
  year,
  success,
  error,
}: {
  year: number
  success?: string
  error?: string
}) {
  const params = new URLSearchParams()
  params.set('year', String(year))

  if (success) params.set('success', success)
  if (error) params.set('error', error)

  return `/app/settings/tax?${params.toString()}`
}

async function getLiveEndingInventoryCost({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}) {
  const inventoryRes = await supabase
    .from('inventory_items')
    .select('id, available_quantity, quantity, cost_basis_unit, cost_basis_total')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gt('available_quantity', 0)

  if (inventoryRes.error) {
    return {
      ok: false as const,
      error: inventoryRes.error.message,
      endingInventoryCost: 0,
      endingInventoryItemCount: 0,
    }
  }

  const rows = inventoryRes.data ?? []

  const endingInventoryCost = roundMoney(
    rows.reduce((sum, row) => {
      const availableQty = Number(row.available_quantity ?? 0)
      const quantity = Number(row.quantity ?? 0)
      const unitCost = Number(row.cost_basis_unit ?? 0)
      const totalCost = Number(row.cost_basis_total ?? 0)

      if (availableQty > 0 && unitCost > 0) return sum + availableQty * unitCost
      if (availableQty > 0 && quantity > 0 && totalCost > 0) return sum + (totalCost / quantity) * availableQty
      return sum + totalCost
    }, 0)
  )

  return {
    ok: true as const,
    error: null,
    endingInventoryCost,
    endingInventoryItemCount: rows.length,
  }
}

export async function saveTaxYearSettingsAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  const taxYear = clampTaxYear(formData.get('tax_year'))

  const beginningInventory = roundMoney(safeNumber(formData.get('beginning_inventory')))
  const businessUseOfHome = roundMoney(safeNumber(formData.get('business_use_of_home')))
  const vehicleExpense = roundMoney(safeNumber(formData.get('vehicle_expense')))
  const depreciationExpense = roundMoney(safeNumber(formData.get('depreciation_expense')))
  const legalProfessional = roundMoney(safeNumber(formData.get('legal_professional')))
  const insurance = roundMoney(safeNumber(formData.get('insurance')))
  const utilities = roundMoney(safeNumber(formData.get('utilities')))
  const taxesLicenses = roundMoney(safeNumber(formData.get('taxes_licenses')))
  const repairsMaintenance = roundMoney(safeNumber(formData.get('repairs_maintenance')))
  const notes = safeText(formData.get('notes'))

  if (beginningInventory < 0) {
    redirect(buildTaxSettingsRedirect({ year: taxYear, error: 'Beginning inventory cannot be negative.' }))
  }

  const { error } = await supabase.from('tax_year_settings').upsert(
    {
      user_id: user.id,
      tax_year: taxYear,
      beginning_inventory: beginningInventory,
      business_use_of_home: businessUseOfHome,
      vehicle_expense: vehicleExpense,
      depreciation_expense: depreciationExpense,
      legal_professional: legalProfessional,
      insurance,
      utilities,
      taxes_licenses: taxesLicenses,
      repairs_maintenance: repairsMaintenance,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,tax_year' }
  )

  if (error) {
    redirect(buildTaxSettingsRedirect({ year: taxYear, error: error.message }))
  }

  revalidatePath('/app/settings/tax')
  revalidatePath('/app/reports/tax')
  redirect(buildTaxSettingsRedirect({ year: taxYear, success: 'Tax year settings saved.' }))
}

export async function lockEndingInventorySnapshotAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  const taxYear = clampTaxYear(formData.get('tax_year'))
  const confirmLock = safeText(formData.get('confirm_lock'))

  if (confirmLock !== 'LOCK') {
    redirect(buildTaxSettingsRedirect({ year: taxYear, error: 'Type LOCK to confirm the ending inventory snapshot.' }))
  }

  const snapshot = await getLiveEndingInventoryCost({ supabase, userId: user.id })

  if (!snapshot.ok) {
    redirect(buildTaxSettingsRedirect({ year: taxYear, error: snapshot.error || 'Could not calculate ending inventory snapshot.' }))
  }

  const lockedAt = new Date().toISOString()

  const { data: existingSettings } = await supabase
    .from('tax_year_settings')
    .select('beginning_inventory')
    .eq('user_id', user.id)
    .eq('tax_year', taxYear)
    .maybeSingle()

  const { error } = await supabase.from('tax_year_settings').upsert(
    {
      user_id: user.id,
      tax_year: taxYear,
      beginning_inventory: Number(existingSettings?.beginning_inventory ?? 0),
      ending_inventory_snapshot: snapshot.endingInventoryCost,
      ending_inventory_item_count: snapshot.endingInventoryItemCount,
      ending_inventory_locked_at: lockedAt,
      updated_at: lockedAt,
    },
    { onConflict: 'user_id,tax_year' }
  )

  if (error) {
    redirect(buildTaxSettingsRedirect({ year: taxYear, error: error.message }))
  }

  await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: null,
    transaction_type: 'tax_year_inventory_snapshot',
    quantity_change: snapshot.endingInventoryItemCount,
    amount: snapshot.endingInventoryCost,
    event_date: lockedAt.slice(0, 10),
    notes: `Locked ending inventory snapshot for tax year ${taxYear}: ${snapshot.endingInventoryItemCount} item(s), ${snapshot.endingInventoryCost.toFixed(2)} cost basis.`,
  })

  revalidatePath('/app/settings/tax')
  revalidatePath('/app/reports/tax')
  redirect(buildTaxSettingsRedirect({ year: taxYear, success: `Ending inventory snapshot locked at ${snapshot.endingInventoryCost.toFixed(2)}.` }))
}

export async function unlockEndingInventorySnapshotAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  const taxYear = clampTaxYear(formData.get('tax_year'))
  const confirmUnlock = safeText(formData.get('confirm_unlock'))

  if (confirmUnlock !== 'UNLOCK') {
    redirect(buildTaxSettingsRedirect({ year: taxYear, error: 'Type UNLOCK to confirm removing the locked snapshot.' }))
  }

  const unlockedAt = new Date().toISOString()

  const { error } = await supabase
    .from('tax_year_settings')
    .update({
      ending_inventory_snapshot: null,
      ending_inventory_item_count: null,
      ending_inventory_locked_at: null,
      updated_at: unlockedAt,
    })
    .eq('user_id', user.id)
    .eq('tax_year', taxYear)

  if (error) {
    redirect(buildTaxSettingsRedirect({ year: taxYear, error: error.message }))
  }

  await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: null,
    transaction_type: 'tax_year_inventory_snapshot_unlocked',
    quantity_change: 0,
    amount: 0,
    event_date: unlockedAt.slice(0, 10),
    notes: `Unlocked ending inventory snapshot for tax year ${taxYear}. Use this only before filing or when correcting tax records.`,
  })

  revalidatePath('/app/settings/tax')
  revalidatePath('/app/reports/tax')
  redirect(buildTaxSettingsRedirect({ year: taxYear, success: 'Ending inventory snapshot unlocked.' }))
}
