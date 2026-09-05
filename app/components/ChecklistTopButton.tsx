'use client'

type ChecklistTopButtonProps = {
  className?: string
  targetId?: string
  scrollContainerId?: string
}

export default function ChecklistTopButton({
  className = 'app-button',
  targetId = 'checklist-top',
}: ChecklistTopButtonProps) {
  function goToTop() {
    const target = document.getElementById(targetId)
    if (!target) return

    // Calculate the target's real document position rather than relying on
    // hashes, reloads, router navigation, or the sticky checklist pane.
    const top = target.getBoundingClientRect().top + window.scrollY

    window.scrollTo({
      top,
      left: 0,
      behavior: 'auto',
    })
  }

  return (
    <button
      type="button"
      className={className}
      title="Back to the top of this checklist"
      // Keep the button from taking focus inside the sticky pane. A focused
      // control can cause the browser to pull that pane back into view after
      // the page has been repositioned.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.currentTarget.blur()
        goToTop()

        // Re-apply once after the sticky layout has recalculated.
        requestAnimationFrame(goToTop)
      }}
    >
      ↑ Top
    </button>
  )
}
