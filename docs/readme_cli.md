# CLI Tool Documentation

Command-line interface for simple-project-tool. Use `spt` to manage projects, stories, tasks, and collaborate with your team from the terminal.

## Installation

```bash
# From backend directory
cd backend
uv pip install -e .
```

## Basic Usage

```bash
spt --help              # Show help
spt <command> --help    # Show command-specific help
```

## Commands

### Authentication

```bash
spt auth login              # Log in to the system
spt auth logout             # Log out
spt auth whoami             # Show current user
spt auth password-reset     # Request password reset
```

### Projects

```bash
spt projects list           # List all accessible projects
spt projects create         # Create new project (interactive)
spt projects create --name "Project Name" --description "Description"
spt projects view <id>      # View project details
spt projects update <id>    # Update project (interactive)
spt projects delete <id>    # Delete a project
spt projects archive <id>   # Archive a project
spt projects members <id>   # List project members
spt projects invite <id>    # Invite user to project
```

### Stories

Stories are features or epics within a project.

```bash
spt stories list <project>                   # List stories in a project
spt stories create <project>                 # Create new story
spt stories create <project> --name "Story"  # Create with name
spt stories view <id>                        # View story details
spt stories update <id>                      # Update story
spt stories delete <id>                      # Delete story
spt stories status <id> <status>             # Change status
spt stories priority <id> <level>            # Change priority
```

**Status values**: `to_do`, `in_progress`, `in_review`, `in_testing`, `done`
**Priority values**: `low`, `medium`, `high`

### Tasks

Individual work items within a story.

```bash
spt tasks list <story>                 # List tasks in a story
spt tasks create <story>               # Create new task
spt tasks create <story> --name "Task" # Create with name
spt tasks view <id>                    # View task details
spt tasks update <id>                  # Update task
spt tasks delete <id>                  # Delete task
spt tasks assign <id> <user>           # Assign task to user
spt tasks unassign <id>                # Unassign task
spt tasks status <id> <status>         # Change status
spt tasks priority <id> <level>        # Change priority
```

### Comments

Add and manage comments on projects, stories, or tasks.

```bash
spt comments add <item> <text>         # Add comment to item
spt comments list <item>               # List comments on item
spt comments delete <comment_id>       # Delete comment
```

### Time Tracking

View time spent in each status.

```bash
spt time-metrics <item>                # Get time metrics for item
spt time-history <item>                # Get full status change history
spt time-report <project>              # Get project-level time report
```

### Configuration

Manage API keys and user settings.

```bash
spt config set <key> <value>           # Set configuration value
spt config get <key>                   # Get configuration value
spt config api-keys list               # List API keys
spt config api-keys create --label "My Key"  # Create API key
spt config api-keys revoke <key_id>    # Revoke API key
```

## Examples

### Create a complete workflow

```bash
# Log in
spt auth login

# Create a project
PROJECT_ID=$(spt projects create --name "Website Redesign" --description "Q2 2026 redesign")

# Create a story
STORY_ID=$(spt stories create $PROJECT_ID --name "Homepage redesign")

# Create tasks within the story
TASK1=$(spt tasks create $STORY_ID --name "Design mockups")
TASK2=$(spt tasks create $STORY_ID --name "Implement header")
TASK3=$(spt tasks create $STORY_ID --name "Implement footer")

# Assign tasks
spt tasks assign $TASK1 john@example.com
spt tasks assign $TASK2 jane@example.com

# Update task status as work progresses
spt tasks status $TASK1 in_progress
spt tasks status $TASK1 done

# View time spent on task
spt time-metrics $TASK1
```

### Invite a team member

```bash
# Add team member to project
spt projects invite PROJECT_ID alice@example.com

# They can now see and work on the project
spt projects list  # (as alice)
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Authentication required
- `3` - Permission denied
- `4` - Resource not found
- `5` - Validation error

## Tips

- Use `--json` flag to output results in JSON format
- Use `--help` on any command for detailed options
- Commands are interactive by default; use flags to skip prompts
- Your authentication token is stored securely and expires after 7 days
