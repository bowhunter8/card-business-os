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
    .select('id, email, role, is_active, display_name')
    .ilike('email', userEmail)
    .eq('is_active', true)
    .maybeSingle()

  if (!appUserAccess) {
    redirect('/not-authorized')
  }

  const access = appUserAccess as AppUserAccessRow
  const isAdmin = access.role === 'admin'

  const displayName = access.display_name || user.email

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_1fr]">
        <aside className="border-r border-zinc-800 bg-zinc-900/70 p-4">
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

            <Link
              href="/app/breaks"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Breaks
            </Link>

            <Link
              href="/app/whatnot-orders"
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-800"
            >
              Orders
            </Link>

            {/* ✅ NEW SETTINGS LINK */}
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
                {isAdmin ? 'Admin' : 'Approved User'}
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

          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}