# Hierophant Check

Checks agent hooks, rules, MCP configs, and auto-run tasks in a checkout. It reads files as text and never executes them. It makes no network requests and needs no token.

**Status: prepared, not published.** This action is not on GitHub Marketplace yet and has not been validated on a hosted runner.

## Usage

```yaml
name: Agent files
on: [pull_request]

permissions:
  contents: read

jobs:
  hierophant:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      # Replace COMMIT_SHA with a full commit SHA.
      - uses: hierophant-run/hierophant/packages/action@COMMIT_SHA
        with:
          fail-on: high
```

Use the `pull_request` trigger. Do not run this on `pull_request_target` with a checkout of the pull request head, because that gives untrusted code a privileged context.

## Inputs

| Input     | Default | Description                                                                          |
| --------- | ------- | ------------------------------------------------------------------------------------ |
| `path`    | `.`     | Folder to check, relative to the workspace.                                          |
| `fail-on` | `high`  | Lowest severity that fails the step: `critical`, `high`, `medium`, `low`, or `none`. |

## Outputs

| Output            | Description                                       |
| ----------------- | ------------------------------------------------- |
| `status`          | `dangerous`, `needs_review`, or `no_issues_found` |
| `findings`        | Number of findings                                |
| `ruleset-version` | Ruleset that produced this result                 |

## What it does not do

- It does not follow symbolic links or enter submodules.
- It does not print file content, so findings cannot leak values into job logs.
- A passing step is not a guarantee. It means the current ruleset found nothing at or above your `fail-on` level.

## Build

`pnpm --filter @hierophant/action build` writes `dist/index.cjs`, which must be committed with the action.
