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

  if (millisecondsRemaining <= 0) {
    return 0
  }

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

  if (!user) {
    redirect('/login')
  }

  const userEmail = String(user.email ?? '').trim().toLowerCase()

  const { data: appUserAccess } = await supabase
    .from('app_users')
    .select(
      'id, email, role, is_active, display_name, beta_unlimited, subscription_status, trial_ends_at'
    )
    .ilike('email', userEmail)
    .maybeSingle()

  if (!appUserAccess) {
    redirect('/login')
  }

  const access = appUserAccess as AppUserAccessRow

  if (!access.is_active) {
    redirect('/login')
  }

  if (!hasSubscriptionAccess(access)) {
    redirect('/app/no-access')
  }

  const isAdmin = access.role === 'admin'
  const displayName = access.display_name || user.email
  const trialDaysRemaining = getTrialDaysRemaining(access)
  const showTrialWarning =
    trialDaysRemaining !== null &&
    trialDaysRemaining > 0 &&
    trialDaysRemaining <= 7

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_1fr]">
        <aside className="border-r border-zinc-800 bg-zinc-900/70 p-4 md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Standalone App
            </div>
            <div className="text-3xl font-semibold">Card Business OS</div>
          </div>

          <nav className="space-y-2">
            <Link
              href="/app"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Dashboard
            </Link>

            <Link
              href="/app/inventory"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Inventory
            </Link>

            {/* 🔥 Renamed from Breaks */}
            <Link
              href="/app/breaks"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Purchases
            </Link>

            {/* 🔥 Renamed from Orders */}
            <Link
              href="/app/whatnot-orders"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Import
            </Link>

            <Link
              href="/app/settings"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Settings
            </Link>

            <Link
              href="/app/utilities"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Utilities
            </Link>

            {isAdmin ? (
              <Link
                href="/app/admin/users"
                className="block rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-amber-200 hover:bg-amber-900/30"
              >
                Admin
              </Link>
            ) : null}
          </nav>

          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
            <div className="mb-2">Signed in as</div>
            <div className="break-all text-zinc-200">{displayName}</div>

            <div className="mt-2">
              <span className="app-badge app-badge-info">
                {isAdmin ? 'Admin' : 'User'}
              </span>
            </div>

            <form action={signOutAction} className="mt-4">
              <button className="app-button w-full">Sign out</button>
            </form>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <AppGlobalSearch />
          </div>

          {showTrialWarning ? (
            <div className="border-b border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              <div className="mx-auto max-w-7xl">
                Your trial ends in{' '}
                <span className="font-semibold">
                  {trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'}
                </span>
                . Subscription options will be available here before launch.
              </div>
            </div>
          ) : null}

          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}