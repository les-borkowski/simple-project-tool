import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../test/render'
import { setPointerType, setViewportWidth } from '../test/setup'
import { makeTimelineTask } from '../test/factories'
import { TimelineView } from './TimelineView'

// ---------------------------------------------------------------------------
// T17 — TimelineView responsive pass.
//
// jsdom computes no layout (`css: false`, zeroed getBoundingClientRect), so we
// cannot prove the sticky column visually stays put during a real horizontal
// scroll, nor that the mask-image edge fade actually renders. What CAN be
// proven here: the `sticky left-0` class tokens are present on the right
// elements, the LEFT_COL/DAY_WIDTH numbers used for inline styles change with
// viewport width, the `scroll-fade-x-r` class token is present on the scroll
// container (and never the plain `scroll-fade-x`, which would fade the
// pinned left column and the never-scrolling desktop container), and the
// tap/hover/Escape tooltip behaviour is reachable through real DOM events.
// The rest is for the browser pass.
// ---------------------------------------------------------------------------

const TASK_TITLE = 'Wire the settings page'

const TASKS = [
  makeTimelineTask({
    task_id: 'task-1',
    title: TASK_TITLE,
    status: 'in_progress',
    priority: 'high',
    sprint_id: null,
    bar_start: '2026-07-08',
    bar_end: '2026-07-10',
    source: 'deadline',
  }),
]

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    timelineApi: { ...actual.timelineApi, get: vi.fn() },
    sprintsApi: { ...actual.sprintsApi, list: vi.fn() },
  }
})

import { sprintsApi, timelineApi } from '../services/api'

function primeApi(tasks = TASKS) {
  vi.mocked(timelineApi.get).mockResolvedValue({
    data: { items: tasks, truncated: false },
  } as never)
  vi.mocked(sprintsApi.list).mockResolvedValue({ data: [] } as never)
}

async function renderTimeline(width = 1280) {
  setViewportWidth(width)
  primeApi()
  const view = renderWithProviders(<TimelineView projectId="proj-1" />)
  await screen.findByText(TASK_TITLE)
  return view
}

// The task-title column div is the parent of the row that holds the title
// span; the row div is the parent of the title span itself. This walks the
// DOM the same way a user's eye would (title text sits visually inside that
// column), rather than reaching for an implementation-only selector.
function taskTitleColumn(): HTMLElement {
  const titleSpan = screen.getByText(TASK_TITLE)
  const column = titleSpan.parentElement?.parentElement
  if (!column) throw new Error('could not find task title column ancestor')
  return column
}

function axisHeaderCell(): HTMLElement {
  return screen.getByText('Task')
}

function groupLabel(): HTMLElement {
  return screen.getByText('Unassigned')
}

function bar(): HTMLElement {
  return screen.getByRole('button', { name: TASK_TITLE })
}

describe('TimelineView metrics (AC1)', () => {
  it('sizes the left title column at 220px on a 1280px viewport (desktop must not change)', async () => {
    await renderTimeline(1280)

    expect(axisHeaderCell()).toHaveStyle({ width: '220px' })
    expect(taskTitleColumn()).toHaveStyle({ width: '220px' })
  })

  it('sizes the left title column at 120px on a 375px (phone) viewport', async () => {
    await renderTimeline(375)

    expect(axisHeaderCell()).toHaveStyle({ width: '120px' })
    expect(taskTitleColumn()).toHaveStyle({ width: '120px' })
  })

  it('positions a bar using a 24px day width on a 1280px viewport', async () => {
    await renderTimeline(1280)

    // rangeStart = bar_start (2026-07-08) minus 7 days padding = 2026-07-01.
    // daysBetween(rangeStart, bar_start) = 7, so startPx = 7 * dayWidth.
    expect(bar()).toHaveStyle({ left: `${7 * 24}px` })
  })

  it('positions the same bar using a 12px day width on a 375px viewport', async () => {
    await renderTimeline(375)

    expect(bar()).toHaveStyle({ left: `${7 * 12}px` })
  })
})

describe('TimelineView sticky left column (AC2)', () => {
  it('keeps the axis header title cell, the group label and the per-group task-title column all sticky', async () => {
    await renderTimeline(1280)

    const elements: [string, HTMLElement][] = [
      ['axis header "Task" cell', axisHeaderCell()],
      ['group label', groupLabel()],
      ['task-title column', taskTitleColumn()],
    ]

    for (const [name, el] of elements) {
      expect(el.className, `${name} must carry "sticky"`).toContain('sticky')
      expect(el.className, `${name} must carry "left-0"`).toContain('left-0')
    }
  })
})

describe('TimelineView tooltip on touch (AC3)', () => {
  it('opens the tooltip when the bar is tapped', async () => {
    const user = userEvent.setup()
    await renderTimeline()

    expect(screen.queryByText('in_progress · high')).not.toBeInTheDocument()

    await user.click(bar())

    expect(await screen.findByText('in_progress · high')).toBeInTheDocument()
  })

  it('closes the tooltip when the user taps elsewhere', async () => {
    const user = userEvent.setup()
    await renderTimeline()

    await user.click(bar())
    expect(await screen.findByText('in_progress · high')).toBeInTheDocument()

    await user.click(screen.getByText('Timeline'))

    await waitFor(() => {
      expect(screen.queryByText('in_progress · high')).not.toBeInTheDocument()
    })
  })

  it('closes the tooltip when Escape is pressed', async () => {
    const user = userEvent.setup()
    await renderTimeline()

    await user.click(bar())
    expect(await screen.findByText('in_progress · high')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText('in_progress · high')).not.toBeInTheDocument()
    })
  })

  it('gives the bar an accessible name so it is reachable and operable by keyboard', async () => {
    await renderTimeline()

    const el = bar()
    expect(el.tabIndex, 'the bar must be in the tab order to be reachable without a pointer').not.toBe(-1)
  })
})

describe('TimelineView hover under a fine pointer (AC4)', () => {
  it('still opens the tooltip on mouse hover when the pointer is fine', async () => {
    const user = userEvent.setup()
    setPointerType('fine')
    await renderTimeline()

    await user.hover(bar())

    expect(await screen.findByText('in_progress · high')).toBeInTheDocument()
  })

  it('does not leave the tooltip stuck open from a hover under a coarse pointer', async () => {
    // This is the bug T17 fixes: onMouseEnter/onMouseLeave-only meant a touch
    // tap on a coarse-pointer device could fire a synthetic hover and leave
    // the tooltip stuck, since no matching mouseleave ever follows a tap.
    const user = userEvent.setup()
    setPointerType('coarse')
    await renderTimeline()

    await user.hover(bar())

    expect(screen.queryByText('in_progress · high')).not.toBeInTheDocument()
  })
})

describe('TimelineView scroll container edge fade (AC5, T17 review fix)', () => {
  it('carries the right-only, lg-gated scroll-fade-x-r utility on the horizontally scrolling container, and never the plain scroll-fade-x', async () => {
    const { container } = await renderTimeline()

    const scroller = container.querySelector('.overflow-x-auto')
    expect(scroller, 'expected an .overflow-x-auto scroll container').not.toBeNull()
    expect(scroller?.className).toContain('scroll-fade-x-r')
    // Guard against the class token match on 'scroll-fade-x-r' being
    // satisfied by a stray plain 'scroll-fade-x' sitting alongside it — the
    // plain utility fades both edges, which masks the pinned left column and
    // (at >=1024px, where the Gantt never overflows) the desktop container
    // that never scrolls.
    const classes = scroller?.className.split(/\s+/) ?? []
    expect(classes).not.toContain('scroll-fade-x')
  })
})

describe('TimelineView tooltip accessibility (T17 review fix)', () => {
  it('points aria-describedby at the open tooltip so its content is announced, and drops it when closed', async () => {
    const user = userEvent.setup()
    await renderTimeline()

    expect(bar()).not.toHaveAttribute('aria-describedby')

    await user.click(bar())

    const tooltipText = await screen.findByText('in_progress · high')
    const tooltipId = tooltipText.closest('[role="tooltip"]')?.getAttribute('id')
    expect(tooltipId, 'expected the tooltip to have an id').toBeTruthy()
    expect(bar()).toHaveAttribute('aria-describedby', tooltipId as string)

    await user.click(screen.getByText('Timeline'))

    await waitFor(() => {
      expect(bar()).not.toHaveAttribute('aria-describedby')
    })
  })
})
