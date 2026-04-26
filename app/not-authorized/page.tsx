import Link from 'next/link'

export default function NotAuthorizedPage() {
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-2xl font-semibold">Access Not Approved</h1>

        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          This account is signed in, but it has not been approved to use Card Business OS yet.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          If you believe this is a mistake, contact the app owner and ask them to approve your email address.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/login" className="app-button">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}