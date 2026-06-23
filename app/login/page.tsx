import Link from 'next/link'
import { signInAction } from '@/app/actions/auth'
import SubmitButton from '@/app/components/SubmitButton'

export default async function LoginPage({
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
            <h1 className="app-title mt-2">Sign in</h1>
            <p className="app-muted mt-2">
              Sign in to your standalone inventory, sales, and tax tracking
              system.
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

          <form action={signInAction} className="space-y-4">
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
                className="app-input"
                placeholder="Enter your password"
              />
            </div>

            <SubmitButton pendingText="Signing in...">
              Sign in
            </SubmitButton>
          </form>

          <div className="mt-5 flex flex-col gap-2 text-center text-sm text-zinc-400">
            <Link
              href="/forgot-password"
              className="text-zinc-400 hover:text-zinc-100"
            >
              Forgot password?
            </Link>

            <div>
              Don&apos;t have an account?{' '}
              <Link
                href="/signup"
                className="text-amber-300 hover:text-amber-200"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}