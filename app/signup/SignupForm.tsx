'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signUpAction } from '@/app/actions/auth'

export default function SignupForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form
      action={signUpAction}
      className="space-y-4"
      onSubmit={() => {
        setIsSubmitting(true)
      }}
    >
      <div>
        <label className="app-label">Email</label>
        <input
          name="email"
          type="email"
          required
          className="app-input"
          placeholder="you@example.com"
          disabled={isSubmitting}
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
          disabled={isSubmitting}
        />
      </div>

      <label className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300">
        <input
          name="accept_terms"
          type="checkbox"
          required
          value="yes"
          className="mt-1 h-4 w-4 shrink-0"
          disabled={isSubmitting}
        />
        <span>
          I agree to the{' '}
          <Link
            href="/terms"
            target="_blank"
            className="text-amber-300 hover:text-amber-200"
          >
            Terms & Conditions
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            target="_blank"
            className="text-amber-300 hover:text-amber-200"
          >
            Privacy Policy
          </Link>
          . I understand HITS is not tax, legal, accounting, or financial
          advice.
        </span>
      </label>

      <button
        type="submit"
        className="app-button w-full disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
      >
        {isSubmitting ? '⏳ Creating account...' : 'Create account'}
      </button>
    </form>
  )
}