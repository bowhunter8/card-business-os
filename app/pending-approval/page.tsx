import Link from 'next/link'
import { signOutAction } from '@/app/actions/auth'

export default function PendingApprovalPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="app-card w-full">
          <div className="mb-6">
            <p className="app-subtitle">Card Business OS</p>
            <h1 className="app-title mt-2">Pending approval</h1>
            <p className="app-muted mt-2">
              Your account has been created, but it still needs to be activated
              by an admin before you can access the app.
            </p>
          </div>

          <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-100">
            Once your account is approved, you can sign in and start tracking
            your own inventory, sales, expenses, and tax records.
          </div>

          <div className="mt-6 grid gap-3">
            <Link href="/login" className="app-button w-full text-center">
              Back to sign in
            </Link>

            <form action={signOutAction}>
              <button type="submit" className="app-button w-full">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}