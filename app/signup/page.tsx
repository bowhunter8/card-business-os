import Link from 'next/link'
import SignupForm from './SignupForm'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const params = await searchParams
  const error = params.error
  const message = params.message

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="app-card w-full">
          <div className="mb-6">
            <p className="app-subtitle">Card Business OS</p>
            <h1 className="app-title mt-2">Create account</h1>
            <p className="app-muted mt-2">
              Sign up to start tracking your inventory, sales, and taxes.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mb-4 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}

          <SignupForm />

          <div className="mt-5 text-center text-sm text-zinc-400">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-amber-300 hover:text-amber-200"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}