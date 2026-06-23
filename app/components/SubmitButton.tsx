'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

type SubmitButtonProps = {
  children: React.ReactNode
  pendingText?: string
  className?: string
}

export default function SubmitButton({
  children,
  pendingText = 'Working...',
  className = 'app-button w-full',
}: SubmitButtonProps) {
  const { pending } = useFormStatus()
  const [clicked, setClicked] = useState(false)

  const isLoading = pending || clicked

  return (
    <button
      type="submit"
      className={className}
      disabled={isLoading}
      aria-disabled={isLoading}
      onClick={() => setClicked(true)}
    >
      {isLoading ? `⏳ ${pendingText}` : children}
    </button>
  )
}