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
        <aside className="border-r border-zinc-800 bg-zinc-900/70 p-4">
          <div className="mb-8">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Standalone App
            </div>
            <div className="mt-2 text-xl font-semibold">Card Business OS</div>
          </div>

          <nav className="space-y-2">
            <Link
              href="/app"
              className="block rounded-xl border border-zinc-800 px-3 py-2 hover:bg-zinc-800"
            >
              Dashboard
            </Link>

            <Link
              href="/app/inventory"
              className="block rounded-xl border border-zinc-800 px-3 py-2 hover:bg-zinc-800"
            >
              Inventory
            </Link>

            <Link
              href="/app/breaks"
              className="block rounded-xl border border-zinc-800 px-3 py-2 hover:bg-zinc-800"
            >
              Breaks
            </Link>

            <Link
              href="/app/utilities"
              className="block rounded-xl border border-zinc-800 px-3 py-2 hover:bg-zinc-800"
            >
              Utilities
            </Link>
          </nav>

          <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="text-xs text-zinc-500">Signed in as</div>
            <div className="mt-1 break-all text-sm">{user.email}</div>

            <form action={signOutAction} className="mt-4">
              <button
                type="submit"
                className="w-full rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <main className="p-6 md:p-8">{children}</main>
      </div>
    </div>
  )
}