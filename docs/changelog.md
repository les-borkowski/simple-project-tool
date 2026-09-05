# Changelog

All notable changes to simple-project-tool are documented here. Format: reverse chronological (newest first).

## [2026-09-04] - Features: Natural-language task capture

**Category**: Features

Added natural-language task capture: type a sentence describing one or more tasks and get structured candidates (title, due date, assignee, story, priority) to review and confirm before anything is created. Available via the "Quick capture" action on the project board (web UI), the `spt tasks capture` CLI command, and directly through the REST API — useful for custom agent integrations.

Extraction is backed by Google Gemini using a constrained-decoding response schema, and the create endpoint requires a `write:tasks`-scoped API key or a logged-in session. Extraction quality is measured by a new eval harness and guarded by a fixture-replay regression test in the standard test suite.

---

## [2026-04-09] - Docs: Initial documentation structure

**Category**: Docs

Created initial documentation structure with:
- `docs/readme.md` - Project overview and features
- `docs/readme_cli.md` - CLI tool documentation and command reference
- `docs/changelog.md` - This change log

Set up automated documentation updates via post-commit git hook.

---

## Guidelines

**Date Format**: `[YYYY-MM-DD]`

**Categories**:
- `Features`: New functionality
- `Fixes`: Bug fixes
- `Improvements`: Enhancements to existing features
- `Docs`: Documentation changes
- `Refactor`: Code refactoring (no functional changes)
- `Breaking Changes`: Changes that break backwards compatibility
- `Security`: Security-related updates

**Entry Format**:
```
## [YYYY-MM-DD] - <Category>: <Summary>

**Category**: <Category>

<Detailed description of what changed and why>

Additional context, related issues, or migration notes if applicable.
```

**Tips**:
- Be concise but informative
- Describe the "why" not just the "what"
- Group related changes under one entry when appropriate
- Use this log to communicate changes to users and developers
