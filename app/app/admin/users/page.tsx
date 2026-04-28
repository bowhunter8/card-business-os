import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UserActionButtons from './user-action-buttons'

type AppUserAccessRow = {
  id: string
  email: string
  role: string
  is_active: boolean
  display_name?: string | null
  created_at?: string | null
  beta_unlimited?: boolean | null
  subscription_status?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return '—'

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const params = await searchParams
  const filter = params.filter
  const query = (params.q ?? '').toLowerCase()

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

  // ✅ FIX: include subscription + beta fields
  const { data: users, error } = await supabase
    .from('app_users')
    .select(
      'id, email, role, is_active, display_name, created_at, beta_unlimited, subscription_status'
    )
    .order('created_at', { ascending: false })

  const allRows = (users ?? []) as AppUserAccessRow[]

  const rows = allRows.filter((row) => {
    if (filter === 'active' && !row.is_active) return false
    if (filter === 'inactive' && row.is_active) return false
    if (filter === 'admins' && row.role !== 'admin') return false

    if (query) {
      const email = row.email.toLowerCase()
      const name = (row.display_name ?? '').toLowerCase()

      if (!email.includes(query) && !name.includes(query)) {
        return false
      }
    }

    return true
  })

  const activeCount = allRows.filter((row) => row.is_active).length
  const adminCount = allRows.filter((row) => row.role === 'admin').length
  const inactiveCount = allRows.filter((row) => !row.is_active).length

  return (
    <div className="space-y-6">
      <div className="app-page-header">
        <div>
          <p className="app-subtitle">Admin</p>
          <h1 className="app-title">User Access</h1>
          <p className="app-muted mt-2">
            Review users, control access, and manage admin roles.
          </p>
        </div>
      </div>

      <form className="app-card">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by email or name..."
            className="app-input"
          />

          {filter ? (
            <input type="hidden" name="filter" value={filter} />
          ) : null}

          <button type="submit" className="app-button">
            Search
          </button>

          {query ? (
            <a
              href={`/app/admin/users${filter ? `?filter=${filter}` : ''}`}
              className="app-button-secondary"
            >
              Clear
            </a>
          ) : null}
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <a href="/app/admin/users?filter=active" className="app-card">
          <div className="app-muted text-sm">Active Users</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-100">
            {activeCount}
          </div>
        </a>

        <a href="/app/admin/users?filter=admins" className="app-card">
          <div className="app-muted text-sm">Admins</div>
          <div className="mt-2 text-3xl font-semibold text-amber-200">
            {adminCount}
          </div>
        </a>

        <a href="/app/admin/users?filter=inactive" className="app-card">
          <div className="app-muted text-sm">Inactive</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-100">
            {inactiveCount}
          </div>
        </a>
      </div>

      <div className="app-card overflow-hidden p-0">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="font-semibold text-zinc-100">Users</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/70 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800">
              {rows.map((row) => {
                const isCurrentUser = row.id === access.id
                const isRowAdmin = row.role === 'admin'
                const isRowActive = row.is_active
                const betaUnlimited = Boolean(row.beta_unlimited)
                const subscriptionStatus = row.subscription_status || 'beta'

                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <div className="text-zinc-100">
                        {row.display_name || '—'}
                      </div>
                      <div className="text-xs text-zinc-500">{row.email}</div>
                    </td>

                    <td className="px-4 py-3">
                      {isRowAdmin ? 'Admin' : 'User'}
                    </td>

                    <td className="px-4 py-3">
                      {isRowActive ? 'Active' : 'Inactive'}
                    </td>

                    <td className="px-4 py-3">
                      {subscriptionStatus}
                      {betaUnlimited ? ' (Beta)' : ''}
                    </td>

                    <td className="px-4 py-3">
                      {formatDate(row.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      <UserActionButtons
                        userId={row.id}
                        isCurrentUser={isCurrentUser}
                        isRowAdmin={isRowAdmin}
                        isRowActive={isRowActive}
                        email={row.email}
                        subscriptionStatus={subscriptionStatus}
                        betaUnlimited={betaUnlimited}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}