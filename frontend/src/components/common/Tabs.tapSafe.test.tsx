import { describe, it } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { expectTapSafeControl } from '../../test/tapSafeRecipe'
import { Tabs } from './Tabs'

// ---------------------------------------------------------------------------
// T21 AC1 — the tab rail (31.5px measured across all six orientations/items)
// must gain `tap-safe`. Every tab is a native <button>, which is
// display:inline-block by UA default, so unlike SidebarNav's bare <Link> this
// is not at risk of the inline-display trap — expectTapSafeControl only
// enforces the extra display-class check for <a> elements. TAB_BASE already
// carries `flex` regardless, so the desktop pill/rail visual recipe is
// unaffected once `tap-safe` is the only class added (constraint 4).
//
// jsdom computes no layout (css: false), so this is a class-token assertion,
// never a measured height/width.
// ---------------------------------------------------------------------------

const ITEMS = [
  { key: 'alpha', label: 'Alpha' },
  { key: 'beta', label: 'Beta' },
  { key: 'gamma', label: 'Gamma' },
]

function renderTabs(orientation: 'horizontal' | 'vertical-lg' = 'horizontal') {
  return renderWithProviders(
    <Tabs items={ITEMS} value="alpha" onChange={() => {}} label="Demo tabs" orientation={orientation} />
  )
}

describe('Tabs tap-target pass (T21 AC1)', () => {
  it('makes every horizontal tab tap-safe', () => {
    renderTabs('horizontal')

    for (const item of ITEMS) {
      expectTapSafeControl(screen.getByRole('tab', { name: item.label }), `the "${item.label}" tab`)
    }
  })

  it('makes every vertical-lg tab tap-safe too', () => {
    renderTabs('vertical-lg')

    for (const item of ITEMS) {
      expectTapSafeControl(screen.getByRole('tab', { name: item.label }), `the "${item.label}" tab`)
    }
  })
})
