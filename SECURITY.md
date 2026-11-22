# Security Policy

Hierophant processes content from repositories nobody has vetted, so we take reports seriously.

## Reporting a vulnerability

Please report privately to the address in [`/.well-known/security.txt`](/.well-known/security.txt) on the live site. Do not open a public issue.

Include:

- What you found and where.
- Steps to reproduce it.
- The impact you believe it has.

Do not include real secrets or personal data in your report.

## In scope

- The Hierophant website and its API.
- The scanner engine, including ways to make it execute, fetch, or render repository content.
- The GitHub Action in `packages/action`.
- The CLI, MCP server, and settings lock in `packages/cli`.
- Cross-site scripting through file names, paths, or excerpts.
- Workflow command injection through file names.
- Prompt injection or terminal escapes through MCP or CLI output.
- Any way for `hierophant lock` to weaken a setting or lose a user's file.
- Exposure of tokens, connection strings, or stored data.

## Out of scope

- A malicious pattern the rules do not detect. Static rules can be evaded, as the documentation says. Rule improvements are still welcome.
- A false positive. Use **Report a false positive** on the report page.
- Denial of service through high traffic volume.
- Reports from automated tools with no demonstrated impact.

## Testing rules

- Test only with repositories and accounts you own.
- Do not access, change, or delete other people's data.
- Do not degrade the service for others.

## Vulnerabilities in other projects

If a Hierophant report reveals a real problem in someone else's repository, tell its maintainers privately and do not publish the details.
