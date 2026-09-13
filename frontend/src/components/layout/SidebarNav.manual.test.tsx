import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { SidebarNav } from './SidebarNav'

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'manager',
}

function renderNav() {
  return renderWithProviders(
    <SidebarNav
      recentItems={[]}
      recentProjects={[]}
      hasMoreProjects={false}
      pendingCount={0}
      projectsActive={false}
      user={USER as never}
      initials="AL"
      onSearch={() => {}}
      onLogout={() => {}}
      onNavigate={() => {}}
    />,
    { route: '/projects' }
  )
}

describe('SidebarNav help entry point', () => {
  it('links to the manual', () => {
    renderNav()

    expect(screen.getByRole('link', { name: /help/i })).toHaveAttribute('href', '/manual')
  })
})
