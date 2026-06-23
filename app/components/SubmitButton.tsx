'use client'

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

  console.log('SubmitButton pending:', pending)

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? `⏳ ${pendingText}` : children}
    </button>
  )
}