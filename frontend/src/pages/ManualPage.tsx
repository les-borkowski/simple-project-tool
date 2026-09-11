import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/layout/PageHeader'

// The contents rail and the scroll-spy both read this, so a section can only
// ever be added or renamed in one place.
const SECTIONS = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'getting-around', label: 'Getting around' },
  { id: 'projects', label: 'Projects' },
  { id: 'board', label: 'The board' },
  { id: 'stories', label: 'Stories' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'comments', label: 'Comments' },
  { id: 'history', label: 'Status history & time' },
  { id: 'sprints', label: 'Sprints' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'capture', label: 'Quick capture' },
  { id: 'members', label: 'Members & roles' },
  { id: 'settings', label: 'Settings' },
  { id: 'power', label: 'For power users' },
] as const

function sectionFromHash(hash: string): string | null {
  const id = hash.replace(/^#/, '')
  return SECTIONS.some((s) => s.id === id) ? id : null
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="manual-table">
      <table>
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Callout({
  kind,
  label,
  children,
}: {
  kind: 'note' | 'warn' | 'tip'
  label: string
  children: React.ReactNode
}) {
  return (
    <div className={`manual-${kind}`}>
      <span className="manual-label">{label}</span>
      {children}
    </div>
  )
}

export function ManualPage() {
  const { t } = useTranslation()
  const { hash } = useLocation()

  // Seeded from the hash, not just from the first section: on a deep link the
  // browser jumps straight to the anchor, which the observer below cannot
  // see — it reports the positions from before the jump and then stays quiet
  // until something crosses its band, so the rail would mark the wrong entry
  // until the reader scrolled.
  //
  // Only the initial value reads the hash. Nothing syncs it afterwards on
  // purpose: the contents links are plain in-page anchors, so following one
  // scrolls, and scrolling is exactly what the observer below is watching.
  const [active, setActive] = useState<string>(() => sectionFromHash(hash) ?? SECTIONS[0].id)

  // Highlights the contents entry for whichever section is in view. The
  // observer reports many sections at once on a tall screen, so the first in
  // document order wins — that is the one whose heading the reader has most
  // recently passed.
  useEffect(() => {
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const current = SECTIONS.find((s) => visible.has(s.id))
        if (current) setActive(current.id)
      },
      { rootMargin: '-10% 0px -70% 0px' }
    )

    for (const { id } of SECTIONS) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title={t('manual.title')} subtitle={t('manual.subtitle')} />

      <div className="flex-1 px-4 py-5 md:px-7 md:py-6 min-w-0">
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] max-w-4xl">
          <nav className="manual-toc text-ui-md" aria-label="Contents">
            <ol>
              {SECTIONS.map(({ id, label }) => (
                <li key={id}>
                  <a href={`#${id}`} aria-current={active === id ? 'true' : undefined}>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="manual min-w-0">
            {/* 1 */}
            <section id="getting-started">
              <h2>Getting started</h2>

              <h3>Create an account</h3>
              <ol>
                <li>Open the app and choose <strong>Register</strong>.</li>
                <li>Enter your full name, email address and a password (typed twice — the form checks the two match before it will submit).</li>
                <li>You'll land on a <strong>Check your email</strong> screen. We send a confirmation link to the address you gave.</li>
                <li>Click the link. Once it's confirmed, your account is active and you can sign in.</li>
              </ol>

              <Callout kind="note" label="Didn't get the email?">
                <p>The confirmation screen has a <strong>Resend confirmation email</strong> button. If you try to sign in before confirming, you'll be told <em>“Please confirm your email before signing in.”</em> — that's the same situation, not a wrong password.</p>
              </Callout>

              <h3>Log in</h3>
              <p>Enter your email and password on the login screen. You stay signed in on that browser until you sign out.</p>

              <h3>Forgotten your password</h3>
              <ol>
                <li>Choose <strong>Forgot password?</strong> next to the password field on the login screen.</li>
                <li>Enter your email address and choose <strong>Send reset link</strong>.</li>
                <li>Open the link in the email you receive. It takes you to a <strong>Reset password</strong> page where you set a new password.</li>
                <li>Sign in with the new password.</li>
              </ol>
              <p>Reset links expire. An expired or already-used link shows <em>“This link is invalid or has expired.”</em> — request a fresh one rather than trying the old email again.</p>

              <Callout kind="note" label="Why the confirmation is vague">
                <p>After you submit, the app says a link has been sent <em>if that address is registered</em> — it won't confirm either way. That's deliberate: a page that said “no such account” would let anyone check which email addresses have accounts here.</p>
              </Callout>

              <h3>Changing your password later</h3>
              <p className="manual-path">Settings → App Settings → Security</p>
              <p>Enter your current password, then the new one twice. After a successful change you're asked whether to <strong>Stay logged in</strong> or <strong>Log out</strong> — logging out is the safer choice if you suspect someone else knew the old password.</p>
            </section>

            {/* 2 */}
            <section id="getting-around">
              <h2>Getting around</h2>

              <h3>The sidebar</h3>
              <p>The sidebar is your main navigation and stays with you on every page:</p>
              <ul>
                <li><strong>Recent work</strong> — the projects, stories and tasks you touched most recently, so you can pick up where you left off without hunting.</li>
                <li><strong>Projects</strong> — your projects, with a <strong>+</strong> shortcut to start a new one and an <strong>All projects</strong> link when the list is longer than the sidebar shows.</li>
                <li><strong>Invitations</strong> — project invitations waiting on you. A number appears next to it when something's pending.</li>
                <li><strong>Help</strong> and <strong>Settings</strong> — at the bottom, along with your account menu and <strong>Log out</strong>.</li>
              </ul>
              <p>On a narrow screen the sidebar collapses into a menu button in the top bar; tap it to slide the same navigation out as a drawer.</p>

              <h3>Search</h3>
              <p>The search box at the top of the sidebar searches across projects, stories and tasks at once. Results are grouped by type, and you can open the full <strong>Search results</strong> page to see everything rather than just the top matches.</p>

              <h3>The command palette</h3>
              <p>Press <kbd>⌘K</kbd> (or <kbd>Ctrl K</kbd> on Windows and Linux) anywhere in the app to open the command palette. Start typing to search, or pick a quick action:</p>
              <ul>
                <li>New project, new story, new task</li>
                <li>Invite member</li>
                <li>Open settings, open this manual</li>
                <li>Toggle dark / light mode</li>
              </ul>
              <p>Move through results with <kbd>↑</kbd> and <kbd>↓</kbd>, open one with <kbd>Enter</kbd>, and dismiss the palette with <kbd>Esc</kbd>.</p>

              <Callout kind="tip" label="Tip">
                <p>The palette works from inside the mobile menu too — pressing <kbd>⌘K</kbd> closes the drawer and opens the palette in its place. It won't fire while a dialog is open, so finish or cancel what you're doing first.</p>
              </Callout>

              <h3>Breadcrumbs</h3>
              <p>Detail pages show the trail that got you there — project → story → task — so you can jump back up a level in one click. On narrow screens the trail is shortened; tap it to show the full path.</p>
            </section>

            {/* 3 */}
            <section id="projects">
              <h2>Projects</h2>
              <p>A project is the top-level container for a piece of work. It holds stories, tasks, members, sprints and its own status workflow.</p>

              <h3>Creating a project</h3>
              <p>Use <strong>New project</strong> from the Projects page, the <strong>+</strong> in the sidebar, or the command palette. A project needs a name; the description is optional and can be filled in later.</p>

              <h3>Archiving and deleting</h3>
              <p>Open a project and use the <strong>⋯</strong> menu in its header:</p>
              <ul>
                <li><strong>Archive</strong> hides the project from the default list without losing anything. Tick <strong>Show archived</strong> on the Projects page to see archived projects, then <strong>Restore</strong> to bring one back.</li>
                <li><strong>Delete</strong> removes the project permanently and asks you to confirm first.</li>
              </ul>
              <p>Both actions are Manager-only — see <a href="#members">Members &amp; roles</a>.</p>

              <h3>Project tabs</h3>
              <p>Inside a project, a tab strip switches between views:</p>
              <Table
                head={['Tab', 'What it shows']}
                rows={[
                  [<strong>Board</strong>, 'Every task in the project as cards in status columns'],
                  [<strong>Stories</strong>, "The project's stories as a sortable, filterable table"],
                  [<strong>Sprints</strong>, 'Time-boxed sprints and the tasks assigned to each'],
                  [<strong>Timeline</strong>, 'A Gantt-style view of tasks over calendar dates'],
                  [<strong>Members</strong>, 'Who has access to the project, and at what role'],
                  [<strong>Settings</strong>, 'Which tabs appear and in what order'],
                ]}
              />
              <p>You can hide tabs you don't use and drag the rest into the order you prefer — see <a href="#settings">Settings</a>. <strong>Settings</strong> itself is always last and can never be hidden, because it's where you bring a hidden tab back.</p>
            </section>

            {/* 4 */}
            <section id="board">
              <h2>The board</h2>
              <p>The board shows every task in the project as a card, arranged in columns. <strong>The columns are the project's own statuses</strong> — if you've customised them, the board follows.</p>

              <h3>Moving work along</h3>
              <p>Drag a card into another column to change its status. The change saves immediately and is recorded in that task's status history. You can also change status from the task's own page or from the status control on the card.</p>

              <h3>Filtering and sorting</h3>
              <p>The board toolbar narrows what's on screen. Filter by <strong>status</strong>, <strong>priority</strong>, <strong>assignee</strong> or <strong>story</strong>, and search by title. Counts of tasks and completed tasks update as you filter, so you can read progress off the toolbar at a glance. If nothing matches you'll see <em>“No results match your filters”</em> rather than an empty board you might mistake for an empty project.</p>
              <p>The Stories tab has its own equivalent controls — search by title, filter by status and priority, and sort by created date, status, priority or title in either direction.</p>

              <Callout kind="note" label="Good to know">
                <p>Tasks belonging to a story that is already <em>Done</em> drop off the board, so a finished story's tasks don't clutter your active work. Open the story itself to see them.</p>
              </Callout>

              <h3>Creating from the board</h3>
              <p>The <strong>New</strong> button in the project header creates a <strong>Story</strong>, a <strong>Task</strong>, or opens <strong>Quick capture</strong> to write several tasks in plain English at once. There's an <strong>Invite</strong> button beside it for adding people.</p>
            </section>

            {/* 5 */}
            <section id="stories">
              <h2>Stories</h2>
              <p>A story groups related tasks inside a project — a feature, a workstream, a chunk of a release. Like projects and tasks, a story has its own status, priority, description, comments and history.</p>

              <h3>The Backlog story</h3>
              <p>Every project is created with a default story called <strong>Backlog</strong>. Tasks you create at project level — rather than inside a specific story — land there automatically, which is why the board can show all of a project's tasks without any of them being homeless. Backlog always sorts to the bottom of the Stories list.</p>

              <h3>Working with a story</h3>
              <p>Open a story to get its detail page: description, status, priority, its tasks, its comments and its status history. Edits save as you make them and confirm with a small toast — you don't need to hunt for a Save button.</p>
              <p>Moving a task between stories is done from the task, not the story — see below.</p>
            </section>

            {/* 6 */}
            <section id="tasks">
              <h2>Tasks</h2>
              <p>Tasks are the unit of actual work. Create one with <strong>New → Task</strong>, from the command palette, or via <a href="#capture">Quick capture</a>.</p>

              <h3>What a task holds</h3>
              <Table
                head={['Field', 'Notes']}
                rows={[
                  [<strong>Title</strong>, 'Editable in place from the task page.'],
                  [<strong>Status</strong>, <>One of the project's statuses. Every change is recorded — see <a href="#history">Status history</a>.</>],
                  [<strong>Priority</strong>, 'Low, Medium or High.'],
                  [<strong>Assignee</strong>, 'Any member of the project, or Unassigned.'],
                  [<strong>Story</strong>, 'Which story the task belongs to. Change it here to move the task.'],
                  [<strong>Sprint</strong>, 'Which sprint it is scheduled into, if any.'],
                  [<strong>Effort</strong>, "A whole number in the project's chosen unit. Only appears when the project has effort tracking switched on."],
                  [<strong>Description</strong>, 'Free text with markdown support.'],
                ]}
              />
              <p>Each field saves the moment you change it and confirms with a toast. The task page also carries its comments and its status history.</p>

              <h3>Deleting a task</h3>
              <p>Deleting is a Manager action and asks for confirmation. It cannot be undone — if you just want it out of the way, move it to a <em>Done</em> status instead.</p>
            </section>

            {/* 7 */}
            <section id="comments">
              <h2>Comments</h2>
              <p>Projects, stories and tasks each have their own comment thread, on the item's detail page. Comments support <strong>markdown</strong>, so you can use lists, links, emphasis and code formatting.</p>
              <p>Write in the box, then <strong>Post</strong>. Contributors can comment as well as Managers — commenting is deliberately not a privileged action, since it's how most discussion happens.</p>
            </section>

            {/* 8 */}
            <section id="history">
              <h2>Status history &amp; time</h2>
              <p>Every status change on a project, story or task is appended to a permanent record. Nothing overwrites or removes an earlier entry, so the history is a genuine audit trail rather than a summary that can drift.</p>
              <p>The <strong>Status History</strong> panel on a story or task page shows, for each change:</p>
              <ul>
                <li>the status it moved from and to,</li>
                <li>who made the change,</li>
                <li>and how long the item sat in the previous status — the <strong>Time in status</strong> figure.</li>
              </ul>
              <p>Because the trail is complete, elapsed time is calculated rather than estimated. That makes it useful for spotting where work actually stalls: a task that spent eight days <em>In review</em> shows up plainly, even if it was finished quickly once someone looked at it.</p>

              <Callout kind="note" label="Aggregate reporting">
                <p>Roll-ups across a whole project or a whole person — total time per status, per project or per user — are available through the CLI and the API rather than the web UI. See <a href="#power">For power users</a>.</p>
              </Callout>
            </section>

            {/* 9 */}
            <section id="sprints">
              <h2>Sprints</h2>
              <p>A sprint is a named, time-boxed block of work with a start and end date. The <strong>Sprints</strong> tab shows each sprint alongside an <strong>Unassigned tasks</strong> column.</p>

              <h3>Creating and editing</h3>
              <p>Use <strong>New sprint</strong> and give it a name, a start date and an end date. <strong>Capacity</strong> is optional. Name, dates and capacity can all be edited afterwards from the sprint's menu, and each edit confirms with a toast.</p>

              <h3>Assigning tasks</h3>
              <p>Two ways, whichever suits:</p>
              <ul>
                <li><strong>Drag</strong> a task card onto a sprint column. The drop target highlights as you hover it.</li>
                <li>Use the <strong>Assign to sprint</strong> menu on the card, which also offers <strong>No sprint</strong> to pull a task back out.</li>
              </ul>

              <h3>Capacity and effort</h3>
              <p>When a project has effort tracking enabled, each card shows its effort and the sprint header shows <strong>used / capacity</strong>. If the assigned effort exceeds the capacity you set, the sprint is flagged <strong>Over capacity</strong> — a signal to move something out, not a hard block. Sprints with no capacity set simply don't show the comparison.</p>
              <p>Effort tracking is off by default and is switched on per project — see <a href="#settings">Settings</a>.</p>
            </section>

            {/* 10 */}
            <section id="timeline">
              <h2>Timeline</h2>
              <p>The <strong>Timeline</strong> tab lays tasks out as horizontal bars against a calendar, grouped by sprint, with tasks that aren't in any sprint shown last. Select a bar to see that task's details.</p>

              <h3>Where a bar's dates come from</h3>
              <p>A task doesn't need a date field filled in to appear. The timeline works out the best available span, in this order:</p>
              <Table
                head={['Labelled', 'Used when', 'Bar spans']}
                rows={[
                  [<strong>Deadline</strong>, 'The task has a due date', 'From its first status change (or its creation date, if it has never changed status) to the due date'],
                  [<strong>Sprint</strong>, 'No due date, but the task is in a sprint', "The sprint's start and end dates"],
                  [<strong>Status history</strong>, 'Neither of the above', "The task's first status change to its most recent one"],
                ]}
              />
              <p>Each bar is labelled with which of the three it used, so you can tell a real deadline from an inferred span at a glance.</p>

              <Callout kind="warn" label="Large projects">
                <p>The timeline draws at most <strong>500 tasks</strong>. Past that you'll see a warning that only the first 500 are shown — the other views have no such limit.</p>
              </Callout>
            </section>

            {/* 11 */}
            <section id="capture">
              <h2>Quick capture</h2>
              <p>Quick capture turns a sentence into structured tasks. Type something like <em>“ask Anna to review the checkout flow by Friday, and someone needs to update the pricing page”</em> and it proposes tasks with titles, due dates, assignees, stories and priorities already filled in.</p>
              <p>Open it from <strong>New → Quick capture</strong> in a project header.</p>

              <h3>How it works</h3>
              <ol>
                <li>Describe the work in your own words — one task or several.</li>
                <li>Choose <strong>Preview tasks</strong>. Nothing is created yet.</li>
                <li>Review the proposed tasks. Every field is editable, and each task has a tick box.</li>
                <li>Confirm. Only ticked tasks are created, and they're created together — all of them or none.</li>
              </ol>

              <Callout kind="tip" label="Nothing is created without you">
                <p>The preview step never writes anything. Creation happens only when you confirm, so you can preview as often as you like while you get the wording right.</p>
              </Callout>

              <h3>Low confidence</h3>
              <p>When the extraction isn't sure about a task, it's marked <strong>Low confidence</strong> and <strong>starts unticked</strong>. It isn't hidden or thrown away — you decide whether it's real. Well-understood tasks start ticked, so the common case is: preview, glance, confirm.</p>
              <p>Two things are checked before you can confirm: at least one task must be ticked, and every ticked task needs a title.</p>

              <h3>Privacy</h3>
              <Callout kind="warn" label="Your text leaves the app">
                <p>When you preview, the text you typed is sent to the configured AI provider, along with the <strong>display names</strong> of the project's members and the <strong>names</strong> of its stories — that's what lets it resolve “assign it to Anna” or match a story you mentioned. Email addresses and internal IDs are never sent. Check your provider's terms before pointing this at confidential material, particularly on a free tier.</p>
              </Callout>

              <h3>If it's unavailable</h3>
              <p>Quick capture is optional and depends on an AI provider being configured. If none is, or if the provider can't be reached, you'll see <em>“Capture is temporarily unavailable.”</em> — every other way of creating tasks still works. You can supply your own provider key under <strong>Settings → AI Providers</strong>.</p>
            </section>

            {/* 12 */}
            <section id="members">
              <h2>Members &amp; roles</h2>

              <h3>The two roles</h3>
              <Table
                head={['Role', 'Can do']}
                rows={[
                  [<strong>Manager</strong>, 'Everything a Contributor can, plus create, delete and archive items, invite and remove members, choose the role an invitation offers, and edit project settings'],
                  [<strong>Contributor</strong>, 'View the project, update statuses, and add comments'],
                ]}
              />
              <p>Two rules decide what you can do in a given project:</p>
              <ul>
                <li><strong>A per-project role beats your global role.</strong> Someone who is a Contributor generally can be a Manager on one particular project, and vice versa.</li>
                <li><strong>The project owner always has Manager access</strong>, regardless of anything else.</li>
              </ul>
              <p>The interface follows your role: actions you don't have permission for aren't shown, so a Contributor sees a simpler project header rather than buttons that fail.</p>

              <h3>Inviting people</h3>
              <p>Use <strong>Invite</strong> in the project header or the <strong>Members</strong> tab. Enter an email address and pick the role to offer. The invitation is emailed to them.</p>

              <h3>Receiving an invitation</h3>
              <p>Invitations appear on your <strong>Invitations</strong> page, with who invited you, the role offered, and when it expires. <strong>Accept</strong> adds you to the project; <strong>Decline</strong> dismisses it. Pending invitations show as a count next to Invitations in the sidebar.</p>

              <h3>Removing someone</h3>
              <p>The Members tab lists everyone with access. Managers can remove a member from there. Removing someone takes away their access; the work they did stays.</p>
            </section>

            {/* 13 */}
            <section id="settings">
              <h2>Settings</h2>
              <p>Settings is split into two scopes: <strong>App Settings</strong> (about you, everywhere) and <strong>Project Settings</strong> (about one project).</p>

              <h3>App Settings</h3>

              <h4>Profile</h4>
              <p>Shows your name, email and global role. Below it, <strong>Appearance</strong>:</p>
              <ul>
                <li><strong>Theme</strong> — Light, Dark, or System (follows your operating system).</li>
                <li><strong>Accent colour</strong> — indigo, violet, emerald, rose, amber or stone. It recolours buttons, highlights and the active state throughout the app — including this manual.</li>
                <li><strong>Language</strong> — English (en-GB) or Polish (pl). The change applies immediately.</li>
              </ul>

              <h4>API Keys</h4>
              <p>Scoped keys for scripts, integrations and AI agents. Covered under <a href="#power">For power users</a>.</p>

              <h4>AI Providers</h4>
              <p>Connect your own LLM provider key to power <a href="#capture">Quick capture</a>, instead of relying on a shared server key. Each provider shows as <strong>Not configured</strong> or <strong>Configured</strong> with the last few characters of the key so you can tell which one is saved. You can also set:</p>
              <ul>
                <li>a <strong>model override</strong>, if you want a specific model rather than the default;</li>
                <li><strong>requests per minute</strong> and <strong>tokens per minute</strong> limits, shown with the maximum you're allowed — your own limits can go below that ceiling but not above it;</li>
                <li><strong>use as default provider</strong>, when more than one is configured.</li>
              </ul>
              <p><strong>Clear</strong> removes a saved key, after a confirmation; the provider goes back to showing as not configured.</p>

              <h4>Security</h4>
              <p>Change your password — see <a href="#getting-started">Getting started</a>.</p>

              <h3>Project Settings</h3>
              <p>Pick a project from the dropdown, then configure it. These controls are Manager-only.</p>

              <h4>Statuses</h4>
              <p>Each project owns its workflow. New projects start with four statuses:</p>
              <Table
                head={['Status', 'Slug']}
                rows={[
                  ['To Do', <code>to_do</code>],
                  ['In Progress', <code>in_progress</code>],
                  ['In Review', <code>in_review</code>],
                  ['Done', <code>done</code>],
                ]}
              />
              <p>You can <strong>add</strong> statuses, <strong>rename</strong> them, change their <strong>colour</strong>, and <strong>reorder</strong> them with move up / move down. The order you set is the order of the columns on the board. Each status has a slug, which is the stable identifier used by the API and CLI.</p>

              <Callout kind="warn" label="Deleting a status">
                <p>Items already sitting in a deleted status don't vanish — they become <strong>unlisted</strong>, and are shown in an “Unlisted statuses” group so you can move them somewhere valid. Move work out of a status before deleting it and you'll avoid the tidy-up.</p>
              </Callout>

              <h4>Effort tracking</h4>
              <p>Off by default. Tick <strong>Enable effort tracking</strong> and choose a unit — <code>sp</code> for story points, <code>h</code> for hours, or anything else up to 20 characters — then Save. Once it's on, tasks gain an <strong>Effort</strong> field and sprints can compare assigned effort against capacity.</p>

              <h4>Project tabs</h4>
              <p>The project's own <strong>Settings</strong> tab controls its tab strip: drag tabs to reorder them, or toggle a tab between <strong>Visible</strong> and <strong>Hidden</strong>. A project that never uses sprints can hide Sprints and Timeline and keep the header uncluttered. Settings itself always stays visible and last.</p>
            </section>

            {/* 14 */}
            <section id="power">
              <h2>For power users</h2>
              <p>Everything in the web UI is built on a REST API, and that API is available to you directly — from the command line, from scripts, or from an AI assistant.</p>

              <h3>Installing the tools</h3>
              <p>Both <code>spt</code> and <code>spt-mcp</code> ship with the backend — they're two entry points on the same Python package, so one install gives you both. You'll need Python 3.11 or newer and <a href="https://docs.astral.sh/uv/" target="_blank" rel="noreferrer">uv</a>.</p>
              <pre><code>{`cd backend
uv sync
uv pip install -e .`}</code></pre>

              <p>That installs both commands into the backend's virtual environment, which isn't on your PATH. The simplest way to run them is to prefix with <code>uv run</code>:</p>
              <pre><code>{`uv run spt auth login`}</code></pre>

              <p>For a bare <code>spt</code> you can type anywhere, either activate the environment for your shell session with <code>source .venv/bin/activate</code>, or install the package as a standalone tool with <code>uv tool install --editable .</code>. The examples below assume <code>spt</code> resolves on its own — add <code>uv run</code> in front if it doesn't.</p>

              <Callout kind="note" label="Pointing the CLI at another server">
                <p>The CLI talks to <code>http://localhost:8000</code> unless told otherwise, and keeps its settings — including the tokens from <code>spt auth login</code> — in <code>~/.config/spt/config.json</code>. To use a different server, edit <code>api_base_url</code> in that file by hand; there's no command for it yet. Note that <code>spt config set</code> is a different thing: it changes your account preferences on the server, not the CLI's own connection.</p>
              </Callout>

              <h3>API keys</h3>
              <p className="manual-path">Settings → App Settings → API Keys</p>
              <p>An API key lets a script or agent act on your projects without you handing over your password. Give the key a <strong>label</strong> so you can recognise it later, and tick exactly the <strong>scopes</strong> it needs:</p>
              <Table
                head={['Scope', 'Grants']}
                rows={[
                  [<><code>read:projects</code> / <code>write:projects</code></>, 'View / modify projects'],
                  [<><code>read:stories</code> / <code>write:stories</code></>, 'View / modify stories'],
                  [<><code>read:tasks</code> / <code>write:tasks</code></>, 'View / modify tasks'],
                  [<><code>read:comments</code> / <code>write:comments</code></>, 'View / post comments'],
                ]}
              />

              <Callout kind="warn" label="Copy the key immediately">
                <p>The key is shown once, when it's created, and never again. Copy it into your password manager or config before closing the dialog. If you lose it, revoke it and create another.</p>
              </Callout>

              <p>The key list shows each key's label, scopes and when it was last used — <strong>Never</strong> if it hasn't been. <strong>Revoke</strong> disables a key immediately. A key that's been used more recently than you expected is worth revoking on the spot.</p>

              <Callout kind="note" label="Scopes are the boundary">
                <p>What a key can do is decided entirely by its scopes, not by what's connecting with it. A genuinely read-only agent is one whose key was created with only <code>read:</code> scopes — nothing else enforces it.</p>
              </Callout>

              <h3>The command line</h3>
              <p>The <code>spt</code> CLI mirrors the web UI. Log in once, then work from the terminal:</p>
              <pre><code>{`spt auth login

spt projects list
spt stories list <project_id>
spt tasks list <story_id>
spt comments add task:<id> "Looks good to me"
spt invitations list`}</code></pre>

              <p>Note the shapes: <code>tasks list</code> takes a <strong>story</strong> id, since tasks live under stories — use the project's Backlog story for project-level tasks. Comment commands take an item reference rather than a bare id: <code>project:&lt;id&gt;</code>, <code>story:&lt;id&gt;</code> or <code>task:&lt;id&gt;</code>. Add <code>--all</code> to a list command to page through everything instead of the first 25.</p>

              <p>Quick capture works from the terminal too. It prints the extracted tasks and waits for your confirmation, exactly like the web UI; pass <code>--yes</code> to skip the prompt in a script:</p>
              <pre><code>{`spt tasks capture <project_id> "ask Anna to review the checkout flow by Friday"`}</code></pre>

              <p>Time reporting is CLI-only — this is where the aggregate numbers live:</p>
              <pre><code>{`spt time-metrics    # time in each status for an item
spt time-history    # the raw status-change trail
spt time-report     # aggregate totals per project or per user`}</code></pre>

              <p>Manage your own AI provider credential without leaving the shell. The <code>set</code> command prompts for the key with hidden input, so it never lands in your shell history:</p>
              <pre><code>{`spt config llm list
spt config llm providers
spt config llm set google
spt config llm delete google`}</code></pre>

              <p>For unattended use, point the CLI at an API key instead of a login with <code>--api-key</code> or the <code>SPT_API_KEY</code> environment variable.</p>

              <h3>AI assistants (MCP)</h3>
              <p>The <code>spt-mcp</code> server exposes the tool to an LLM host such as Claude Code or Claude Desktop, so an assistant can browse and edit your projects directly. It comes from the same install as the CLI — see <a href="#power">Installing the tools</a> above.</p>
              <p>Create a scoped key, then register the server:</p>
              <pre><code>{`spt config api-keys create --label "claude-code" \\
  --scopes read:projects,read:stories,read:tasks,read:comments,write:tasks,write:comments

claude mcp add spt -e SPT_API_KEY=<key> -e SPT_API_URL=http://localhost:8000 -- spt-mcp`}</code></pre>

              <Callout kind="warn" label="The host has to be able to find spt-mcp">
                <p>That last <code>spt-mcp</code> is a command your LLM host runs itself, so it has to resolve on <em>its</em> PATH — not just in a shell where you've activated the virtual environment. If the host reports that the server failed to start, give it the full path instead, for example <code>/path/to/simple-project-tool/backend/.venv/bin/spt-mcp</code>, or install the package with <code>uv tool install --editable .</code> so the command is available everywhere.</p>
              </Callout>

              <p>The assistant can then look things up (<code>list_projects</code>, <code>get_task</code>, <code>search</code>, <code>list_comments</code>), make changes (<code>update_task</code>, <code>create_task</code>, <code>create_story</code>, <code>add_comment</code>), and run quick capture (<code>capture_tasks</code>, <code>confirm_capture</code>).</p>

              <Callout kind="note" label="What an assistant can't do">
                <p>There are deliberately <strong>no delete tools and no member-management tools</strong>. An assistant can't destroy your work or change who has access to a project, whatever it's asked. Beyond that, the scopes on the key you issued are the real limit — issue a read-only key if you only want it to look.</p>
              </Callout>

              <h3>The REST API</h3>
              <p>Interactive API documentation is served by the backend itself at <code>/docs</code> (Swagger UI) and <code>/redoc</code>. A few conventions worth knowing:</p>
              <ul>
                <li>All endpoints live under <code>/api/v1/</code>.</li>
                <li>Updates use <code>PATCH</code> with only the fields you're changing.</li>
                <li>Lists are paginated with a cursor: <code>?cursor=&lt;id&gt;&amp;limit=25</code>.</li>
                <li>Errors come back as <code>{'{"error": {"code": ..., "message": ...}}'}</code>.</li>
              </ul>
            </section>
          </article>
        </div>
      </div>
    </div>
  )
}
