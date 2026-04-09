# simple-project-tool

A minimalist project management application for teams. Organize work across multiple projects with a simple three-level hierarchy: Projects → Stories → Tasks.

## Features

### Core Functionality
- **Multi-project support**: Create and manage multiple projects
- **Work hierarchy**: Projects contain stories, stories contain tasks
- **Status tracking**: Track work through states (to_do, in_progress, in_review, in_testing, done)
- **Priority levels**: Assign low, medium, or high priority to any item
- **Comments**: Add comments and collaborate on projects, stories, and tasks
- **Time tracking**: Automatic tracking of time spent in each status via status history

### User Management
- **Two user roles**: Manager/Contributor and Contributor with different permissions
- **Project members**: Invite team members to projects
- **AI agent support**: Use API keys to integrate AI agents as project members
- **Permission control**: Granular control over who can create, edit, and delete items

### Access Methods
- **Web UI**: Clean, minimalist interface for browser access
- **REST API**: Full API for programmatic access with OpenAPI documentation
- **CLI tool**: Command-line interface for terminal-based workflows

## Tech Stack

**Backend**: Python + FastAPI, PostgreSQL, SQLAlchemy
**Frontend**: React + TypeScript, Tailwind CSS
**CLI**: Typer (Python)
**Auth**: JWT + bcrypt

## Getting Started

See [docs/readme_cli.md](readme_cli.md) for CLI setup and commands.

For complete technical specifications, see [requirements.md](../requirements.md).

## Project Status

🚧 **In Development** - Core architecture defined, implementation in progress.

## Documentation

- [requirements.md](../requirements.md) - Complete feature specification and technical design
- [CLAUDE.md](../CLAUDE.md) - Development guide for Claude Code
- [docs/readme_cli.md](readme_cli.md) - CLI tool documentation
- [docs/changelog.md](changelog.md) - Change history
