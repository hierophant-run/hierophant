# Hierophant CLI

Checks a local folder for agent hooks, rules, MCP configs, and auto-run tasks. It reads files as text and never runs them. It makes no network requests unless you add `--online`.

**Status: prepared, not published.** It is not on npm yet. Run it from this repository:

```bash
pnpm build
node packages/cli/dist/cli.cjs --help
```

## Scan a folder

```bash
hierophant scan ./some-repo
hierophant scan . --fail-on medium
hierophant scan . --format json
hierophant scan . --online
```

| Exit code | Meaning                                   |
| --------- | ----------------------------------------- |
| `0`       | Finished, and nothing reached `--fail-on` |
| `1`       | Findings reached `--fail-on`              |
| `2`       | Invalid usage                             |

The default `--fail-on` level is `high`. Output never includes file content, so it is suitable for CI logs.

`--online` looks up packages that agent files would run in OSV, npm, and PyPI. Only package names and versions are sent. A package listed as malicious counts as critical. A missing package, a known vulnerability, or a package created in the last 30 days counts as medium.

## Lock agent settings

```bash
hierophant lock                      # Preview only
hierophant lock --apply              # Back up, then write
hierophant lock --undo               # Restore the latest backup
hierophant lock --agent vscode       # Limit to one agent
```

`lock` changes only user-level settings that are confirmed in each vendor's official documentation.

| Agent           | Setting                                    | Value              |
| --------------- | ------------------------------------------ | ------------------ |
| Claude Code     | `permissions.disableBypassPermissionsMode` | `"disable"`        |
| Claude Code     | `enableAllProjectMcpServers`               | `false`            |
| VS Code         | `security.workspace.trust.enabled`         | `true`             |
| VS Code         | `task.allowAutomaticTasks`                 | `"off"`            |
| VS Code         | `chat.tools.global.autoApprove`            | `false`            |
| Antigravity CLI | `agentMode`                                | `"default"`        |
| Antigravity CLI | `toolPermission`                           | `"request-review"` |
| Gemini CLI      | `security.folderTrust.enabled`             | `true`             |
| Gemini CLI      | `security.disableYoloMode`                 | `true`             |

- **Cursor is not changed**, because its settings could not be confirmed in official documentation.
- Antigravity CLI and Gemini CLI are skipped on Windows, because their settings path there is not documented.
- A tool that is not installed is skipped. Its config is never created.
- A stricter value is never weakened. For example, `toolPermission: "strict"` stays.
- Invalid files and symbolic links are left alone.
- Backups are private and stored in `~/.hierophant/backups`. They can contain anything your settings contain.
- `--undo` will not overwrite a file you edited after locking.

Locked settings reduce risk, but they are not a guarantee. For example, once you trust a folder, Gemini CLI lets its workspace settings override your user settings.

## MCP server

```bash
claude mcp add hierophant -- node /absolute/path/to/packages/cli/dist/cli.cjs mcp --root /absolute/path/to/projects
```

| Tool           | Description                              |
| -------------- | ---------------------------------------- |
| `scan_folder`  | Checks a folder inside an allowed root   |
| `explain_rule` | Explains a rule and how to fix a finding |

- Both tools are read-only. Locking settings is deliberately not available to agents.
- The server can only read inside `--root`, which defaults to the current folder.
- It never returns file content. A file name that could read as an instruction is replaced with a placeholder.
- A short file name can still contain words, so treat returned paths as data.
