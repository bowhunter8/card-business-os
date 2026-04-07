import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOutAction } from '@/app/actions/auth'

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
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
        
        {/* SIDEBAR */}
        <aside className="border-r border-zinc-800 bg-zinc-900/70 p-4">
          <div className="mb-6 text-lg font-semibold">
            Card Tracker
          </div>

          <nav className="flex flex-col gap-2 text-sm">
            
            <Link
              href="/app/dashboard"
              className="rounded-lg px-3 py-2 hover:bg-zinc-800"
            >
              Dashboard
            </Link>

            <Link
              href="/app/inventory"
              className="rounded-lg px-3 py-2 hover:bg-zinc-800"
            >
              Inventory
            </Link>

            {/* 🔥 NEW FEATURE */}
            <Link
              href="/app/starting-inventory"
              className="rounded-lg px-3 py-2 hover:bg-zinc-800"
            >
              Starting Inventory
            </Link>

            <Link
              href="/app/breaks"
              className="rounded-lg px-3 py-2 hover:bg-zinc-800"
            >
              Breaks
            </Link>

            <Link
              href="/app/sales"
              className="rounded-lg px-3 py-2 hover:bg-zinc-800"
            >
              Sales
            </Link>

            <Link
              href="/app/reports"
              className="rounded-lg px-3 py-2 hover:bg-zinc-800"
            >
              Reports
            </Link>

            <Link
              href="/app/settings"
              className="rounded-lg px-3 py-2 hover:bg-zinc-800"
            >
              Settings
            </Link>
          </nav>

          <div className="mt-6 border-t border-zinc-800 pt-4">
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-left hover:bg-zinc-800"
              >
                Sign Out
              </button>
            </form>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}