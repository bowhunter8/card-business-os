import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOutAction } from '@/app/actions/auth'
import AppGlobalSearch from './components/app-global-search'

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[176px_1fr] lg:grid-cols-[188px_1fr]">
        <aside className="border-r border-zinc-800 bg-zinc-900/70 p-2 md:sticky md:top-0 md:h-screen md:overflow-y-auto">
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Standalone App
            </div>
            <div className="mt-1 text-lg font-semibold leading-tight">
              Card Business OS
            </div>
          </div>

          <nav className="space-y-1">
            <Link
              href="/app"
              className="block rounded-lg border border-zinc-800 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Dashboard
            </Link>

            <Link
              href="/app/inventory"
              className="block rounded-lg border border-zinc-800 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Inventory
            </Link>

            <Link
              href="/app/breaks"
              className="block rounded-lg border border-zinc-800 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Breaks
            </Link>

            <Link
              href="/app/whatnot-orders"
              className="block rounded-lg border border-zinc-800 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Whatnot Orders
            </Link>

            <Link
              href="/app/utilities"
              className="block rounded-lg border border-zinc-800 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Utilities
            </Link>
          </nav>

          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5">
            <div className="text-[11px] text-zinc-500">Signed in as</div>
            <div className="mt-1 break-all text-sm leading-snug">{user.email}</div>

            <form action={signOutAction} className="mt-2.5">
              <button
                type="submit"
                className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 px-2.5 py-2 backdrop-blur md:px-3">
            <AppGlobalSearch />
          </div>

          <div className="px-2.5 py-3 md:px-3 md:py-3">{children}</div>
        </main>
      </div>
    </div>
  )
}