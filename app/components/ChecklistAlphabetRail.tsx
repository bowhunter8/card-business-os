'use client'

type ChecklistAlphabetRailProps = {
  ariaLabel: string
  letters: string[]
  availableLetters: string[]
  listId: string
  targetPrefix: string
}

export default function ChecklistAlphabetRail({
  ariaLabel,
  letters,
  availableLetters,
  listId,
  targetPrefix,
}: ChecklistAlphabetRailProps) {
  const available = new Set(availableLetters)

  function jumpToLetter(letter: string) {
    const list = document.getElementById(listId)
    const target = document.getElementById(
      `${targetPrefix}${letter.toLowerCase()}`
    )

    if (!list || !target) return

    const listRect = list.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = list.scrollTop + targetRect.top - listRect.top

    list.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
    })
  }

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-3 self-start rounded-md border border-zinc-800 bg-black/40 py-1 text-center"
    >
      {letters.map((letter) =>
        available.has(letter) ? (
          <button
            key={letter}
            type="button"
            onClick={() => jumpToLetter(letter)}
            className="block w-full py-px text-[10px] font-semibold leading-4 text-cyan-300 transition hover:text-cyan-100"
            title={`Jump to ${letter}`}
          >
            {letter}
          </button>
        ) : (
          <span
            key={letter}
            className="block py-px text-[10px] leading-4 text-zinc-700"
          >
            {letter}
          </span>
        )
      )}
    </nav>
  )
}
