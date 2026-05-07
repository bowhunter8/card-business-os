import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOutAction } from '@/app/actions/auth'
import AppGlobalSearch from './components/app-global-search'

type AppUserAccessRow = {
  id: string
  email: string
  role: string
  is_active: boolean
  display_name?: string | null
  beta_unlimited?: boolean | null
  subscription_status?: string | null
  trial_ends_at?: string | null
}

function hasSubscriptionAccess(access: AppUserAccessRow) {
  if (access.beta_unlimited) return true

  const status = String(access.subscription_status ?? '').trim().toLowerCase()

  if (status === 'beta') return true
  if (status === 'active') return true
  if (status === 'comped') return true

  if (status === 'trial' && access.trial_ends_at) {
    return new Date(access.trial_ends_at).getTime() > Date.now()
  }

  return false
}

function getTrialDaysRemaining(access: AppUserAccessRow) {
  if (access.beta_unlimited) return null

  const status = String(access.subscription_status ?? '').trim().toLowerCase()

  if (status !== 'trial' || !access.trial_ends_at) {
    return null
  }

  const trialEndTime = new Date(access.trial_ends_at).getTime()
  const now = Date.now()
  const millisecondsRemaining = trialEndTime - now

  if (millisecondsRemaining <= 0) return 0

  return Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24))
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userEmail = String(user.email ?? '').trim().toLowerCase()

  const { data: appUserAccess } = await supabase
    .from('app_users')
    .select(
      'id, email, role, is_active, display_name, beta_unlimited, subscription_status, trial_ends_at'
    )
    .ilike('email', userEmail)
    .maybeSingle()

  if (!appUserAccess) redirect('/login')

  const access = appUserAccess as AppUserAccessRow

  if (!access.is_active) redirect('/login')
  if (!hasSubscriptionAccess(access)) redirect('/not-authorized')

  const isAdmin = access.role === 'admin'
  const displayName = access.display_name || user.email
  const trialDaysRemaining = getTrialDaysRemaining(access)

  const showTrialWarning =
    trialDaysRemaining !== null &&
    trialDaysRemaining > 0 &&
    trialDaysRemaining <= 7

  return (
    <div className="min-h-screen">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_1fr]">

        {/* Sidebar */}
        <aside className="app-section border-r border-zinc-900 bg-black md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto">
          <div className="mb-6">
            <img
              src="/hits-logo.png"
              alt="HITS Inventory & Profit Tax Tracking"
              className="h-auto w-full max-w-[225px] object-contain"
            />
            <div className="mt-2 text-xs app-subtitle leading-tight">
              Inventory & Profit Tax Tracking
            </div>
          </div>

          <nav className="space-y-2">
            <Link href="/app" className="app-button w-full justify-start hover:border-cyan-500/40 hover:text-cyan-300">Dashboard</Link>
            <Link href="/app/inventory" className="app-button w-full justify-start hover:border-cyan-500/40 hover:text-cyan-300">Inventory Items</Link>
            <Link href="/app/breaks" className="app-button w-full justify-start hover:border-cyan-500/40 hover:text-cyan-300">Orders</Link>
            <Link href="/app/settings" className="app-button w-full justify-start hover:border-cyan-500/40 hover:text-cyan-300">Settings</Link>
            <Link href="/app/utilities" className="app-button w-full justify-start hover:border-cyan-500/40 hover:text-cyan-300">Utilities</Link>

            {isAdmin && (
              <Link
                href="/app/admin/users"
                className="app-button-warning w-full justify-start hover:border-cyan-500/40"
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="mt-8 app-card-tight text-sm">
            <div className="mb-2 app-subtitle">Signed in as</div>
            <div className="break-all">{displayName}</div>

            <div className="mt-2">
              <span className="app-badge app-badge-info">
                {isAdmin ? 'Admin' : 'User'}
              </span>
            </div>

            <form action={signOutAction} className="mt-4">
              <button className="app-button w-full hover:border-cyan-500/40 hover:text-cyan-300">Sign out</button>
            </form>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0">

          {/* Top Bar */}
          <div className="sticky top-0 z-50 bg-black px-4 py-3 md:px-6">
            <div className="mx-auto max-w-[1800px]">
              <AppGlobalSearch />
            </div>
          </div>

          {showTrialWarning && (
            <div className="app-alert-warning">
              <div className="mx-auto max-w-7xl">
                Your trial ends in{' '}
                <span className="font-semibold">
                  {trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          )}

          <div className="px-4 pb-4 pt-2 md:px-6 md:pb-6 md:pt-3">{children}</div>
        </main>
      </div>
    </div>
  )
}
