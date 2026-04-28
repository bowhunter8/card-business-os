import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type AppUserAccessRow = {
  id: string
  email: string
  role: string
  is_active: boolean
  display_name?: string | null
}

export default async function AdminPage() {
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

  if (access.role !== 'admin') {
    redirect('/app')
  }

  return (
    <div className="space-y-6">
      <div className="app-page-header">
        <div>
          <p className="app-subtitle">Admin</p>
          <h1 className="app-title">Admin Panel</h1>
          <p className="app-muted mt-2">
            Central place for app management, user access, backups, exports,
            data health checks, and future admin-only tools.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link
          href="/app/admin/users"
          className="app-card block hover:border-amber-700/70 hover:bg-amber-950/10"
        >
          <div className="text-lg font-semibold text-zinc-100">
            User Access
          </div>
          <p className="app-muted mt-2">
            Review approved users, admin roles, active access, and display
            names.
          </p>
          <div className="mt-4">
            <span className="app-badge app-badge-info">Admin only</span>
          </div>
        </Link>

        <Link
          href="/app/utilities"
          className="app-card block hover:border-zinc-700 hover:bg-zinc-900/60"
        >
          <div className="text-lg font-semibold text-zinc-100">
            Backup & Restore
          </div>
          <p className="app-muted mt-2">
            Download restore-capable backups and use restore/import tools from
            Utilities.
          </p>
          <div className="mt-4">
            <span className="app-badge">Utilities</span>
          </div>
        </Link>

        <Link
          href="/app/reports/tax"
          className="app-card block hover:border-zinc-700 hover:bg-zinc-900/60"
        >
          <div className="text-lg font-semibold text-zinc-100">
            Tax Exports
          </div>
          <p className="app-muted mt-2">
            Open tax summaries and export tools for TurboTax, QuickBooks, CPA
            review, and Schedule C support.
          </p>
          <div className="mt-4">
            <span className="app-badge app-badge-success">Tax safe</span>
          </div>
        </Link>

        <Link
          href="/app/settings"
          className="app-card block hover:border-zinc-700 hover:bg-zinc-900/60"
        >
          <div className="text-lg font-semibold text-zinc-100">
            Business Settings
          </div>
          <p className="app-muted mt-2">
            Manage app-level business settings, defaults, and tax-year setup.
          </p>
          <div className="mt-4">
            <span className="app-badge">Settings</span>
          </div>
        </Link>

        <Link
          href="/app/inventory"
          className="app-card block hover:border-zinc-700 hover:bg-zinc-900/60"
        >
          <div className="text-lg font-semibold text-zinc-100">
            Inventory Review
          </div>
          <p className="app-muted mt-2">
            Review available, personal collection, junk, sold, and starting
            inventory records.
          </p>
          <div className="mt-4">
            <span className="app-badge">Inventory</span>
          </div>
        </Link>

        <div className="app-card border-red-900/50 bg-red-950/10">
          <div className="text-lg font-semibold text-red-100">
            Danger Zone
          </div>
          <p className="app-muted mt-2">
            Reserved for future cleanup tools. Anything added here should use
            confirmations, safeguards, and backup reminders.
          </p>
          <div className="mt-4">
            <span className="app-badge app-badge-danger">Locked for now</span>
          </div>
        </div>
      </div>
    </div>
  )
}