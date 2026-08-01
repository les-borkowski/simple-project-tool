// The id `Tabs` gives each tab, so a caller's `role="tabpanel"` can be
// `aria-labelledby` the active one without reaching into the DOM for it. Lives
// outside Tabs.tsx because a component file may only export components.
export function tabId(panelId: string, key: string): string {
  return `${panelId}-tab-${key}`
}
