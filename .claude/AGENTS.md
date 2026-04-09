# Claude Code Agents for simple-project-tool

This project uses specialized Claude Code agents for security auditing and documentation management.

## Security Auditor Agent

**Purpose**: Review code for security vulnerabilities, exploits, and best-practice violations.

**Location**: `.claude/agents/security-auditor.md`

### Usage

Run the security auditor manually whenever you want a security review:

```bash
claude --agent security-auditor
```

The agent will:
1. Review recent code changes
2. Check for vulnerabilities in:
   - Authentication and authorization
   - SQL injection, XSS, CSRF risks
   - Credential exposure
   - Unsafe dependencies
   - Input validation
   - Encryption and hashing
   - API security
   - Data privacy

3. Report findings by severity:
   - **Critical** - Must fix immediately
   - **High** - Fix before release
   - **Medium** - Consider fixing
   - **Low** - Best-practice recommendations

### Configuration

- **Model**: Inherits the session's model (Haiku by default, can override with `/fast` for Opus)
- **Trigger**: Manual (on-demand)
- **Scope**: Full repository access

## Documentation Keeper Agent

**Purpose**: Keep project documentation in sync with code changes.

**Location**: `.claude/agents/documentation-keeper.md`

### Maintained Files

1. **docs/readme.md**
   - Project overview and features
   - Quick start guide
   - Key capabilities
   - Links to detailed docs

2. **docs/readme_cli.md**
   - CLI tool installation and usage
   - Command reference organized by area
   - Examples and tips
   - Exit codes

3. **docs/changelog.md**
   - Reverse chronological change history
   - Entries with date, category, and summary
   - Categories: Features, Fixes, Improvements, Docs, Refactor, Breaking Changes, Security

### Usage

The agent runs **automatically after each commit** via the git post-commit hook:

```bash
.git/hooks/post-commit
```

You can also run it manually:

```bash
claude --agent documentation-keeper
```

### How It Works

After each commit:
1. The post-commit hook executes
2. It invokes `claude --agent documentation-keeper`
3. The agent:
   - Reads the latest commit(s)
   - Identifies what changed
   - Updates relevant documentation files
   - Adds a changelog entry if changes are meaningful

### Smart Updates

The agent skips documentation updates for:
- Chore-only commits
- Formatting changes
- Documentation-only commits
- Refactoring without functional changes

### Configuration

- **Model**: Inherits the session's model
- **Trigger**: Automatic (post-commit hook) + manual
- **Scope**: Full repository access, focus on `docs/` and recent commits
- **Hook**: `.git/hooks/post-commit`

## Git Hook Integration

### Post-Commit Hook

**File**: `.git/hooks/post-commit`

Automatically runs the documentation-keeper agent after every commit.

```bash
# Example: After you commit
git commit -m "Add time tracking feature"
# → post-commit hook runs
# → documentation-keeper agent updates docs/
# → docs/readme.md, docs/readme_cli.md, and docs/changelog.md updated
```

**Important Notes**:
- Hook runs with `--no-session-persistence` to avoid creating session transcripts
- Errors are silently ignored to prevent blocking commits
- Run manually if you want to see detailed output

## Setup & Configuration

### Agent Definitions

Agents are defined in `.claude/agents/`:
- `security-auditor.md` - Security review agent
- `documentation-keeper.md` - Documentation maintenance agent

Edit these files to customize agent behavior, focus areas, or instructions.

### Settings

Project-level settings: `.claude/settings.json`
- Documents the two agents
- Sets default permission mode to "plan"
- Can be extended with additional configuration

## Best Practices

### Security Auditor

1. **Run before releases**: Run a security audit before every production release
2. **Track findings**: Document findings in issues/tickets for visibility
3. **Review patterns**: Use findings to identify systemic patterns to fix
4. **Share results**: Share critical findings with the team immediately

### Documentation Keeper

1. **Meaningful commits**: Avoid noisy commits to keep the changelog clean
2. **Clear messages**: Write descriptive commit messages so the agent can understand changes
3. **Manual edits**: You can manually edit docs/ files; the agent will preserve your changes
4. **Review updates**: Review documentation updates to ensure accuracy

## Troubleshooting

### Security Auditor Not Running

```bash
# Ensure it can be invoked
claude --agent security-auditor --help

# Check agent definition exists
cat .claude/agents/security-auditor.md
```

### Documentation Keeper Not Triggering

1. **Verify hook exists and is executable**:
   ```bash
   ls -la .git/hooks/post-commit
   chmod +x .git/hooks/post-commit
   ```

2. **Test the hook manually**:
   ```bash
   .git/hooks/post-commit
   ```

3. **Check Claude CLI is available**:
   ```bash
   which claude
   claude --version
   ```

4. **Review recent commits**:
   ```bash
   git log --oneline -5
   ```

### Documentation Keeper Skipping Updates

The agent deliberately skips updates for:
- Formatting-only changes
- Commits marked as "chore:"
- Refactoring without feature changes

Add meaningful context to commit messages to ensure documentation updates are triggered.

## Customization

### Modify Security Auditor Focus

Edit `.claude/agents/security-auditor.md`:
- Change the list of security concerns to review
- Adjust severity levels
- Add project-specific security requirements

### Customize Documentation Files

Edit agent templates in `.claude/agents/documentation-keeper.md`:
- Change which files are maintained
- Adjust sections and structure
- Add new documentation files to the agent's responsibility

### Extend for Other Agents

Create new agents following the same pattern:
1. Create `.claude/agents/<agent-name>.md` with agent definition
2. Add to `.claude/settings.json` for discoverability
3. Set up hooks in git or code if you need automation

## See Also

- [CLAUDE.md](../CLAUDE.md) - Development guide
- [requirements.md](../requirements.md) - Technical specifications
- [docs/readme.md](../docs/readme.md) - Project overview
