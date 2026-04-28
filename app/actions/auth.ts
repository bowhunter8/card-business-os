'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('email not confirmed')) {
    return 'Email not confirmed. Please check your email and click the confirmation link. Be sure to check your junk or spam folder.'
  }

  if (normalized.includes('invalid login credentials')) {
    return 'Invalid email or password.'
  }

  return message
}

function trialDefaults() {
  const now = new Date()
  const trialDays = 30

  const trialEnd = new Date(now)
  trialEnd.setDate(trialEnd.getDate() + trialDays)

  return {
    role: 'user',
    is_active: true,
    beta_unlimited: false,
    subscription_status: 'trial',
    subscription_plan: 'trial',
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
  }
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '').trim()

  if (!email || !password) {
    redirect('/signup?error=Email and password are required')
  }

  if (password.length < 6) {
    redirect('/signup?error=Password must be at least 6 characters')
  }

  const supabase = await createClient()

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (signUpError) {
    redirect(
      `/signup?error=${encodeURIComponent(friendlyAuthError(signUpError.message))}`
    )
  }

  const { data: existingUser } = await supabase
    .from('app_users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (!existingUser) {
    await supabase.from('app_users').insert({
      email,
      ...trialDefaults(),
    })
  }

  redirect(
    '/login?message=Account created. Please check your email to confirm your account before signing in. Be sure to check your junk or spam folder.'
  )
}

export async function resendConfirmationAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) {
    redirect(
      '/login?error=Enter your email address first so we can resend the confirmation email.'
    )
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  })

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`
    )
  }

  redirect(
    '/login?message=Confirmation email sent. Please check your inbox, junk, or spam folder.'
  )
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '').trim()

  if (!email || !password) {
    redirect('/login?error=Email and password are required')
  }

  const supabase = await createClient()

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    redirect(
      `/login?error=${encodeURIComponent(friendlyAuthError(signInError.message))}`
    )
  }

  const { data: existingUser } = await supabase
    .from('app_users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (!existingUser) {
    await supabase.from('app_users').insert({
      email,
      ...trialDefaults(),
    })
  }

  redirect('/app')
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}