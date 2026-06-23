'use client'

import { useState } from 'react'
import { signInAction } from '@/app/actions/auth'

export default function LoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form
      action={signInAction}
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
          className="app-input"
          placeholder="Enter your password"
          disabled={isSubmitting}
        />
      </div>

      <button
        type="submit"
        className="app-button w-full disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
      >
        {isSubmitting ? '⏳ Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}