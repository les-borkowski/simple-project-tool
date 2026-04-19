// Mock data — sized for a small team (2-10 people). Names neutral & realistic.
window.APP_DATA = (() => {
  const members = [
    { id: 'u1', name: 'Maya Okafor', email: 'maya@northwind.studio', role: 'manager', initials: 'MO', hue: 24 },
    { id: 'u2', name: 'Théo Beaumont', email: 'theo@northwind.studio', role: 'contributor', initials: 'TB', hue: 200 },
    { id: 'u3', name: 'Anya Petrov', email: 'anya@northwind.studio', role: 'contributor', initials: 'AP', hue: 320 },
    { id: 'u4', name: 'Reza Saatchi', email: 'reza@northwind.studio', role: 'contributor', initials: 'RS', hue: 140 },
    { id: 'u5', name: 'Lin Wei', email: 'lin@northwind.studio', role: 'contributor', initials: 'LW', hue: 50 },
    { id: 'u6', name: 'Jonas Grant', email: 'jonas@northwind.studio', role: 'contributor', initials: 'JG', hue: 270 },
  ];

  const projects = [
    { id: 'p1', name: 'Aperture · Mobile rebuild', description: 'Rewrite the iOS + Android client on a shared design system, with a fresh capture flow.', status: 'in_progress', priority: 'high', archived: false, created_at: '2026-02-04', owner: 'u1', members: ['u1','u2','u3','u4'], color: 24 },
    { id: 'p2', name: 'Operator console v3', description: 'Internal admin tooling — replaces the legacy Rails dashboard.', status: 'in_review', priority: 'medium', archived: false, created_at: '2026-01-12', owner: 'u1', members: ['u1','u3','u5'], color: 200 },
    { id: 'p3', name: 'Brand site refresh', description: 'New marketing site, careers, and customer stories.', status: 'in_progress', priority: 'medium', archived: false, created_at: '2026-03-01', owner: 'u1', members: ['u1','u2','u6'], color: 320 },
    { id: 'p4', name: 'Pricing & billing', description: 'Tiered plans, usage metering, Stripe migration.', status: 'to_do', priority: 'high', archived: false, created_at: '2026-03-22', owner: 'u1', members: ['u1','u4','u5'], color: 140 },
    { id: 'p5', name: 'Onboarding revamp', description: 'Rework first-run flow; reduce time-to-first-project.', status: 'in_testing', priority: 'medium', archived: false, created_at: '2026-02-19', owner: 'u1', members: ['u1','u2','u3'], color: 50 },
    { id: 'p6', name: 'Q1 retrospective', description: 'Notes, metrics, postmortems for the quarter.', status: 'done', priority: 'low', archived: false, created_at: '2025-12-30', owner: 'u1', members: ['u1','u6'], color: 270 },
    { id: 'p7', name: 'Legacy importer (sunset)', description: 'Wind down the v1 data importer.', status: 'done', priority: 'low', archived: true, created_at: '2025-09-04', owner: 'u1', members: ['u1','u4'], color: 12 },
  ];

  // Stories under p1 — used for the Kanban hero
  const stories = [
    { id: 's1', project: 'p1', title: 'Capture flow — single-shot mode', description: 'Rebuild the camera capture surface with a 1-tap, 1-result mental model.', status: 'in_progress', priority: 'high', created_at: '2026-03-01', owner: 'u2' },
    { id: 's2', project: 'p1', title: 'Auth & device pairing', description: 'Replace OAuth dance with QR pairing; keep email fallback.', status: 'in_review', priority: 'high', created_at: '2026-02-22', owner: 'u3' },
    { id: 's3', project: 'p1', title: 'Library & collections', description: 'Local-first library with smart collections and offline sync.', status: 'to_do', priority: 'medium', created_at: '2026-03-12', owner: 'u4' },
    { id: 's4', project: 'p1', title: 'Settings & preferences', description: 'Consolidate scattered prefs; new typography + accent color picker.', status: 'in_testing', priority: 'low', created_at: '2026-02-08', owner: 'u2' },
    { id: 's5', project: 'p1', title: 'Onboarding (mobile)', description: 'First-run experience, permissions priming, sample content.', status: 'done', priority: 'medium', created_at: '2026-01-19', owner: 'u3' },
    { id: 's6', project: 'p1', title: 'Telemetry & crash reporting', description: 'Add Sentry, opt-in analytics, performance traces.', status: 'in_progress', priority: 'medium', created_at: '2026-03-05', owner: 'u4' },
  ];

  // Tasks per story — used for board cards. Densely populated for s1, s2, s3.
  const tasks = [
    // s1 — Capture flow
    { id: 't1', story: 's1', title: 'Audit existing capture taps & gestures', status: 'done', priority: 'medium', assignee: 'u2', due: '2026-03-04', comments: 4, checks: [3,3] },
    { id: 't2', story: 's1', title: 'Storyboard: single-shot vs multi-shot', status: 'done', priority: 'high', assignee: 'u3', due: '2026-03-08', comments: 11, checks: [5,5] },
    { id: 't3', story: 's1', title: 'Build shared CameraSurface component', status: 'in_progress', priority: 'high', assignee: 'u2', due: '2026-04-22', comments: 7, checks: [4,9] },
    { id: 't4', story: 's1', title: 'Haptics & shutter sound design', status: 'in_progress', priority: 'medium', assignee: 'u4', due: '2026-04-19', comments: 2, checks: [1,4] },
    { id: 't5', story: 's1', title: 'Latency budget — cold-start to first frame', status: 'in_review', priority: 'high', assignee: 'u2', due: '2026-04-18', comments: 6, checks: [3,3] },
    { id: 't6', story: 's1', title: 'Permissions priming UX', status: 'to_do', priority: 'medium', assignee: 'u3', due: '2026-04-30', comments: 0, checks: [0,3] },
    { id: 't7', story: 's1', title: 'Result preview & retake', status: 'to_do', priority: 'medium', assignee: 'u2', due: '2026-05-02', comments: 1, checks: [0,5] },

    // s2 — Auth & pairing
    { id: 't8', story: 's2', title: 'QR pairing protocol — spec', status: 'done', priority: 'high', assignee: 'u3', due: '2026-03-15', comments: 9, checks: [6,6] },
    { id: 't9', story: 's2', title: 'Web side: device approval screen', status: 'in_review', priority: 'high', assignee: 'u3', due: '2026-04-15', comments: 3, checks: [4,5] },
    { id: 't10', story: 's2', title: 'Mobile side: scanner + handshake', status: 'in_review', priority: 'high', assignee: 'u3', due: '2026-04-16', comments: 5, checks: [5,5] },
    { id: 't11', story: 's2', title: 'Email fallback for desktop-less users', status: 'in_progress', priority: 'medium', assignee: 'u3', due: '2026-04-25', comments: 1, checks: [1,3] },
    { id: 't12', story: 's2', title: 'Token rotation policy', status: 'to_do', priority: 'medium', assignee: 'u3', due: '2026-05-05', comments: 0, checks: [0,4] },

    // s3 — Library
    { id: 't13', story: 's3', title: 'Schema for local-first library', status: 'in_progress', priority: 'medium', assignee: 'u4', due: '2026-04-30', comments: 4, checks: [2,7] },
    { id: 't14', story: 's3', title: 'Smart collections — saved queries', status: 'to_do', priority: 'medium', assignee: 'u4', due: '2026-05-10', comments: 0, checks: [0,5] },
    { id: 't15', story: 's3', title: 'Offline sync conflict resolution', status: 'to_do', priority: 'high', assignee: 'u4', due: '2026-05-15', comments: 2, checks: [0,8] },

    // s4 — Settings
    { id: 't16', story: 's4', title: 'Typography picker — pairing presets', status: 'in_testing', priority: 'low', assignee: 'u2', due: '2026-04-12', comments: 3, checks: [4,4] },
    { id: 't17', story: 's4', title: 'Accent hue slider component', status: 'done', priority: 'low', assignee: 'u2', due: '2026-04-02', comments: 1, checks: [3,3] },

    // s5 — Onboarding (mobile)
    { id: 't18', story: 's5', title: 'Sample content packs', status: 'done', priority: 'medium', assignee: 'u3', due: '2026-02-15', comments: 2, checks: [5,5] },

    // s6 — Telemetry
    { id: 't19', story: 's6', title: 'Sentry SDK integration', status: 'in_progress', priority: 'medium', assignee: 'u4', due: '2026-04-20', comments: 1, checks: [2,4] },
    { id: 't20', story: 's6', title: 'Opt-in analytics consent flow', status: 'in_review', priority: 'medium', assignee: 'u4', due: '2026-04-18', comments: 0, checks: [3,3] },
  ];

  const activity = [
    { id: 'a1', who: 'u3', what: 'moved', target: 'Mobile side: scanner + handshake', from: 'in_progress', to: 'in_review', at: '2h ago' },
    { id: 'a2', who: 'u2', what: 'commented on', target: 'Build shared CameraSurface component', at: '3h ago' },
    { id: 'a3', who: 'u4', what: 'created', target: 'Sentry SDK integration', at: '5h ago' },
    { id: 'a4', who: 'u1', what: 'invited', target: 'lin@northwind.studio', at: 'yesterday' },
    { id: 'a5', who: 'u2', what: 'closed', target: 'Audit existing capture taps & gestures', at: 'yesterday' },
    { id: 'a6', who: 'u3', what: 'reassigned', target: 'Permissions priming UX', from: 'u4', to: 'u3', at: '2 days ago' },
  ];

  const invitations = [
    { id: 'i1', project: 'Aperture · Mobile rebuild', inviter: 'Maya Okafor', role: 'contributor', expires: 'in 5 days' },
    { id: 'i2', project: 'Operator console v3', inviter: 'Maya Okafor', role: 'manager', expires: 'in 12 days' },
  ];

  const STATUSES = [
    { id: 'to_do', label: 'To do', short: 'TO DO' },
    { id: 'in_progress', label: 'In progress', short: 'IN PROGRESS' },
    { id: 'in_review', label: 'In review', short: 'IN REVIEW' },
    { id: 'in_testing', label: 'In testing', short: 'IN TESTING' },
    { id: 'done', label: 'Done', short: 'DONE' },
  ];

  return { members, projects, stories, tasks, activity, invitations, STATUSES, currentUser: 'u1' };
})();

window.byId = (arr, id) => arr.find(x => x.id === id);
