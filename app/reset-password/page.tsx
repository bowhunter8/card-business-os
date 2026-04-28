'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession()

      if (data.session) {
        setHasSession(true)
      } else {
        setError('Password reset session is missing or expired. Request a new reset link.')
        setHasSession(false)
      }

      setIsCheckingSession(false)
    }

    checkSession()
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaving || isCheckingSession) return

    setMessage('')
    setError('')

    if (!hasSession) {
      setError('Password reset session is missing or expired. Request a new reset link.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      setIsSaving(true)

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      setPassword('')
      setConfirmPassword('')
      setMessage('Password updated successfully. You can now sign in with your new password.')

      await supabase.auth.signOut()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold">Choose New Password</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Enter a new password for your account.
        </p>

        {isCheckingSession ? (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300">
            Checking password reset link...
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {message}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">New Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isCheckingSession || !hasSession || Boolean(message)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isCheckingSession || !hasSession || Boolean(message)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving || isCheckingSession || !hasSession || Boolean(message)}
            className="w-full rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save New Password'}
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