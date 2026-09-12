import type { ManualContent } from './types'

export const manualEnGB: ManualContent = {
  title: 'User manual',
  subtitle: 'How Simple Project Tool works, end to end.',
  contentsLabel: 'Contents',
  sections: [
    {
      id: 'getting-started',
      label: 'Getting started',
      heading: 'Getting started',
      blocks: [
        { t: 'h3', text: 'Create an account' },
        {
          t: 'ol',
          items: [
            'Open the app and choose **Register**.',
            'Enter your full name, email address and a password (typed twice — the form checks the two match before it will submit).',
            "You'll land on a **Check your email** screen. We send a confirmation link to the address you gave.",
            "Click the link. Once it's confirmed, your account is active and you can sign in.",
          ],
        },
        {
          t: 'callout',
          kind: 'note',
          label: "Didn't get the email?",
          text: 'The confirmation screen has a **Resend confirmation email** button. If you try to sign in before confirming, you\'ll be told _“Please confirm your email before signing in.”_ — that\'s the same situation, not a wrong password.',
        },
        { t: 'h3', text: 'Log in' },
        {
          t: 'p',
          text: 'Enter your email and password on the login screen. You stay signed in on that browser until you sign out.',
        },
        { t: 'h3', text: 'Forgotten your password' },
        {
          t: 'ol',
          items: [
            'Choose **Forgot password?** next to the password field on the login screen.',
            'Enter your email address and choose **Send reset link**.',
            'Open the link in the email you receive. It takes you to a **Reset password** page where you set a new password.',
            'Sign in with the new password.',
          ],
        },
        {
          t: 'p',
          text: 'Reset links expire. An expired or already-used link shows _“This link is invalid or has expired.”_ — request a fresh one rather than trying the old email again.',
        },
        {
          t: 'p',
          text: 'Reset emails are also rate limited: if you ask for several in quick succession only the first is sent, so check your inbox before requesting another.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Why the confirmation is vague',
          text: 'After you submit, the app says a link has been sent _if that address is registered_ — it won\'t confirm either way. That\'s deliberate: a page that said “no such account” would let anyone check which email addresses have accounts here.',
        },
        { t: 'h3', text: 'Changing your password later' },
        { t: 'path', text: 'Settings → App Settings → Security' },
        {
          t: 'p',
          text: "Enter your current password, then the new one twice. After a successful change you're asked whether to **Stay logged in** or **Log out** — logging out is the safer choice if you suspect someone else knew the old password.",
        },
      ],
    },
    {
      id: 'getting-around',
      label: 'Getting around',
      heading: 'Getting around',
      blocks: [
        { t: 'h3', text: 'The sidebar' },
        { t: 'p', text: 'The sidebar is your main navigation and stays with you on every page:' },
        {
          t: 'ul',
          items: [
            '**Recent work** — the projects, stories and tasks you touched most recently, so you can pick up where you left off without hunting.',
            '**Projects** — your projects, with a **+** shortcut to start a new one and an **All projects** link when the list is longer than the sidebar shows.',
            "**Invitations** — project invitations waiting on you. A number appears next to it when something's pending.",
            '**Help** and **Settings** — at the bottom, along with your account menu and **Log out**.',
          ],
        },
        {
          t: 'p',
          text: 'On a narrow screen the sidebar collapses into a menu button in the top bar; tap it to slide the same navigation out as a drawer.',
        },
        { t: 'h3', text: 'Search' },
        {
          t: 'p',
          text: 'The search box at the top of the sidebar searches across projects, stories and tasks at once. Results are grouped by type, and you can open the full **Search results** page to see everything rather than just the top matches.',
        },
        { t: 'h3', text: 'The command palette' },
        {
          t: 'p',
          text: 'Press [[⌘K]] (or [[Ctrl K]] on Windows and Linux) anywhere in the app to open the command palette. Start typing to search, or pick a quick action:',
        },
        {
          t: 'ul',
          items: [
            'New project, new story, new task',
            'Invite member',
            'Open settings, open this manual',
            'Toggle dark / light mode',
          ],
        },
        {
          t: 'p',
          text: 'Move through results with [[↑]] and [[↓]], open one with [[Enter]], and dismiss the palette with [[Esc]].',
        },
        {
          t: 'callout',
          kind: 'tip',
          label: 'Tip',
          text: "The palette works from inside the mobile menu too — pressing [[⌘K]] closes the drawer and opens the palette in its place. It won't fire while a dialog is open, so finish or cancel what you're doing first.",
        },
        { t: 'h3', text: 'Breadcrumbs' },
        {
          t: 'p',
          text: 'Detail pages show the trail that got you there — project → story → task — so you can jump back up a level in one click. On narrow screens the trail is shortened; tap it to show the full path.',
        },
      ],
    },
    {
      id: 'projects',
      label: 'Projects',
      heading: 'Projects',
      blocks: [
        {
          t: 'p',
          text: 'A project is the top-level container for a piece of work. It holds stories, tasks, members, sprints and its own status workflow.',
        },
        { t: 'h3', text: 'Creating a project' },
        {
          t: 'p',
          text: 'Use **New project** from the Projects page, the **+** in the sidebar, or the command palette. A project needs a name; the description is optional and can be filled in later.',
        },
        { t: 'h3', text: 'Archiving and deleting' },
        { t: 'p', text: 'Open a project and use the **⋯** menu in its header:' },
        {
          t: 'ul',
          items: [
            '**Archive** hides the project from the default list without losing anything. Tick **Show archived** on the Projects page to see archived projects, then **Restore** to bring one back.',
            '**Delete** removes the project permanently and asks you to confirm first.',
          ],
        },
        { t: 'p', text: 'Both actions are Manager-only — see [Members & roles](#members).' },
        { t: 'h3', text: 'Project tabs' },
        { t: 'p', text: 'Inside a project, a tab strip switches between views:' },
        {
          t: 'table',
          head: ['Tab', 'What it shows'],
          rows: [
            ['**Board**', 'Every task in the project as cards in status columns'],
            ['**Stories**', "The project's stories as a sortable, filterable table"],
            ['**Sprints**', 'Time-boxed sprints and the tasks assigned to each'],
            ['**Timeline**', 'A Gantt-style view of tasks over calendar dates'],
            ['**Members**', 'Who has access to the project, and at what role'],
            ['**Settings**', 'Which tabs appear and in what order'],
          ],
        },
        {
          t: 'p',
          text: "You can hide tabs you don't use and drag the rest into the order you prefer — see [Settings](#settings). **Settings** itself is always last and can never be hidden, because it's where you bring a hidden tab back.",
        },
      ],
    },
    {
      id: 'board',
      label: 'The board',
      heading: 'The board',
      blocks: [
        {
          t: 'p',
          text: "The board shows every task in the project as a card, arranged in columns. **The columns are the project's own statuses** — if you've customised them, the board follows.",
        },
        { t: 'h3', text: 'Moving work along' },
        {
          t: 'p',
          text: "Drag a card into another column to change its status. The change saves immediately and is recorded in that task's status history. You can also change status from the task's own page or from the status control on the card.",
        },
        { t: 'h3', text: 'Filtering and sorting' },
        {
          t: 'p',
          text: "The board toolbar narrows what's on screen. Filter by **status**, **priority**, **assignee** or **story**, and search by title. Counts of tasks and completed tasks update as you filter, so you can read progress off the toolbar at a glance. If nothing matches you'll see _“No results match your filters”_ rather than an empty board you might mistake for an empty project.",
        },
        {
          t: 'p',
          text: 'The Stories tab has its own equivalent controls — search by title, filter by status and priority, and sort by created date, status, priority or title in either direction.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Good to know',
          text: "Tasks belonging to a story that is already _Done_ drop off the board, so a finished story's tasks don't clutter your active work. Open the story itself to see them.",
        },
        { t: 'h3', text: 'Creating from the board' },
        {
          t: 'p',
          text: 'The **New** button in the project header creates a **Story**, a **Task**, or opens **Quick capture** to write several tasks in plain English at once. There\'s an **Invite** button beside it for adding people.',
        },
      ],
    },
    {
      id: 'stories',
      label: 'Stories',
      heading: 'Stories',
      blocks: [
        {
          t: 'p',
          text: 'A story groups related tasks inside a project — a feature, a workstream, a chunk of a release. Like projects and tasks, a story has its own status, priority, description, comments and history.',
        },
        { t: 'h3', text: 'The Backlog story' },
        {
          t: 'p',
          text: 'Every project is created with a default story called **Backlog**. Tasks you create at project level — rather than inside a specific story — land there automatically, which is why the board can show all of a project\'s tasks without any of them being homeless. Backlog always sorts to the bottom of the Stories list.',
        },
        { t: 'h3', text: 'Working with a story' },
        {
          t: 'p',
          text: "Open a story to get its detail page: description, status, priority, its tasks, its comments and its status history. Edits save as you make them and confirm with a small toast — you don't need to hunt for a Save button.",
        },
        {
          t: 'p',
          text: 'Moving a task between stories is done from the task, not the story — see below.',
        },
      ],
    },
    {
      id: 'tasks',
      label: 'Tasks',
      heading: 'Tasks',
      blocks: [
        {
          t: 'p',
          text: 'Tasks are the unit of actual work. Create one with **New → Task**, from the command palette, or via [Quick capture](#capture).',
        },
        { t: 'h3', text: 'What a task holds' },
        {
          t: 'table',
          head: ['Field', 'Notes'],
          rows: [
            ['**Title**', 'Editable in place from the task page.'],
            [
              '**Status**',
              "One of the project's statuses. Every change is recorded — see [Status history](#history).",
            ],
            ['**Priority**', 'Low, Medium or High.'],
            ['**Assignee**', 'Any member of the project, or Unassigned.'],
            ['**Story**', 'Which story the task belongs to. Change it here to move the task.'],
            ['**Sprint**', 'Which sprint it is scheduled into, if any.'],
            [
              '**Effort**',
              "A whole number in the project's chosen unit. Only appears when the project has effort tracking switched on.",
            ],
            ['**Description**', 'Free text with markdown support.'],
          ],
        },
        {
          t: 'p',
          text: 'Each field saves the moment you change it and confirms with a toast. The task page also carries its comments and its status history.',
        },
        { t: 'h3', text: 'Deleting a task' },
        {
          t: 'p',
          text: 'Deleting is a Manager action and asks for confirmation. It cannot be undone — if you just want it out of the way, move it to a _Done_ status instead.',
        },
      ],
    },
    {
      id: 'comments',
      label: 'Comments',
      heading: 'Comments',
      blocks: [
        {
          t: 'p',
          text: "Projects, stories and tasks each have their own comment thread, on the item's detail page. Comments support **markdown**, so you can use lists, links, emphasis and code formatting.",
        },
        {
          t: 'p',
          text: "Write in the box, then **Post**. Contributors can comment as well as Managers — commenting is deliberately not a privileged action, since it's how most discussion happens.",
        },
      ],
    },
    {
      id: 'history',
      label: 'Status history & time',
      heading: 'Status history & time',
      blocks: [
        {
          t: 'p',
          text: 'Every status change on a project, story or task is appended to a permanent record. Nothing overwrites or removes an earlier entry, so the history is a genuine audit trail rather than a summary that can drift.',
        },
        {
          t: 'p',
          text: 'The **Status History** panel on a story or task page shows, for each change:',
        },
        {
          t: 'ul',
          items: [
            'the status it moved from and to,',
            'who made the change,',
            'and how long the item sat in the previous status — the **Time in status** figure.',
          ],
        },
        {
          t: 'p',
          text: 'Because the trail is complete, elapsed time is calculated rather than estimated. That makes it useful for spotting where work actually stalls: a task that spent eight days _In review_ shows up plainly, even if it was finished quickly once someone looked at it.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Aggregate reporting',
          text: 'Roll-ups across a whole project or a whole person — total time per status, per project or per user — are available through the CLI and the API rather than the web UI. See [For power users](#power).',
        },
      ],
    },
    {
      id: 'sprints',
      label: 'Sprints',
      heading: 'Sprints',
      blocks: [
        {
          t: 'p',
          text: 'A sprint is a named, time-boxed block of work with a start and end date. The **Sprints** tab shows each sprint alongside an **Unassigned tasks** column.',
        },
        { t: 'h3', text: 'Creating and editing' },
        {
          t: 'p',
          text: "Use **New sprint** and give it a name, a start date and an end date. **Capacity** is optional. Name, dates and capacity can all be edited afterwards from the sprint's menu, and each edit confirms with a toast.",
        },
        { t: 'h3', text: 'Assigning tasks' },
        { t: 'p', text: 'Two ways, whichever suits:' },
        {
          t: 'ul',
          items: [
            '**Drag** a task card onto a sprint column. The drop target highlights as you hover it.',
            'Use the **Assign to sprint** menu on the card, which also offers **No sprint** to pull a task back out.',
          ],
        },
        { t: 'h3', text: 'Capacity and effort' },
        {
          t: 'p',
          text: "When a project has effort tracking enabled, each card shows its effort and the sprint header shows **used / capacity**. If the assigned effort exceeds the capacity you set, the sprint is flagged **Over capacity** — a signal to move something out, not a hard block. Sprints with no capacity set simply don't show the comparison.",
        },
        {
          t: 'p',
          text: 'Effort tracking is off by default and is switched on per project — see [Settings](#settings).',
        },
      ],
    },
    {
      id: 'timeline',
      label: 'Timeline',
      heading: 'Timeline',
      blocks: [
        {
          t: 'p',
          text: "The **Timeline** tab lays tasks out as horizontal bars against a calendar, grouped by sprint, with tasks that aren't in any sprint shown last. Select a bar to see that task's details.",
        },
        { t: 'h3', text: "Where a bar's dates come from" },
        {
          t: 'p',
          text: "A task doesn't need a date field filled in to appear. The timeline works out the best available span, in this order:",
        },
        {
          t: 'table',
          head: ['Labelled', 'Used when', 'Bar spans'],
          rows: [
            [
              '**Deadline**',
              'The task has a due date',
              'From its first status change (or its creation date, if it has never changed status) to the due date',
            ],
            [
              '**Sprint**',
              'No due date, but the task is in a sprint',
              "The sprint's start and end dates",
            ],
            [
              '**Status history**',
              'Neither of the above',
              "The task's first status change to its most recent one",
            ],
          ],
        },
        {
          t: 'p',
          text: 'Each bar is labelled with which of the three it used, so you can tell a real deadline from an inferred span at a glance.',
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Large projects',
          text: "The timeline draws at most **500 tasks**. Past that you'll see a warning that only the first 500 are shown — the other views have no such limit.",
        },
      ],
    },
    {
      id: 'capture',
      label: 'Quick capture',
      heading: 'Quick capture',
      blocks: [
        {
          t: 'p',
          text: 'Quick capture turns a sentence into structured tasks. Type something like _“ask Anna to review the checkout flow by Friday, and someone needs to update the pricing page”_ and it proposes tasks with titles, due dates, assignees, stories and priorities already filled in.',
        },
        { t: 'p', text: 'Open it from **New → Quick capture** in a project header.' },
        { t: 'h3', text: 'How it works' },
        {
          t: 'ol',
          items: [
            'Describe the work in your own words — one task or several.',
            'Choose **Preview tasks**. Nothing is created yet.',
            'Review the proposed tasks. Every field is editable, and each task has a tick box.',
            "Confirm. Only ticked tasks are created, and they're created together — all of them or none.",
          ],
        },
        {
          t: 'callout',
          kind: 'tip',
          label: 'Nothing is created without you',
          text: 'The preview step never writes anything. Creation happens only when you confirm, so you can preview as often as you like while you get the wording right.',
        },
        { t: 'h3', text: 'Low confidence' },
        {
          t: 'p',
          text: "When the extraction isn't sure about a task, it's marked **Low confidence** and **starts unticked**. It isn't hidden or thrown away — you decide whether it's real. Well-understood tasks start ticked, so the common case is: preview, glance, confirm.",
        },
        {
          t: 'p',
          text: 'Two things are checked before you can confirm: at least one task must be ticked, and every ticked task needs a title.',
        },
        { t: 'h3', text: 'Where the task goes' },
        {
          t: 'p',
          text: "If your text names a story the extraction recognises, the task is proposed against it. Otherwise the Story field reads **Backlog (no story)** — you can change it on any row before confirming.",
        },
        { t: 'h3', text: 'Privacy' },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Your text leaves the app',
          text: 'When you preview, the text you typed is sent to the configured AI provider, along with the **display names** of the project\'s members and the **names** of its stories — that\'s what lets it resolve “assign it to Anna” or match a story you mentioned. Email addresses and internal IDs are never sent. Check your provider\'s terms before pointing this at confidential material, particularly on a free tier.',
        },
        { t: 'h3', text: "If it's unavailable" },
        {
          t: 'p',
          text: 'Quick capture is optional and depends on an AI provider being configured. The message tells you which case you are in: that the server has no provider configured, that your own key was rejected, that you have hit your rate limit, or that the provider is temporarily unreachable. Every other way of creating tasks still works. You can supply your own provider key under **Settings → AI Providers**.',
        },
      ],
    },
    {
      id: 'members',
      label: 'Members & roles',
      heading: 'Members & roles',
      blocks: [
        { t: 'h3', text: 'The two roles' },
        {
          t: 'table',
          head: ['Role', 'Can do'],
          rows: [
            [
              '**Manager**',
              'Everything a Contributor can, plus create, delete and archive items, invite and remove members, choose the role an invitation offers, and edit project settings',
            ],
            ['**Contributor**', 'View the project, update statuses, and add comments'],
          ],
        },
        { t: 'p', text: 'Two rules decide what you can do in a given project:' },
        {
          t: 'ul',
          items: [
            '**A per-project role beats your global role.** Someone who is a Contributor generally can be a Manager on one particular project, and vice versa.',
            '**The project owner always has Manager access**, regardless of anything else.',
          ],
        },
        {
          t: 'p',
          text: "The interface follows your role: actions you don't have permission for aren't shown, so a Contributor sees a simpler project header rather than buttons that fail.",
        },
        { t: 'h3', text: 'Inviting people' },
        {
          t: 'p',
          text: 'Use **Invite** in the project header or the **Members** tab. Enter an email address and pick the role to offer. The invitation is emailed to them.',
        },
        { t: 'h3', text: 'Receiving an invitation' },
        {
          t: 'p',
          text: 'Invitations appear on your **Invitations** page, with who invited you, the role offered, and when it expires. **Accept** adds you to the project; **Decline** dismisses it. Pending invitations show as a count next to Invitations in the sidebar.',
        },
        { t: 'h3', text: 'Removing someone' },
        {
          t: 'p',
          text: 'The Members tab lists everyone with access. Managers can remove a member from there. Removing someone takes away their access; the work they did stays.',
        },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      heading: 'Settings',
      blocks: [
        {
          t: 'p',
          text: 'Settings is split into two scopes: **App Settings** (about you, everywhere) and **Project Settings** (about one project).',
        },
        { t: 'h3', text: 'App Settings' },
        { t: 'h4', text: 'Profile' },
        { t: 'p', text: 'Shows your name, email and global role. Below it, **Appearance**:' },
        {
          t: 'ul',
          items: [
            '**Theme** — Light, Dark, or System (follows your operating system).',
            '**Accent colour** — indigo, violet, emerald, rose, amber or stone. It recolours buttons, highlights and the active state throughout the app — including this manual.',
            '**Language** — English (en-GB) or Polish (pl). The change applies immediately.',
          ],
        },
        { t: 'h4', text: 'API Keys' },
        {
          t: 'p',
          text: 'Scoped keys for scripts, integrations and AI agents. Covered under [For power users](#power).',
        },
        { t: 'h4', text: 'AI Providers' },
        {
          t: 'p',
          text: 'Connect your own LLM provider key to power [Quick capture](#capture), instead of relying on a shared server key. Each provider shows as **Not configured** or **Configured** with the last few characters of the key so you can tell which one is saved. You can also set:',
        },
        {
          t: 'ul',
          items: [
            'a **model override**, if you want a specific model rather than the default;',
            "**requests per minute** and **tokens per minute** limits, shown with the maximum you're allowed — your own limits can go below that ceiling but not above it;",
            '**use as default provider**, when more than one is configured.',
          ],
        },
        {
          t: 'p',
          text: '**Clear** removes a saved key, after a confirmation; the provider goes back to showing as not configured.',
        },
        { t: 'h4', text: 'Security' },
        { t: 'p', text: 'Change your password — see [Getting started](#getting-started).' },
        { t: 'h3', text: 'Project Settings' },
        {
          t: 'p',
          text: 'Pick a project from the dropdown, then configure it. These controls are Manager-only.',
        },
        { t: 'h4', text: 'Statuses' },
        { t: 'p', text: 'Each project owns its workflow. New projects start with four statuses:' },
        {
          t: 'table',
          head: ['Status', 'Slug'],
          rows: [
            ['To Do', '`to_do`'],
            ['In Progress', '`in_progress`'],
            ['In Review', '`in_review`'],
            ['Done', '`done`'],
          ],
        },
        {
          t: 'p',
          text: 'You can **add** statuses, **rename** them, change their **colour**, and **reorder** them with move up / move down. The order you set is the order of the columns on the board. Each status has a slug, which is the stable identifier used by the API and CLI.',
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Deleting a status',
          text: 'Items already sitting in a deleted status don\'t vanish — they become **unlisted**, and are shown in an “Unlisted statuses” group so you can move them somewhere valid. Move work out of a status before deleting it and you\'ll avoid the tidy-up.',
        },
        { t: 'h4', text: 'Effort tracking' },
        {
          t: 'p',
          text: 'Off by default. Tick **Enable effort tracking** and choose a unit — `sp` for story points, `h` for hours, or anything else up to 20 characters — then Save. Once it\'s on, tasks gain an **Effort** field and sprints can compare assigned effort against capacity.',
        },
        { t: 'h4', text: 'Project tabs' },
        {
          t: 'p',
          text: "The project's own **Settings** tab controls its tab strip: drag tabs to reorder them, or toggle a tab between **Visible** and **Hidden**. A project that never uses sprints can hide Sprints and Timeline and keep the header uncluttered. Settings itself always stays visible and last.",
        },
      ],
    },
    {
      id: 'power',
      label: 'For power users',
      heading: 'For power users',
      blocks: [
        {
          t: 'p',
          text: 'Everything in the web UI is built on a REST API, and that API is available to you directly — from the command line, from scripts, or from an AI assistant.',
        },
        { t: 'h3', text: 'Installing the tools' },
        {
          t: 'p',
          text: "Both `spt` and `spt-mcp` ship with the backend — they're two entry points on the same Python package, so one install gives you both. You'll need Python 3.11 or newer and [uv](https://docs.astral.sh/uv/).",
        },
        { t: 'pre', code: 'cd backend\nuv sync\nuv pip install -e .' },
        {
          t: 'p',
          text: "That installs both commands into the backend's virtual environment, which isn't on your PATH. The simplest way to run them is to prefix with `uv run`:",
        },
        { t: 'pre', code: 'uv run spt auth login' },
        {
          t: 'p',
          text: "For a bare `spt` you can type anywhere, either activate the environment for your shell session with `source .venv/bin/activate`, or install the package as a standalone tool with `uv tool install --editable .`. The examples below assume `spt` resolves on its own — add `uv run` in front if it doesn't.",
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Pointing the CLI at another server',
          text: 'The CLI talks to `http://localhost:8000` unless told otherwise. Log in to a different one with `--api-url`, which is remembered for later commands — sensibly, since your tokens are only valid on the server that issued them. For a one-off, or in a script, set `SPT_API_URL` instead — the same variable the MCP server reads, so a single export points both at the same place. It wins over the saved setting but is never written to disk. Settings and tokens live in `~/.config/spt/config.json`. Note that `spt config set` is a different thing: it changes your account preferences on the server, not the CLI\'s own connection.',
        },
        { t: 'pre', code: 'spt auth login --api-url https://spt.example.com' },
        { t: 'h3', text: 'API keys' },
        { t: 'path', text: 'Settings → App Settings → API Keys' },
        {
          t: 'p',
          text: 'An API key lets a script or agent act on your projects without you handing over your password. Give the key a **label** so you can recognise it later, and tick exactly the **scopes** it needs:',
        },
        {
          t: 'table',
          head: ['Scope', 'Grants'],
          rows: [
            ['`read:projects` / `write:projects`', 'View / modify projects'],
            ['`read:stories` / `write:stories`', 'View / modify stories'],
            ['`read:tasks` / `write:tasks`', 'View / modify tasks'],
            ['`read:comments` / `write:comments`', 'View / post comments'],
          ],
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Copy the key immediately',
          text: "The key is shown once, when it's created, and never again. Copy it into your password manager or config before closing the dialog. If you lose it, revoke it and create another.",
        },
        {
          t: 'p',
          text: "Keys **expire**. A new key lasts 90 days unless you choose otherwise, and the list shows each key's expiry alongside its label, scopes and when it was last used — **Never** if it hasn't been. **Revoke** disables a key immediately. A key that's been used more recently than you expected is worth revoking on the spot.",
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Scopes are the boundary',
          text: "What a key can do is decided entirely by its scopes, not by what's connecting with it. A genuinely read-only agent is one whose key was created with only `read:` scopes — nothing else enforces it.",
        },
        { t: 'h3', text: 'The command line' },
        {
          t: 'p',
          text: 'The `spt` CLI mirrors the web UI. Log in once, then work from the terminal:',
        },
        {
          t: 'pre',
          code: 'spt auth login\n\nspt projects list\nspt stories list <project_id>\nspt tasks list <story_id>\nspt comments add task:<id> "Looks good to me"\nspt invitations list',
        },
        {
          t: 'p',
          text: 'Note the shapes: `tasks list` takes a **story** id, since tasks live under stories — use the project\'s Backlog story for project-level tasks. Comment commands take an item reference rather than a bare id: `project:<id>`, `story:<id>` or `task:<id>`. Add `--all` to a list command to page through everything instead of the first 25.',
        },
        {
          t: 'p',
          text: 'Quick capture works from the terminal too. It prints the extracted tasks and waits for your confirmation, exactly like the web UI; pass `--yes` to skip the prompt in a script. Pass `--file` (or `-` to read standard input) rather than typing the text as an argument, and it stays out of your shell history:',
        },
        {
          t: 'pre',
          code: 'spt tasks capture <project_id> --file notes.txt\necho "ask Anna to review the checkout flow by Friday" | spt tasks capture <project_id> -',
        },
        { t: 'p', text: 'Time reporting is CLI-only — this is where the aggregate numbers live:' },
        {
          t: 'pre',
          code: 'spt time-metrics    # time in each status for an item\nspt time-history    # the raw status-change trail\nspt time-report     # aggregate totals per project or per user',
        },
        {
          t: 'p',
          text: 'Manage your own AI provider credential without leaving the shell. The `set` command prompts for the key with hidden input, so it never lands in your shell history:',
        },
        {
          t: 'pre',
          code: 'spt config llm list\nspt config llm providers\nspt config llm set google\nspt config llm delete google',
        },
        {
          t: 'p',
          text: 'Most commands work from a saved login. `spt tasks capture` additionally accepts `--api-key` or the `SPT_API_KEY` environment variable, so it can run unattended; other commands still need `spt auth login`.',
        },
        { t: 'h3', text: 'AI assistants (MCP)' },
        {
          t: 'p',
          text: 'The `spt-mcp` server exposes the tool to an LLM host such as Claude Code or Claude Desktop, so an assistant can browse and edit your projects directly. It comes from the same install as the CLI — see Installing the tools above.',
        },
        { t: 'p', text: 'Create a scoped key, then register the server:' },
        {
          t: 'pre',
          code: 'spt config api-keys create --label "claude-code" \\\n  --scopes read:projects,read:stories,read:tasks,read:comments,write:tasks,write:comments\n\nclaude mcp add spt -e SPT_API_KEY=<key> -e SPT_API_URL=http://localhost:8000 -- spt-mcp',
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'The host has to be able to find spt-mcp',
          text: 'That last `spt-mcp` is a command your LLM host runs itself, so it has to resolve on _its_ PATH — not just in a shell where you\'ve activated the virtual environment. If the host reports that the server failed to start, give it the full path instead, for example `/path/to/simple-project-tool/backend/.venv/bin/spt-mcp`, or install the package with `uv tool install --editable .` so the command is available everywhere.',
        },
        {
          t: 'p',
          text: 'The assistant can then look things up (`list_projects`, `get_task`, `search`, `list_comments`), make changes (`update_task`, `create_task`, `create_story`, `add_comment`), and run quick capture (`capture_tasks`, `confirm_capture`).',
        },
        {
          t: 'callout',
          kind: 'note',
          label: "What an assistant can't do",
          text: "There are deliberately **no delete tools and no member-management tools**. An assistant can't destroy your work or change who has access to a project, whatever it's asked. Beyond that, the scopes on the key you issued are the real limit — issue a read-only key if you only want it to look.",
        },
        { t: 'h3', text: 'The REST API' },
        {
          t: 'p',
          text: 'Interactive API documentation is served by the backend itself at `/docs` (Swagger UI) and `/redoc`. A few conventions worth knowing:',
        },
        {
          t: 'ul',
          items: [
            'All endpoints live under `/api/v1/`.',
            'Updates use `PATCH` with only the fields you\'re changing.',
            'Lists are paginated with a cursor: `?cursor=<id>&limit=25`.',
            'Errors come back as `{"error": {"code": ..., "message": ...}}`.',
          ],
        },
      ],
    },
  ],
}
