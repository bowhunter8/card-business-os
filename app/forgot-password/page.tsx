import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

async function requestPasswordResetAction(formData: FormData) {
  'use server'

  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) {
    redirect('/forgot-password?error=Enter your email address.')
  }

  const supabase = await createClient()
  const headersList = await headers()
  const origin = headersList.get('origin') ?? 'http://localhost:3000'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/login?message=Check your email for a secure password reset link.')
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params.error

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold">Reset Password</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Enter your account email. If the email exists, a secure reset link will be sent to that inbox.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <form action={requestPasswordResetAction} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Send reset link
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-zinc-100">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  )
}