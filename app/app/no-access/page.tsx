import Link from 'next/link'

export default function NoAccessPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="app-card w-full text-center">
          <h1 className="app-title">Access Required</h1>

          <p className="app-muted mt-3">
            Your trial has ended or your subscription is inactive.
          </p>

          <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-100">
            You no longer have access to your inventory, sales tracking, and reporting tools.
          </div>

          <p className="app-muted mt-4 text-sm">
            Subscription options will be available soon. If you believe this is an error or need continued access, please reach out.
          </p>

          <div className="mt-6 space-y-3">
            <Link href="/login" className="app-button w-full">
              Back to Login
            </Link>

            <Link
              href="/signup"
              className="block text-sm text-zinc-400 hover:text-zinc-100"
            >
              Create another account
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}