import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function TrapHarness({ active }: { active: boolean }) {
  const containerRef = useFocusTrap(active)

  return (
    <div>
      <button>outside-before</button>
      <div ref={containerRef as RefObject<HTMLDivElement>}>
        <button>first</button>
        <button>second</button>
        <button>last</button>
      </div>
      <button>outside-after</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('wraps Tab from the last focusable element back to the first when active', async () => {
    const user = userEvent.setup()
    render(<TrapHarness active={true} />)

    const last = screen.getByRole('button', { name: 'last' })
    const first = screen.getByRole('button', { name: 'first' })

    act(() => {
      last.focus()
    })
    expect(document.activeElement).toBe(last)

    await user.tab()

    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first focusable element back to the last when active', async () => {
    const user = userEvent.setup()
    render(<TrapHarness active={true} />)

    const first = screen.getByRole('button', { name: 'first' })
    const last = screen.getByRole('button', { name: 'last' })

    act(() => {
      first.focus()
    })
    expect(document.activeElement).toBe(first)

    await user.tab({ shift: true })

    expect(document.activeElement).toBe(last)
  })

  it('does not trap focus when inactive, allowing Tab to leave the container', async () => {
    const user = userEvent.setup()
    render(<TrapHarness active={false} />)

    const last = screen.getByRole('button', { name: 'last' })
    const outsideAfter = screen.getByRole('button', { name: 'outside-after' })

    act(() => {
      last.focus()
    })
    expect(document.activeElement).toBe(last)

    await user.tab()

    expect(document.activeElement).toBe(outsideAfter)
  })

  it('restores focus to the previously-focused element when the trap deactivates', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [active, setActive] = useState(false)
      const containerRef = useFocusTrap(active)
      const triggerRef = useRef<HTMLButtonElement>(null)

      return (
        <div>
          <button
            ref={triggerRef}
            onClick={() => {
              setActive(true)
            }}
          >
            open
          </button>
          <div ref={containerRef as RefObject<HTMLDivElement>}>
            <button>inside</button>
          </div>
          <button
            onClick={() => {
              setActive(false)
            }}
          >
            close
          </button>
        </div>
      )
    }

    render(<Harness />)

    const openButton = screen.getByRole('button', { name: 'open' })
    openButton.focus()
    expect(document.activeElement).toBe(openButton)

    await user.click(openButton)

    const closeButton = screen.getByRole('button', { name: 'close' })
    await user.click(closeButton)

    expect(document.activeElement).toBe(openButton)
  })

  it('restores focus when unmounted while active', () => {
    function Harness({ mounted }: { mounted: boolean }) {
      const triggerRef = useRef<HTMLButtonElement>(null)
      useEffect(() => {
        triggerRef.current?.focus()
      }, [])

      return (
        <div>
          <button ref={triggerRef}>trigger</button>
          {mounted && <InnerTrap />}
        </div>
      )
    }

    function InnerTrap() {
      const containerRef = useFocusTrap(true)
      return (
        <div ref={containerRef as RefObject<HTMLDivElement>}>
          <button>inside</button>
        </div>
      )
    }

    const { rerender } = render(<Harness mounted={false} />)

    const trigger = screen.getByRole('button', { name: 'trigger' })
    expect(document.activeElement).toBe(trigger)

    rerender(<Harness mounted={true} />)

    const inside = screen.getByRole('button', { name: 'inside' })
    act(() => {
      inside.focus()
    })
    expect(document.activeElement).toBe(inside)

    rerender(<Harness mounted={false} />)

    expect(document.activeElement).toBe(trigger)
  })

  describe('when a second trap is stacked on the first', () => {
    // Models what Modal does: the inner container is portalled to document.body,
    // so it is NOT a DOM descendant of the outer container. An outer trap that
    // still handled Tab would read every inner keystroke as "focus escaped".
    function InnerPortalTrap() {
      const containerRef = useFocusTrap(true)
      return createPortal(
        <div ref={containerRef as RefObject<HTMLDivElement>}>
          <button>inner-a</button>
          <button>inner-b</button>
          <button>inner-c</button>
        </div>,
        document.body
      )
    }

    function StackedTrapHarness() {
      const [innerActive, setInnerActive] = useState(false)
      const containerRef = useFocusTrap(true)

      return (
        <div>
          <button>outside</button>
          <div ref={containerRef as RefObject<HTMLDivElement>}>
            <button>outer-first</button>
            <button
              onClick={() => {
                setInnerActive(true)
              }}
            >
              open inner
            </button>
            {innerActive && <InnerPortalTrap />}
          </div>
        </div>
      )
    }

    async function activateInnerTrap(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'open inner' }))
      await screen.findByRole('button', { name: 'inner-a' })
    }

    it('cycles Tab through every focusable of the inner container, middle ones included', async () => {
      const user = userEvent.setup()
      render(<StackedTrapHarness />)
      await activateInnerTrap(user)

      act(() => {
        screen.getByRole('button', { name: 'inner-a' }).focus()
      })

      const visited: (string | null)[] = []
      for (let i = 0; i < 5; i += 1) {
        await user.tab()
        visited.push(document.activeElement?.textContent ?? null)
      }

      expect(visited).toEqual(['inner-b', 'inner-c', 'inner-a', 'inner-b', 'inner-c'])
    })

    it('wraps Shift+Tab within the inner container instead of deferring to the outer trap', async () => {
      const user = userEvent.setup()
      render(<StackedTrapHarness />)
      await activateInnerTrap(user)

      act(() => {
        screen.getByRole('button', { name: 'inner-a' }).focus()
      })

      await user.tab({ shift: true })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'inner-c' }))

      await user.tab({ shift: true })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'inner-b' }))
    })

    // A separate harness, because its inner trap owns the control that closes
    // it: the test reaches that control with Tab, so the inner trap has to have
    // really held Tab while it was topmost before the close can happen at all.
    function ClosableInnerPortalTrap({ onClose }: { onClose: () => void }) {
      const containerRef = useFocusTrap(true)
      return createPortal(
        <div ref={containerRef as RefObject<HTMLDivElement>}>
          <button>inner-a</button>
          <button onClick={onClose}>close inner</button>
        </div>,
        document.body
      )
    }

    function ClosableStackHarness() {
      const [innerActive, setInnerActive] = useState(false)
      const containerRef = useFocusTrap(true)

      return (
        <div>
          <button>outside</button>
          <div ref={containerRef as RefObject<HTMLDivElement>}>
            <button>outer-first</button>
            <button
              onClick={() => {
                setInnerActive(true)
              }}
            >
              open inner
            </button>
            {innerActive && (
              <ClosableInnerPortalTrap
                onClose={() => {
                  setInnerActive(false)
                }}
              />
            )}
          </div>
        </div>
      )
    }

    it('hands Tab back to the outer trap once the inner trap is gone', async () => {
      const user = userEvent.setup()
      render(<ClosableStackHarness />)

      await user.click(screen.getByRole('button', { name: 'open inner' }))
      act(() => {
        screen.getByRole('button', { name: 'inner-a' }).focus()
      })

      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'close inner' }))
      await user.keyboard('{Enter}')

      // 'open inner' is the last focusable of the outer container, so Tab must
      // wrap to its first one — which only happens if the outer trap is back in
      // control of Tab now that the inner one has deregistered.
      act(() => {
        screen.getByRole('button', { name: 'open inner' }).focus()
      })

      await user.tab()

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'outer-first' }))
    })
  })

  describe('when the middle trap of three is deactivated', () => {
    function PortalTrap({ children }: { children: ReactNode }) {
      const containerRef = useFocusTrap(true)
      return createPortal(
        <div ref={containerRef as RefObject<HTMLDivElement>}>{children}</div>,
        document.body
      )
    }

    // Each layer is opened by a click, so the traps register in a known order
    // rather than in whatever order a single commit flushes its effects.
    function ThreeTrapHarness() {
      const [middleActive, setMiddleActive] = useState(false)
      const [topActive, setTopActive] = useState(false)
      const containerRef = useFocusTrap(true)

      return (
        <div>
          <div ref={containerRef as RefObject<HTMLDivElement>}>
            <button>outer-first</button>
            <button
              onClick={() => {
                setMiddleActive(true)
              }}
            >
              open middle
            </button>
          </div>
          {middleActive && (
            <PortalTrap>
              <button>middle-a</button>
              <button
                onClick={() => {
                  setTopActive(true)
                }}
              >
                open top
              </button>
              <button
                onClick={() => {
                  setMiddleActive(false)
                }}
              >
                close middle
              </button>
            </PortalTrap>
          )}
          {topActive && (
            <PortalTrap>
              <button>top-a</button>
              <button>top-b</button>
            </PortalTrap>
          )}
        </div>
      )
    }

    it('leaves the topmost trap in control of Tab when a trap below it deactivates', async () => {
      const user = userEvent.setup()
      render(<ThreeTrapHarness />)

      await user.click(screen.getByRole('button', { name: 'open middle' }))
      await user.click(await screen.findByRole('button', { name: 'open top' }))
      await screen.findByRole('button', { name: 'top-a' })

      await user.click(screen.getByRole('button', { name: 'close middle' }))

      act(() => {
        screen.getByRole('button', { name: 'top-a' }).focus()
      })

      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'top-b' }))

      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'top-a' }))
    })
  })

  // R5, deferred here from T08. A topmost trap whose container holds nothing
  // focusable currently bails out before calling preventDefault, so Tab escapes
  // the trap entirely. T12's drawer makes this reachable: a drawer that has not
  // yet rendered its links is an empty topmost trap, and Tab from it lands on
  // the hidden sidebar behind the backdrop.
  describe('when the topmost trap holds nothing focusable', () => {
    function EmptyTrapHarness() {
      const containerRef = useFocusTrap(true)
      return (
        <div>
          <button>outside-before</button>
          <div ref={containerRef as RefObject<HTMLDivElement>} />
          <button>outside-after</button>
        </div>
      )
    }

    it('swallows Tab instead of letting focus leave the trap', async () => {
      const user = userEvent.setup()
      render(<EmptyTrapHarness />)

      const before = screen.getByRole('button', { name: 'outside-before' })
      act(() => {
        before.focus()
      })

      await user.tab()

      expect(document.activeElement).toBe(before)
      expect(document.activeElement).not.toBe(
        screen.getByRole('button', { name: 'outside-after' })
      )
    })

    it('swallows Shift+Tab as well', async () => {
      const user = userEvent.setup()
      render(<EmptyTrapHarness />)

      const after = screen.getByRole('button', { name: 'outside-after' })
      act(() => {
        after.focus()
      })

      await user.tab({ shift: true })

      expect(document.activeElement).toBe(after)
    })

    it('does not hand Tab down to the trap below it', async () => {
      const user = userEvent.setup()

      function EmptyOnTopHarness() {
        const outerRef = useFocusTrap(true)
        const emptyRef = useFocusTrap(true)
        return (
          <div>
            <div ref={outerRef as RefObject<HTMLDivElement>}>
              <button>outer-first</button>
              <button>outer-last</button>
            </div>
            {createPortal(
              <div ref={emptyRef as RefObject<HTMLDivElement>} />,
              document.body
            )}
          </div>
        )
      }

      render(<EmptyOnTopHarness />)

      const last = screen.getByRole('button', { name: 'outer-last' })
      act(() => {
        last.focus()
      })

      await user.tab()

      // The outer trap would wrap to 'outer-first'. Only the topmost trap may
      // handle Tab, and an empty topmost trap must swallow it outright.
      expect(document.activeElement).toBe(last)
    })
  })
})
