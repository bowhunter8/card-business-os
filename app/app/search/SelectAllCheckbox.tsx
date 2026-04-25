'use client'

import { useEffect, useRef, useState } from 'react'

export default function SelectAllCheckbox({
  formId,
  fieldName,
  label,
}: {
  formId: string
  fieldName: string
  label: string
}) {
  const checkboxRef = useRef<HTMLInputElement | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const form = document.getElementById(formId)
    if (!form) return

    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement>(`input[name="${fieldName}"]`)
    ).filter((input) => !input.disabled)

    const selectedCount = inputs.filter((input) => input.checked).length

    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = selectedCount > 0 && selectedCount < inputs.length
    }

    setChecked(inputs.length > 0 && selectedCount === inputs.length)
  }, [formId, fieldName])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextChecked = event.target.checked
    const form = document.getElementById(formId)
    if (!form) return

    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement>(`input[name="${fieldName}"]`)
    ).filter((input) => !input.disabled)

    for (const input of inputs) {
      input.checked = nextChecked
    }

    setChecked(nextChecked)

    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = false
    }
  }

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={handleChange}
      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
    />
  )
}