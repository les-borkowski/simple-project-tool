import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test/render'
import { setViewportWidth } from '../../test/setup'
import { ConfirmDialog } from './ConfirmDialog'

// T08: ConfirmDialog renders <Modal size="sm"> internally. Its public props are
// unchanged, so all 6 existing call sites keep working *and* inherit Escape,
// focus trap + restore, ref-counted body scroll lock, dialog semantics, the
// 85dvh height cap and the mobile sheet layout.

// Mounts ConfirmDialog the way a real call site does: from a trigger, in a
// later commit than the one that focused the trigger. This ordering matters —
// the focus trap records its restore target when it activates, so a harness
// that mounts the dialog in the same commit as the trigger would prove nothing
// (see useFocusTrap.test.tsx).
function ConfirmHarness({
  onConfirm = vi.fn(),
  onCancel = vi.fn(),
  description,
  confirmLabel,
  danger,
}: {
  onConfirm?: () => void
  onCancel?: () => void
  description?: string
  confirmLabel?: string
  danger?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        Delete project
      </button>
      <button type="button">Background button</button>
      {open && (
        <ConfirmDialog
          title="Delete project?"
          description={description}
          confirmLabel={confirmLabel}
          danger={danger}
          onConfirm={() => {
            setOpen(false)
            onConfirm()
          }}
          onCancel={() => {
            setOpen(false)
            onCancel()
          }}
        />
      )}
    </div>
  )
}

// Opens the dialog and waits for its content, deliberately *without* querying
// by role — so the behavioural tests below fail on the behaviour they name
// (focus, Escape, scroll lock) rather than all collapsing into "no dialog role".
async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete project' }))
  await screen.findByRole('button', { name: 'Cancel' })
}

describe('ConfirmDialog', () => {
  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <ConfirmDialog title="Delete project?" onConfirm={onConfirm} onCancel={onCancel} />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <ConfirmDialog title="Delete project?" onConfirm={onConfirm} onCancel={onCancel} />
    )

    await user.click(screen.getByRole('button', { name: 'Are you sure?' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  describe('public props are unchanged (all 6 call sites keep working)', () => {
    it('shows the optional description under the title', () => {
      renderWithProviders(
        <ConfirmDialog
          title="Delete project?"
          description="This cannot be undone."
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    })

    it('uses a custom confirmLabel as the confirm button label', () => {
      renderWithProviders(
        <ConfirmDialog
          title="Delete project?"
          confirmLabel="Delete"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Are you sure?' })).not.toBeInTheDocument()
    })

    it('styles the confirm button as destructive by default and as accent when danger is false', () => {
      const view = renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )
      expect(screen.getByRole('button', { name: 'Are you sure?' }).className).toContain('bg-red-600')
      view.unmount()

      renderWithProviders(
        <ConfirmDialog title="Archive?" danger={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
      )
      const confirm = screen.getByRole('button', { name: 'Are you sure?' })
      expect(confirm.className).toContain('accent-bg')
      expect(confirm.className).not.toContain('bg-red-600')
    })
  })

  describe('dialog semantics', () => {
    it('is a modal dialog with an accessible name taken from its title', () => {
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const dialog = screen.getByRole('dialog', { name: 'Delete project?' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('labels the dialog by the element that holds the title text', () => {
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const dialog = screen.getByRole('dialog')
      const labelledBy = dialog.getAttribute('aria-labelledby')
      expect(labelledBy).toBeTruthy()
      expect(document.getElementById(labelledBy as string)).toHaveTextContent('Delete project?')
    })
  })

  describe('overlay behaviour inherited from Modal', () => {
    it('cancels when Escape is pressed', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      renderWithProviders(<ConfirmHarness onCancel={onCancel} />)

      await openConfirm(user)
      await user.keyboard('{Escape}')

      expect(onCancel).toHaveBeenCalledTimes(1)
      await waitFor(() => {
        expect(screen.queryByText('Delete project?')).not.toBeInTheDocument()
      })
    })

    it('moves focus onto a control inside the dialog when it opens', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ConfirmHarness />)

      await openConfirm(user)

      await waitFor(() => {
        expect([
          screen.getByRole('button', { name: 'Cancel' }),
          screen.getByRole('button', { name: 'Are you sure?' }),
        ]).toContain(document.activeElement)
      })
    })

    it('keeps Tab inside the dialog instead of reaching the page behind it', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ConfirmHarness />)

      await openConfirm(user)
      const background = screen.getByRole('button', { name: 'Background button' })
      const trigger = screen.getByRole('button', { name: 'Delete project' })

      await user.tab()

      expect(document.activeElement).not.toBe(background)
      expect(document.activeElement).not.toBe(trigger)
      expect([
        screen.getByRole('button', { name: 'Cancel' }),
        screen.getByRole('button', { name: 'Are you sure?' }),
      ]).toContain(document.activeElement)
    })

    it('wraps Tab from the confirm button back to the cancel button', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ConfirmHarness />)

      await openConfirm(user)
      const cancel = screen.getByRole('button', { name: 'Cancel' })
      const confirm = screen.getByRole('button', { name: 'Are you sure?' })

      confirm.focus()
      await user.tab()

      expect(document.activeElement).toBe(cancel)
    })

    it('returns focus to the trigger after cancelling', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ConfirmHarness />)

      const trigger = screen.getByRole('button', { name: 'Delete project' })
      await openConfirm(user)
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(document.activeElement).toBe(trigger)
      })
    })

    it('locks body scroll while open and unlocks it once closed', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ConfirmHarness />)

      expect(document.body.style.overflow).not.toBe('hidden')

      await openConfirm(user)
      expect(document.body.style.overflow).toBe('hidden')

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => {
        expect(document.body.style.overflow).not.toBe('hidden')
      })
    })

    it('caps its height at 85dvh and scrolls a long description internally', () => {
      renderWithProviders(
        <ConfirmDialog
          title="Delete project?"
          description="A very long explanation."
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog.className).toContain('max-h-[85dvh]')

      const scroller = screen.getByText('A very long explanation.').closest('.overflow-y-auto')
      expect(scroller).not.toBeNull()
      expect(scroller).not.toContainElement(screen.getByRole('button', { name: 'Cancel' }))
    })

    it('renders through a portal on document.body', () => {
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const overlay = screen.getByRole('dialog').parentElement as HTMLElement
      expect(overlay.parentElement).toBe(document.body)
    })
  })

  describe('at 375px', () => {
    it('is bottom-anchored as a sheet with top-rounded corners and safe-area padding', () => {
      setViewportWidth(375)
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const dialog = screen.getByRole('dialog')
      const overlay = dialog.parentElement as HTMLElement

      expect(overlay.className).toContain('items-end')
      expect(dialog.className).toContain('rounded-t-2xl')
      expect(dialog.outerHTML).toMatch(/safe-area-inset-bottom/)
    })

    it('never applies the phone-hostile min-w-[67vw]', () => {
      setViewportWidth(375)
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog.className).not.toContain('min-w-[67vw]')
      expect((dialog.parentElement as HTMLElement).outerHTML).not.toContain('min-w-[67vw]')
    })
  })

  describe('at 1280px the desktop appearance is unchanged', () => {
    it('keeps the full-screen centred overlay with the same dim backdrop', () => {
      setViewportWidth(1280)
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const overlay = screen.getByRole('dialog').parentElement as HTMLElement

      expect(overlay.className).toContain('fixed')
      expect(overlay.className).toContain('inset-0')
      expect(overlay.className).toContain('z-50')
      expect(overlay.className).toContain('bg-black/40')
      expect(overlay.className).toContain('md:items-center')
      expect(overlay.className).toContain('justify-center')
    })

    it('keeps the small centred panel width and card surface', () => {
      setViewportWidth(1280)
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const dialog = screen.getByRole('dialog')

      expect(dialog.className).toContain('max-w-sm')
      expect(dialog.className).toContain('w-full')
      expect(dialog.className).toContain('bg-white')
      expect(dialog.className).toContain('dark:bg-stone-800')
      expect(dialog.className).toMatch(/\bmd:rounded-(md|lg|xl|2xl)\b/)
      expect(dialog.className).toContain('shadow-xl')
    })

    // T21 AC1/AC2: both footer buttons are the "Modal footer buttons"
    // (~36px measured) in scope for the tap-target pass. `tap-safe` must be
    // the ONLY class gained here (constraint 4 + ground truth #4) — extending
    // this pre-existing byte-identical assertion, rather than adding a
    // parallel test, is what proves that.
    it('keeps the cancel and confirm buttons visually identical to today, plus tap-safe', () => {
      setViewportWidth(1280)
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const cancel = screen.getByRole('button', { name: 'Cancel' })
      expect(cancel.className).toBe(
        'px-4 py-2 text-sm rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 tap-safe'
      )

      const confirm = screen.getByRole('button', { name: 'Are you sure?' })
      expect(confirm.className).toContain('px-4 py-2 text-sm rounded-md text-white')
      expect(confirm.className).toContain('bg-red-600')
      expect(confirm.className).toContain('tap-safe')
    })

    it('keeps the title heading styling', () => {
      setViewportWidth(1280)
      renderWithProviders(
        <ConfirmDialog title="Delete project?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      )

      const title = screen.getByText('Delete project?')
      expect(title.tagName).toMatch(/^H[1-6]$/)
      expect(title.className).toContain('text-lg')
      expect(title.className).toContain('font-semibold')
      expect(title.className).toContain('text-stone-900')
      expect(title.className).toContain('dark:text-stone-100')
    })
  })
})
