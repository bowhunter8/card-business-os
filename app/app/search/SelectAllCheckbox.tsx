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

  function getSelectableInputs() {
    const escapedFieldName =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(fieldName) : fieldName
    const escapedFormId =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(formId) : formId

    const form = document.getElementById(formId)

    const formInputs = form
      ? Array.from(
          form.querySelectorAll<HTMLInputElement>(`input[name="${escapedFieldName}"]`)
        )
      : []

    const linkedInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `input[form="${escapedFormId}"][name="${escapedFieldName}"]`
      )
    )

    const uniqueInputs = Array.from(new Set([...formInputs, ...linkedInputs]))

    return uniqueInputs.filter((input) => !input.disabled)
  }

  function syncCheckedState() {
    const inputs = getSelectableInputs()
    const selectedCount = inputs.filter((input) => input.checked).length
    const allChecked = inputs.length > 0 && selectedCount === inputs.length

    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = selectedCount > 0 && selectedCount < inputs.length
    }

    setChecked(allChecked)
  }

  useEffect(() => {
    syncCheckedState()

    function handleInputChange(event: Event) {
      const target = event.target

      if (!(target instanceof HTMLInputElement)) return
      if (target.name !== fieldName) return

      const belongsToForm =
        target.form?.id === formId || target.getAttribute('form') === formId

      if (!belongsToForm) return

      syncCheckedState()
    }

    document.addEventListener('change', handleInputChange)

    return () => {
      document.removeEventListener('change', handleInputChange)
    }
  }, [formId, fieldName])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextChecked = event.target.checked
    const inputs = getSelectableInputs()

    for (const input of inputs) {
      input.checked = nextChecked
      input.dispatchEvent(new Event('change', { bubbles: true }))
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
