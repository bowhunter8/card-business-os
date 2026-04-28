import Link from 'next/link'
import {
  resendConfirmationAction,
  signUpAction,
} from '@/app/actions/auth'

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

          <div className="mb-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-100">
            After signing up, you must confirm your email before logging in.
            <br />
            If you don&apos;t see the email, check your junk or spam folder.
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

          <form action={signUpAction} className="space-y-4">
            <div>
              <label className="app-label">Email</label>
              <input
                name="email"
                type="email"
                required
                className="app-input"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="app-label">Password</label>
              <input
                name="password"
                type="password"
                required
                minLength={6}
                className="app-input"
                placeholder="Minimum 6 characters"
              />
            </div>

            <button type="submit" className="app-button w-full">
              Create account
            </button>
          </form>

          <div className="mt-6 border-t border-zinc-800 pt-5">
            <form action={resendConfirmationAction} className="space-y-3">
              <div>
                <label className="app-label">Resend confirmation email</label>
                <input
                  name="email"
                  type="email"
                  required
                  className="app-input"
                  placeholder="you@example.com"
                />
              </div>

              <button type="submit" className="app-button w-full">
                Resend confirmation
              </button>
            </form>
          </div>

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