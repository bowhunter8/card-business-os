'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type SubscriptionStatus =
  | 'beta'
  | 'trial'
  | 'active'
  | 'comped'
  | 'past_due'
  | 'expired'
  | 'canceled'
  | 'inactive'

async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const userEmail = String(user.email ?? '').trim().toLowerCase()

  const { data: currentUser } = await supabase
    .from('app_users')
    .select('id, role, email, is_active')
    .ilike('email', userEmail)
    .eq('is_active', true)
    .maybeSingle()

  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Not authorized')
  }

  return { supabase, currentUser }
}

export async function addApprovedUser(formData: FormData) {
  const { supabase } = await requireAdmin()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const displayName = String(formData.get('display_name') ?? '').trim()
  const roleValue = String(formData.get('role') ?? 'user').trim()
  const statusValue = String(formData.get('status') ?? 'active').trim()

  const role = roleValue === 'admin' ? 'admin' : 'user'
  const isActive = statusValue !== 'inactive'

  if (!email) {
    throw new Error('Email is required')
  }

  if (!email.includes('@')) {
    throw new Error('Enter a valid email address')
  }

  const { data: existingUser, error: existingError } = await supabase
    .from('app_users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if (existingUser) {
    const updatePayload: {
      role: 'admin' | 'user'
      is_active: boolean
      display_name?: string | null
    } = {
      role,
      is_active: isActive,
    }

    if (displayName) {
      updatePayload.display_name = displayName
    }

    const { error } = await supabase
      .from('app_users')
      .update(updatePayload)
      .eq('id', existingUser.id)

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath('/app/admin/users')
    return
  }

  const { error } = await supabase.from('app_users').insert({
    email,
    display_name: displayName || null,
    role,
    is_active: isActive,
    beta_unlimited: true,
    subscription_status: 'beta',
    subscription_plan: 'free_beta',
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/app/admin/users')
}

export async function toggleUserActive(userId: string, makeActive: boolean) {
  const { supabase, currentUser } = await requireAdmin()

  if (currentUser.id === userId && !makeActive) {
    throw new Error('You cannot deactivate your own account')
  }

  const { error } = await supabase
    .from('app_users')
    .update({ is_active: makeActive })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/app/admin/users')
}

export async function setUserRole(userId: string, role: 'admin' | 'user') {
  const { supabase, currentUser } = await requireAdmin()

  if (currentUser.id === userId && role !== 'admin') {
    throw new Error('You cannot remove your own admin role')
  }

  const { error } = await supabase
    .from('app_users')
    .update({ role })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/app/admin/users')
}

export async function setSubscriptionStatus(
  userId: string,
  status: SubscriptionStatus
) {
  const { supabase } = await requireAdmin()

  const allowedStatuses: SubscriptionStatus[] = [
    'beta',
    'trial',
    'active',
    'comped',
    'past_due',
    'expired',
    'canceled',
    'inactive',
  ]

  if (!allowedStatuses.includes(status)) {
    throw new Error('Invalid subscription status')
  }

  const { error } = await supabase
    .from('app_users')
    .update({ subscription_status: status })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/app/admin/users')
}

export async function setBetaUnlimited(userId: string, betaUnlimited: boolean) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('app_users')
    .update({ beta_unlimited: betaUnlimited })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/app/admin/users')
}