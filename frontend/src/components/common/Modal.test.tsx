import { useState } from 'react'
import type { FormEventHandler, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test/render'
import { setViewportWidth } from '../../test/setup'
import { Modal } from './Modal'

// ---------------------------------------------------------------------------
// Public API under test (see the T08 report for the full contract):
//
//   <Modal
//     open={boolean}
//     onClose={() => void}
//     title="string"                  // rendered as a heading, wired to
//                                     // aria-labelledby on the dialog
//     size="sm" | "md" | "lg"         // replaces w-[min(90vw,_900px)] min-w-[67vw]
//     footer={ReactNode}              // rendered OUTSIDE the scrolling body
//   >
//     {body}
//   </Modal>
//
// Everything below asserts on rendered DOM, accessible roles/names, focus, and
// className output. jsdom computes no layout, so `max-h-[85dvh]` and safe-area
// padding are deliberately class-presence assertions, never measured heights.
// ---------------------------------------------------------------------------

function ModalHarness({
  onClose = vi.fn(),
  onSubmit,
  size,
  footer,
  children,
  title = 'Modal title',
}: {
  onClose?: () => void
  onSubmit?: FormEventHandler<HTMLFormElement>
  size?: 'sm' | 'md' | 'lg'
  footer?: ReactNode
  children?: ReactNode
  title?: string
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
        Open modal
      </button>
      <button type="button">Background button</button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          onClose()
        }}
        title={title}
        size={size}
        footer={footer}
        onSubmit={onSubmit}
      >
        {children ?? <button type="button">Body button</button>}
      </Modal>
    </div>
  )
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open modal' }))
  return screen.findByRole('dialog')
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    renderWithProviders(<ModalHarness>{<p>Body copy</p>}</ModalHarness>)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Body copy')).not.toBeInTheDocument()
  })

  it('shows the title and body once opened', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModalHarness>{<p>Body copy</p>}</ModalHarness>)

    await openModal(user)

    expect(screen.getByText('Modal title')).toBeInTheDocument()
    expect(screen.getByText('Body copy')).toBeInTheDocument()
  })

  it('exposes the dialog with an accessible name taken from its title', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModalHarness title="Delete project?" />)

    await user.click(screen.getByRole('button', { name: 'Open modal' }))

    expect(await screen.findByRole('dialog', { name: 'Delete project?' })).toBeInTheDocument()
  })

  it('marks itself as a modal dialog labelled by the title element', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModalHarness title="Delete project?" />)

    const dialog = await openModal(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const label = document.getElementById(labelledBy as string)
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent('Delete project?')
  })

  it('renders through a portal on document.body, outside any clipping ancestor', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModalHarness />)

    const dialog = await openModal(user)
    const overlay = dialog.parentElement as HTMLElement

    expect(overlay.parentElement).toBe(document.body)
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<ModalHarness onClose={onClose} />)

    await openModal(user)
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('closes when the backdrop is clicked, so a phone with no Escape key can dismiss it', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<ModalHarness onClose={onClose} />)

    const dialog = await openModal(user)
    await user.click(dialog.parentElement as HTMLElement)

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('does not close when the panel itself is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<ModalHarness onClose={onClose} />)

    const dialog = await openModal(user)
    await user.click(dialog)
    await user.click(screen.getByRole('button', { name: 'Body button' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not close when a drag started inside the panel is released on the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<ModalHarness onClose={onClose} />)

    const dialog = await openModal(user)
    const overlay = dialog.parentElement as HTMLElement

    await user.pointer([
      { keys: '[MouseLeft>]', target: dialog },
      { target: overlay },
      { keys: '[/MouseLeft]', target: overlay },
    ])

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not close on Escape while it is already closed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<ModalHarness onClose={onClose} />)

    await user.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus inside the dialog when it opens', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModalHarness />)

    const dialog = await openModal(user)

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  it('starts focus on the first *focusable* control, skipping a leading disabled one', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ModalHarness>
        <button type="button" disabled>
          Save
        </button>
        <button type="button">Cancel</button>
      </ModalHarness>
    )

    const dialog = await openModal(user)

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('starts focus on the first real field when a hidden input precedes it', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ModalHarness>
        <input type="hidden" name="csrf" value="token" readOnly />
        <input aria-label="Name" />
      </ModalHarness>
    )

    const dialog = await openModal(user)

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Name'))
    })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('falls back to the panel when the dialog holds nothing focusable', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ModalHarness>
        <p>Body copy</p>
      </ModalHarness>
    )

    const dialog = await openModal(user)

    await waitFor(() => {
      expect(document.activeElement).toBe(dialog)
    })
  })

  it('traps Tab inside the dialog instead of letting it reach the page behind', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ModalHarness footer={<button type="button">Save</button>}>
        <button type="button">Body button</button>
      </ModalHarness>
    )

    const dialog = await openModal(user)

    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Background button' }))
  })

  it('wraps Tab from the last focusable element back to the first', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ModalHarness footer={<button type="button">Save</button>}>
        <button type="button">Body button</button>
      </ModalHarness>
    )

    await openModal(user)
    const body = screen.getByRole('button', { name: 'Body button' })
    const save = screen.getByRole('button', { name: 'Save' })

    save.focus()
    await user.tab()

    expect(document.activeElement).toBe(body)
  })

  it('restores focus to the trigger when it closes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModalHarness />)

    const trigger = screen.getByRole('button', { name: 'Open modal' })
    await openModal(user)
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('locks body scroll while open and unlocks it on close', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModalHarness />)

    expect(document.body.style.overflow).not.toBe('hidden')

    await openModal(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  describe('when a second modal is stacked on the first', () => {
    function NestedHarness() {
      const [outer, setOuter] = useState(false)
      const [inner, setInner] = useState(false)
      return (
        <div>
          <button
            type="button"
            onClick={() => {
              setOuter(true)
            }}
          >
            Open outer
          </button>
          <Modal
            open={outer}
            onClose={() => {
              setOuter(false)
            }}
            title="Outer modal"
          >
            <button
              type="button"
              onClick={() => {
                setInner(true)
              }}
            >
              Open inner
            </button>
            <Modal
              open={inner}
              onClose={() => {
                setInner(false)
              }}
              title="Inner modal"
            >
              <p>Inner body</p>
              <button type="button">Inner A</button>
              <button type="button">Inner B</button>
              <button type="button">Inner C</button>
            </Modal>
          </Modal>
        </div>
      )
    }

    async function openBoth(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Open outer' }))
      await user.click(await screen.findByRole('button', { name: 'Open inner' }))
      await screen.findByRole('dialog', { name: 'Inner modal' })
    }

    it('closes only the topmost modal on Escape', async () => {
      const user = userEvent.setup()
      renderWithProviders(<NestedHarness />)

      await openBoth(user)
      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Inner modal' })).not.toBeInTheDocument()
      })
      expect(screen.getByRole('dialog', { name: 'Outer modal' })).toBeInTheDocument()
    })

    // The inner panel is portalled to document.body, so it is not a DOM
    // descendant of the outer panel. An outer trap that still handled Tab read
    // every inner keystroke as "focus escaped" and pinned focus on the inner
    // panel's first control, making the middle control unreachable.
    it('cycles Tab through the whole inner dialog, including its middle control', async () => {
      const user = userEvent.setup()
      renderWithProviders(<NestedHarness />)

      await openBoth(user)
      screen.getByRole('button', { name: 'Inner A' }).focus()

      const visited: (string | null)[] = []
      for (let i = 0; i < 5; i += 1) {
        await user.tab()
        visited.push(document.activeElement?.textContent ?? null)
      }

      expect(visited).toEqual(['Inner B', 'Inner C', 'Inner A', 'Inner B', 'Inner C'])
    })

    it('keeps Shift+Tab inside the inner dialog too', async () => {
      const user = userEvent.setup()
      renderWithProviders(<NestedHarness />)

      await openBoth(user)
      screen.getByRole('button', { name: 'Inner A' }).focus()

      await user.tab({ shift: true })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inner C' }))

      await user.tab({ shift: true })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inner B' }))
    })

    it('keeps body scroll locked until the last modal closes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<NestedHarness />)

      await openBoth(user)
      expect(document.body.style.overflow).toBe('hidden')

      await user.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Inner modal' })).not.toBeInTheDocument()
      })
      expect(document.body.style.overflow).toBe('hidden')

      await user.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Outer modal' })).not.toBeInTheDocument()
      })
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  describe('with a long body', () => {
    function longBody() {
      return (
        <ul>
          {Array.from({ length: 40 }, (_, i) => (
            <li key={i}>Item {i + 1}</li>
          ))}
        </ul>
      )
    }

    it('caps the dialog height at 85dvh so it can never run off the screen', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <ModalHarness footer={<button type="button">Save</button>}>{longBody()}</ModalHarness>
      )

      const dialog = await openModal(user)

      expect(dialog.className).toContain('max-h-[85dvh]')
      expect(dialog.className).not.toContain('min-w-[67vw]')
    })

    it('scrolls the 40-item body internally, leaving the title and footer outside the scroller', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <ModalHarness footer={<button type="button">Save</button>}>{longBody()}</ModalHarness>
      )

      await openModal(user)

      const firstItem = screen.getByText('Item 1')
      const lastItem = screen.getByText('Item 40')
      const scroller = firstItem.closest('.overflow-y-auto')

      expect(scroller).not.toBeNull()
      expect(scroller).toContainElement(lastItem)
      expect(scroller).not.toContainElement(screen.getByText('Modal title'))
      expect(scroller).not.toContainElement(screen.getByRole('button', { name: 'Save' }))
    })

    it('keeps the footer action reachable and operable by keyboard with a 40-item body', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      renderWithProviders(
        <ModalHarness
          footer={
            <button type="button" onClick={onSave}>
              Save
            </button>
          }
        >
          {longBody()}
        </ModalHarness>
      )

      await openModal(user)
      const save = screen.getByRole('button', { name: 'Save' })
      save.focus()
      await user.keyboard('{Enter}')

      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })

  describe('responsive sheet variant (CSS-only)', () => {
    it('anchors to the bottom of the viewport below md and centres from md up', async () => {
      const user = userEvent.setup()
      setViewportWidth(375)
      renderWithProviders(<ModalHarness />)

      const dialog = await openModal(user)
      const overlay = dialog.parentElement as HTMLElement

      expect(overlay.className).toContain('items-end')
      expect(overlay.className).toContain('md:items-center')
    })

    it('rounds only its top corners as a sheet, and all corners as a desktop dialog', async () => {
      const user = userEvent.setup()
      setViewportWidth(375)
      renderWithProviders(<ModalHarness />)

      const dialog = await openModal(user)

      expect(dialog.className).toContain('rounded-t-2xl')
      expect(dialog.className).toMatch(/\bmd:rounded-(md|lg|xl|2xl)\b/)
    })

    it('pads the sheet clear of the home indicator with a safe-area inset', async () => {
      const user = userEvent.setup()
      setViewportWidth(375)
      renderWithProviders(
        <ModalHarness footer={<button type="button">Save</button>} />
      )

      const dialog = await openModal(user)

      expect(dialog.outerHTML).toMatch(/safe-area-inset-bottom/)
    })

    it('renders identical markup at 375px and 1280px, proving the variant is CSS-only', async () => {
      const user = userEvent.setup()
      // The title id comes from useId, whose counter is global and never
      // resets, so it differs between two independent mounts. That is unrelated
      // to whether the variant is CSS-only, so normalise it out and compare the
      // rest of the markup verbatim.
      const withStableTitleId = (html: string) =>
        html.replace(/(id|aria-labelledby)="[^"]*"/g, '$1="modal-title"')

      setViewportWidth(375)
      const mobile = renderWithProviders(<ModalHarness />)
      const mobileDialog = await openModal(user)
      const mobileHtml = withStableTitleId((mobileDialog.parentElement as HTMLElement).outerHTML)
      mobile.unmount()

      setViewportWidth(1280)
      renderWithProviders(<ModalHarness />)
      const desktopDialog = await openModal(user)
      const desktopHtml = withStableTitleId((desktopDialog.parentElement as HTMLElement).outerHTML)

      expect(desktopHtml).toBe(mobileHtml)
    })
  })

  // The pre-T08 dialog was `p-6` panel / `h3 mb-2` / `description mb-4` /
  // buttons. These assertions pin that box model down, because the earlier
  // class-presence tests happily passed while the spacing drifted.
  describe('at 1280px the box model matches the pre-T08 dialog', () => {
    async function openDesktopModal(children?: ReactNode) {
      const user = userEvent.setup()
      setViewportWidth(1280)
      renderWithProviders(
        <ModalHarness footer={<button type="button">Save</button>}>{children}</ModalHarness>
      )
      return openModal(user)
    }

    it('insets the panel by 24px and leaves 8px under the title and 16px above the footer', async () => {
      const dialog = await openDesktopModal(<p>Body copy</p>)

      const header = screen.getByText('Modal title').parentElement as HTMLElement
      const body = screen.getByText('Body copy').closest('.overflow-y-auto') as HTMLElement
      const footer = screen.getByRole('button', { name: 'Save' }).parentElement as HTMLElement

      expect(Array.from(dialog.children)).toEqual([header, body, footer])
      expect(header.className).toContain('px-6')
      expect(header.className).toContain('pt-6')
      expect(header.className).toContain('pb-2')
      expect(body.className).toContain('px-6')
      expect(body.className).toContain('pb-4')
      expect(body.className).not.toContain('pb-6')
      expect(footer.className).toContain('px-6')
      expect(footer.className).toContain('pb-6')
    })

    it('renders no body wrapper at all when there is no body, keeping the title 8px above the footer', async () => {
      const dialog = await openDesktopModal(false)

      const header = screen.getByText('Modal title').parentElement as HTMLElement
      const footer = screen.getByRole('button', { name: 'Save' }).parentElement as HTMLElement

      expect(dialog.querySelector('.overflow-y-auto')).toBeNull()
      expect(Array.from(dialog.children)).toEqual([header, footer])
      expect(header.className).toContain('pb-2')
    })

    // `{a && <p/>}{b && <p/>}` with both conditions false arrives as the array
    // [false, false], which is truthy — a plain truthiness guard would render
    // an empty body wrapper and its 16px band.
    it('renders no body wrapper when every child of a multi-child body is falsy', async () => {
      const dialog = await openDesktopModal([false, false])

      const header = screen.getByText('Modal title').parentElement as HTMLElement
      const footer = screen.getByRole('button', { name: 'Save' }).parentElement as HTMLElement

      expect(dialog.querySelector('.overflow-y-auto')).toBeNull()
      expect(Array.from(dialog.children)).toEqual([header, footer])
    })

    it('renders a body of 0 as body content rather than a stray text node on the panel', async () => {
      const dialog = await openDesktopModal(0)

      const body = dialog.querySelector('.overflow-y-auto')

      expect(body).not.toBeNull()
      expect(body).toHaveTextContent('0')
    })

    it('stops the header and footer from being squashed by a long body', async () => {
      const dialog = await openDesktopModal(<p>Body copy</p>)

      const header = dialog.children[0]
      const footer = dialog.children[2]

      expect(header.className).toContain('shrink-0')
      expect(footer.className).toContain('shrink-0')
    })
  })

  describe('size prop', () => {
    async function dialogClassNameForSize(size: 'sm' | 'md' | 'lg') {
      const user = userEvent.setup()
      const view = renderWithProviders(<ModalHarness size={size} />)
      const dialog = await openModal(user)
      const className = dialog.className
      view.unmount()
      return className
    }

    it('gives each size a distinct width cap', async () => {
      const sm = await dialogClassNameForSize('sm')
      const md = await dialogClassNameForSize('md')
      const lg = await dialogClassNameForSize('lg')

      expect(sm).toMatch(/\bmax-w-/)
      expect(md).toMatch(/\bmax-w-/)
      expect(lg).toMatch(/\bmax-w-/)
      expect(new Set([sm, md, lg]).size).toBe(3)
    })

    it('never applies the phone-hostile min-w-[67vw] or the old fixed width recipe', async () => {
      const sm = await dialogClassNameForSize('sm')
      const md = await dialogClassNameForSize('md')
      const lg = await dialogClassNameForSize('lg')

      for (const className of [sm, md, lg]) {
        expect(className).not.toContain('min-w-[67vw]')
        expect(className).not.toContain('w-[min(90vw,_900px)]')
      }
    })

    it('renders size="sm" at the same desktop width cap ConfirmDialog uses today', async () => {
      const sm = await dialogClassNameForSize('sm')

      expect(sm).toContain('max-w-sm')
    })
  })

  // The form wrapper is what lets a footer submit button live outside the
  // scrolling body without every call site threading an id + form="…" pair, and
  // it is what makes Enter in a field save. The overlays across T09/T10/T13/T16
  // all lean on it.
  describe('onSubmit', () => {
    function submitHarness(onSubmit: FormEventHandler<HTMLFormElement>) {
      return (
        <ModalHarness onSubmit={onSubmit} footer={<button type="submit">Save</button>}>
          <label>
            Name
            <input type="text" />
          </label>
        </ModalHarness>
      )
    }

    const preventDefault: FormEventHandler<HTMLFormElement> = (e) => {
      e.preventDefault()
    }

    it('fires when a submit button in the footer is pressed', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn(preventDefault)
      renderWithProviders(submitHarness(onSubmit))

      await openModal(user)
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it('fires on Enter in a text field in the body, the implicit submission', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn(preventDefault)
      renderWithProviders(submitHarness(onSubmit))

      await openModal(user)
      await user.type(screen.getByLabelText('Name'), 'Apollo{Enter}')

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it('puts the body fields and the footer button inside the same form', async () => {
      const user = userEvent.setup()
      renderWithProviders(submitHarness(preventDefault))

      const dialog = await openModal(user)
      const forms = dialog.querySelectorAll('form')

      expect(forms).toHaveLength(1)
      const [form] = forms
      expect(form).toContainElement(screen.getByLabelText('Name'))
      expect(form).toContainElement(screen.getByRole('button', { name: 'Save' }))
    })

    it('renders no form at all, and the same panel children, when no onSubmit is given', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <ModalHarness footer={<button type="button">Save</button>}>
          <p>Body copy</p>
        </ModalHarness>
      )

      const dialog = await openModal(user)

      expect(dialog.querySelector('form')).toBeNull()
      const header = screen.getByText('Modal title').parentElement as HTMLElement
      const body = screen.getByText('Body copy').closest('.overflow-y-auto') as HTMLElement
      const footer = screen.getByRole('button', { name: 'Save' }).parentElement as HTMLElement
      expect(Array.from(dialog.children)).toEqual([header, body, footer])
    })
  })
})
