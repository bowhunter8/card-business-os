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

export async function createShippingProfileAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const name = safeText(formData.get('name'))
  const cost = safeNumber(formData.get('cost'))
  const shippingChargedDefault = safeNumber(formData.get('shipping_charged_default'))
  const suppliesCostDefault = safeNumber(formData.get('supplies_cost_default'))

  if (!name) {
    redirect('/app/settings/shipping?error=Profile name is required')
  }

  if (cost < 0 || shippingChargedDefault < 0 || suppliesCostDefault < 0) {
    redirect('/app/settings/shipping?error=Profile amounts cannot be negative')
  }

  const { error } = await supabase.from('shipping_profiles').insert({
    user_id: user.id,
    name,
    cost: Number(cost.toFixed(2)),
    shipping_charged_default: Number(shippingChargedDefault.toFixed(2)),
    supplies_cost_default: Number(suppliesCostDefault.toFixed(2)),
  })

  if (error) {
    redirect(
      `/app/settings/shipping?error=${encodeURIComponent(
        error.message || 'Could not create shipping profile'
      )}`
    )
  }

  redirect('/app/settings/shipping?saved=1')
}

export async function updateShippingProfileAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const id = safeText(formData.get('id'))
  const name = safeText(formData.get('name'))
  const cost = safeNumber(formData.get('cost'))
  const shippingChargedDefault = safeNumber(formData.get('shipping_charged_default'))
  const suppliesCostDefault = safeNumber(formData.get('supplies_cost_default'))

  if (!id) {
    redirect('/app/settings/shipping?error=Missing shipping profile id')
  }

  if (!name) {
    redirect('/app/settings/shipping?error=Profile name is required')
  }

  if (cost < 0 || shippingChargedDefault < 0 || suppliesCostDefault < 0) {
    redirect('/app/settings/shipping?error=Profile amounts cannot be negative')
  }

  const { error } = await supabase
    .from('shipping_profiles')
    .update({
      name,
      cost: Number(cost.toFixed(2)),
      shipping_charged_default: Number(shippingChargedDefault.toFixed(2)),
      supplies_cost_default: Number(suppliesCostDefault.toFixed(2)),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    redirect(
      `/app/settings/shipping?error=${encodeURIComponent(
        error.message || 'Could not update shipping profile'
      )}`
    )
  }

  redirect('/app/settings/shipping?updated=1')
}

export async function deleteShippingProfileAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const id = safeText(formData.get('id'))

  if (!id) {
    redirect('/app/settings/shipping?error=Missing shipping profile id')
  }

  const { error } = await supabase
    .from('shipping_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    redirect(
      `/app/settings/shipping?error=${encodeURIComponent(
        error.message || 'Could not delete shipping profile'
      )}`
    )
  }

  redirect('/app/settings/shipping?deleted=1')
}