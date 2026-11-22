import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "jsonc-parser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyLock, LOCK_AGENTS, planLock, undoLock, type LockEnv } from "./lock.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tests read nested settings.
type Settings = Record<string, any>;

let home: string;
let env: LockEnv;

const CLAUDE = () => join(home, ".claude/settings.json");
const VSCODE = () => join(home, ".config/Code/User/settings.json");
const GEMINI = () => join(home, ".gemini/settings.json");
const ANTIGRAVITY = () => join(home, ".gemini/antigravity-cli/settings.json");

const put = async (path: string, content: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};
const json = async (path: string) => JSON.parse(await readFile(path, "utf8")) as Settings;
const entry = async (id: string) => (await planLock(env)).find((item) => item.id === id)!;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "hierophant-lock-"));
  env = { home, platform: "linux" };
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("preview", () => {
  it("writes nothing", async () => {
    await put(CLAUDE(), '{"model":"x"}');
    const before = await readFile(CLAUDE(), "utf8");
    const plan = await planLock(env);
    expect(plan.find((item) => item.id === "claude-code")?.state).toBe("ready");
    expect(await readFile(CLAUDE(), "utf8")).toBe(before);
    expect(existsSync(join(home, ".hierophant"))).toBe(false);
  });

  it("does not create config for a tool that is not installed", async () => {
    const plan = await planLock(env);
    await applyLock(env, plan);
    expect(plan.filter((item) => item.state === "ready")).toHaveLength(0);
    expect(existsSync(join(home, ".claude"))).toBe(false);
    expect(existsSync(join(home, ".gemini"))).toBe(false);
  });

  it("never changes Cursor", async () => {
    await mkdir(join(home, ".cursor"));
    const cursor = await entry("cursor");
    expect(cursor.state).toBe("unsupported");
    expect(cursor.reason).toContain("could not be confirmed");
    expect(cursor.changes).toHaveLength(0);
  });

  it("uses the right path on each system", async () => {
    await put(join(home, "Library/Application Support/Code/User/settings.json"), "{}");
    const mac = await planLock({ home, platform: "darwin" }, ["vscode"]);
    expect(mac[0]?.state).toBe("ready");

    await put(join(home, "AppData/Code/User/settings.json"), "{}");
    const windows = await planLock({ home, platform: "win32", appData: join(home, "AppData") }, [
      "vscode",
      "gemini-cli",
      "antigravity-cli",
    ]);
    expect(windows.find((item) => item.id === "vscode")?.state).toBe("ready");
    expect(windows.find((item) => item.id === "gemini-cli")?.state).toBe("unsupported");
    expect(windows.find((item) => item.id === "antigravity-cli")?.state).toBe("unsupported");
  });

  it("limits the plan to the chosen agents", async () => {
    const plan = await planLock(env, ["vscode"]);
    expect(plan.map((item) => item.id)).toEqual(["vscode"]);
    expect(LOCK_AGENTS).toHaveLength(5);
  });
});

describe("apply", () => {
  it("sets the documented keys and keeps everything else", async () => {
    await put(
      CLAUDE(),
      JSON.stringify({ model: "x", env: { TOKEN: "private" }, permissions: { allow: ["Read"] } }),
    );
    await applyLock(env, await planLock(env, ["claude-code"]));
    const value = await json(CLAUDE());
    expect(value.permissions.disableBypassPermissionsMode).toBe("disable");
    expect(value.permissions.allow).toEqual(["Read"]);
    expect(value.enableAllProjectMcpServers).toBe(false);
    expect(value.env.TOKEN).toBe("private");
    expect(value.disableAllHooks).toBeUndefined();
  });

  it("turns off a risky existing value", async () => {
    await put(CLAUDE(), '{"enableAllProjectMcpServers": true}');
    await applyLock(env, await planLock(env, ["claude-code"]));
    expect((await json(CLAUDE())).enableAllProjectMcpServers).toBe(false);
  });

  it("keeps comments in VS Code settings", async () => {
    await put(VSCODE(), '{\n  // my font\n  "editor.fontSize": 14,\n}\n');
    await applyLock(env, await planLock(env, ["vscode"]));
    const text = await readFile(VSCODE(), "utf8");
    expect(text).toContain("// my font");
    const value = parse(text) as Record<string, unknown>;
    expect(value["editor.fontSize"]).toBe(14);
    expect(value["security.workspace.trust.enabled"]).toBe(true);
    expect(value["task.allowAutomaticTasks"]).toBe("off");
    expect(value["chat.tools.global.autoApprove"]).toBe(false);
  });

  it("writes nested Gemini keys", async () => {
    await put(GEMINI(), '{"security":{"auth":{"selectedType":"x"}}}');
    await applyLock(env, await planLock(env, ["gemini-cli"]));
    const value = await json(GEMINI());
    expect(value.security.folderTrust.enabled).toBe(true);
    expect(value.security.disableYoloMode).toBe(true);
    expect(value.security.auth.selectedType).toBe("x");
  });

  it("does not weaken a stricter value", async () => {
    await put(ANTIGRAVITY(), '{"toolPermission":"strict","agentMode":"auto"}');
    await applyLock(env, await planLock(env, ["antigravity-cli"]));
    const value = await json(ANTIGRAVITY());
    expect(value.toolPermission).toBe("strict");
    expect(value.agentMode).toBe("default");
  });

  it("creates a missing file only when the tool folder exists", async () => {
    await mkdir(dirname(CLAUDE()), { recursive: true });
    await applyLock(env, await planLock(env, ["claude-code"]));
    expect((await stat(CLAUDE())).mode & 0o777).toBe(0o600);
  });

  it("keeps the file mode", async () => {
    await put(CLAUDE(), "{}");
    await chmod(CLAUDE(), 0o640);
    await applyLock(env, await planLock(env, ["claude-code"]));
    expect((await stat(CLAUDE())).mode & 0o777).toBe(0o640);
  });

  it("is idempotent", async () => {
    await put(CLAUDE(), "{}");
    await applyLock(env, await planLock(env, ["claude-code"]));
    const second = await planLock(env, ["claude-code"]);
    expect(second[0]?.state).toBe("locked");
    expect(await applyLock(env, second)).toEqual([]);
  });

  it("stores backups privately", async () => {
    await put(CLAUDE(), '{"env":{"TOKEN":"private"}}');
    await applyLock(env, await planLock(env, ["claude-code"]));
    const root = join(home, ".hierophant/backups");
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    const [directory] = await readdir(root);
    expect((await stat(join(root, directory!, "0.backup"))).mode & 0o777).toBe(0o600);
  });

  it.each([
    ["broken JSON", '{"a":'],
    ["a comment in a strict file", '{ // no\n "a": 1 }'],
    ["an array", "[]"],
    ["a wrong parent type", '{"permissions": 5}'],
  ])("leaves a file with %s alone", async (_name, content) => {
    await put(CLAUDE(), content);
    const plan = await planLock(env, ["claude-code"]);
    expect(plan[0]?.state).toBe("blocked");
    await applyLock(env, plan);
    expect(await readFile(CLAUDE(), "utf8")).toBe(content);
  });

  it("does not write through a symbolic link", async () => {
    const real = join(home, "dotfiles.json");
    await writeFile(real, "{}");
    await mkdir(dirname(CLAUDE()), { recursive: true });
    await symlink(real, CLAUDE());
    const plan = await planLock(env, ["claude-code"]);
    expect(plan[0]?.state).toBe("blocked");
    await applyLock(env, plan);
    expect(await readFile(real, "utf8")).toBe("{}");
  });

  it("does not overwrite a file that changed after the preview", async () => {
    await put(CLAUDE(), "{}");
    const plan = await planLock(env, ["claude-code"]);
    await writeFile(CLAUDE(), '{"model":"changed"}');
    const results = await applyLock(env, plan);
    expect(results[0]?.ok).toBe(false);
    expect((await json(CLAUDE())).model).toBe("changed");
  });
});

describe("undo", () => {
  it("restores the exact original bytes", async () => {
    const original = '{\n    "model":   "x" }\n';
    await put(CLAUDE(), original);
    await applyLock(env, await planLock(env, ["claude-code"]));
    const results = await undoLock(env);
    expect(results?.every((result) => result.ok)).toBe(true);
    expect(await readFile(CLAUDE(), "utf8")).toBe(original);
  });

  it("removes a file that lock created", async () => {
    await mkdir(dirname(CLAUDE()), { recursive: true });
    await applyLock(env, await planLock(env, ["claude-code"]));
    await undoLock(env);
    expect(existsSync(CLAUDE())).toBe(false);
  });

  it("refuses to overwrite later edits and keeps the backup", async () => {
    await put(CLAUDE(), '{"model":"original"}');
    await applyLock(env, await planLock(env, ["claude-code"]));
    await writeFile(CLAUDE(), '{"model":"edited later"}');
    const results = await undoLock(env);
    expect(results?.[0]?.ok).toBe(false);
    expect(results?.[0]?.message).toContain("backup");
    expect((await json(CLAUDE())).model).toBe("edited later");
    expect((await readdir(join(home, ".hierophant/backups"))).length).toBe(1);
  });

  it("refuses a backup record that points somewhere else", async () => {
    const outside = join(home, "outside.txt");
    await writeFile(outside, "keep");
    await put(CLAUDE(), "{}");
    await applyLock(env, await planLock(env, ["claude-code"]));
    const root = join(home, ".hierophant/backups");
    const [directory] = await readdir(root);
    const path = join(root, directory!, "manifest.json");
    const manifest = await json(path);
    manifest.entries[0].file = outside;
    await writeFile(path, JSON.stringify(manifest));
    const results = await undoLock(env);
    expect(results?.[0]?.ok).toBe(false);
    expect(await readFile(outside, "utf8")).toBe("keep");
  });

  it("says when there is nothing to undo", async () => {
    expect(await undoLock(env)).toBeNull();
  });
});
