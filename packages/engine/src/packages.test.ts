import { describe, expect, it } from "vitest";
import { findPackages, parsePackageSpec } from "./index.js";

const mcp = (command: string, args: string[]) =>
  JSON.stringify({ mcpServers: { demo: { command, args } } }, null, 2);

describe("parsePackageSpec", () => {
  it.each([
    ["pkg", "pkg", null],
    ["pkg@1.2.3", "pkg", "1.2.3"],
    ["pkg@latest", "pkg", "latest"],
    ["@scope/pkg", "@scope/pkg", null],
    ["@scope/pkg@1.2.3", "@scope/pkg", "1.2.3"],
    ["pkg@^1.0.0", "pkg", "^1.0.0"],
  ])("reads the npm spec %s", (spec, name, requested) => {
    expect(parsePackageSpec("npm", spec)).toEqual({ name, requested });
  });

  it.each([
    ["mcp-server", "mcp-server", null],
    ["Mcp_Server.Git", "mcp-server-git", null],
    ["pkg==1.2.3", "pkg", "1.2.3"],
    ["pkg@1.2.3", "pkg", "1.2.3"],
    ["pkg[extra]==1.2.3", "pkg", "1.2.3"],
    ["pkg>=1.0", "pkg", ">=1.0"],
  ])("reads the Python spec %s", (spec, name, requested) => {
    expect(parsePackageSpec("PyPI", spec)).toEqual({ name, requested });
  });

  it.each([
    "./local",
    "../up",
    "/abs/path",
    "file:./x",
    "https://evil.example/p.tgz",
    "git+https://github.com/a/b",
    "github:a/b",
    "npm:alias@1.0.0",
    "$PKG",
    "${PKG}",
    "`id`",
    "a b",
    "../../etc/passwd",
    "",
    "x".repeat(300),
  ])("ignores %s", (spec) => {
    expect(parsePackageSpec("npm", spec)).toBeNull();
    expect(parsePackageSpec("PyPI", spec)).toBeNull();
  });
});

describe("findPackages", () => {
  it("finds an MCP package with its file and line", () => {
    const content = mcp("npx", ["-y", "@scope/server@1.2.3", "--flag"]);
    expect(findPackages([{ path: ".mcp.json", content }])).toEqual([
      {
        ecosystem: "npm",
        name: "@scope/server",
        requested: "1.2.3",
        path: ".mcp.json",
        line: 4,
      },
    ]);
  });

  it.each([
    ["uvx", ["mcp-server-git"], "PyPI", "mcp-server-git"],
    ["pipx", ["run", "black==24.1.0"], "PyPI", "black"],
    ["bunx", ["some-tool"], "npm", "some-tool"],
    ["pnpm", ["dlx", "some-tool"], "npm", "some-tool"],
    ["cmd", ["/c", "npx", "-y", "win-tool"], "npm", "win-tool"],
  ])("reads %s %j", (command, args, ecosystem, name) => {
    const [found] = findPackages([{ path: ".mcp.json", content: mcp(command, args) }]);
    expect(found).toMatchObject({ ecosystem, name });
  });

  it("finds packages inside hook commands", () => {
    const content = JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "echo hi && npx -y hook-tool@1.0.0; uvx other" }] },
        ],
      },
    });
    const names = findPackages([{ path: ".claude/settings.json", content }]).map((p) => p.name);
    expect(names).toEqual(["other", "hook-tool"]);
  });

  it("finds packages in tasks and dev containers", () => {
    const files = [
      {
        path: ".vscode/tasks.json",
        content: JSON.stringify({ tasks: [{ label: "x", command: "npx", args: ["task-tool"] }] }),
      },
      {
        path: ".devcontainer/devcontainer.json",
        content: JSON.stringify({ postCreateCommand: "npx container-tool" }),
      },
    ];
    expect(findPackages(files).map((p) => p.name)).toEqual(["container-tool", "task-tool"]);
  });

  it("ignores local commands, URLs, and plain text", () => {
    const files = [
      { path: ".mcp.json", content: mcp("node", ["./server.js"]) },
      { path: ".cursor/mcp.json", content: mcp("npx", ["./local-tool"]) },
      { path: "CLAUDE.md", content: "Run npx dangerous-example in the docs.\n" },
    ];
    expect(findPackages(files)).toEqual([]);
  });

  it("does not throw on invalid configuration", () => {
    expect(findPackages([{ path: ".mcp.json", content: "{not json" }])).toEqual([]);
  });
});
