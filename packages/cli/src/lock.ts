import { createHash, randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { UsageError } from "@hierophant/local";
import { applyEdits, modify, parse, type JSONPath, type ParseError } from "jsonc-parser";

const MAX_SETTINGS_BYTES = 5 * 1024 * 1024;
const FORMATTING = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } };

export type LockEnv = { home: string; appData?: string; platform: NodeJS.Platform };

type JsonValue = string | boolean;
type LockSetting = {
  path: JSONPath;
  target: JsonValue;
  /** Values at least as strict as the target. They are left alone. */
  accepted: readonly JsonValue[];
  effect: string;
};
type Profile = {
  id: string;
  label: string;
  format: "json" | "jsonc";
  file: (env: LockEnv) => string | null;
  settings: readonly LockSetting[];
  unsupported?: string;
};

function vscodeSettings({ home, appData, platform }: LockEnv): string | null {
  if (platform === "win32") return appData ? join(appData, "Code", "User", "settings.json") : null;
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Code", "User", "settings.json");
  }
  return join(home, ".config", "Code", "User", "settings.json");
}

const exceptWindows = (path: string[]) => (env: LockEnv) =>
  env.platform === "win32" ? null : join(env.home, ...path);

/** Only settings confirmed in each vendor's official documentation belong here. */
const PROFILES: readonly Profile[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    format: "json",
    file: ({ home }) => join(home, ".claude", "settings.json"),
    settings: [
      {
        path: ["permissions", "disableBypassPermissionsMode"],
        target: "disable",
        accepted: ["disable"],
        effect: "Bypass permissions mode can no longer be turned on.",
      },
      {
        path: ["enableAllProjectMcpServers"],
        target: false,
        accepted: [false],
        effect: "MCP servers from a project need your approval.",
      },
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    format: "jsonc",
    file: () => null,
    settings: [],
    unsupported: "Not changed, because its settings could not be confirmed in official docs.",
  },
  {
    id: "vscode",
    label: "VS Code",
    format: "jsonc",
    file: vscodeSettings,
    settings: [
      {
        path: ["security.workspace.trust.enabled"],
        target: true,
        accepted: [true],
        effect: "New folders stay in Restricted Mode until you trust them.",
      },
      {
        path: ["task.allowAutomaticTasks"],
        target: "off",
        accepted: ["off"],
        effect: "Tasks cannot run by themselves when a folder opens.",
      },
      {
        path: ["chat.tools.global.autoApprove"],
        target: false,
        accepted: [false],
        effect: "Agent actions keep asking for your approval.",
      },
    ],
  },
  {
    id: "antigravity-cli",
    label: "Antigravity CLI",
    format: "json",
    file: exceptWindows([".gemini", "antigravity-cli", "settings.json"]),
    settings: [
      {
        path: ["agentMode"],
        target: "default",
        accepted: ["default", ""],
        effect: "File edits ask for your review first.",
      },
      {
        path: ["toolPermission"],
        target: "request-review",
        accepted: ["request-review", "strict"],
        effect: "Tool use asks for your review first.",
      },
    ],
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    format: "json",
    file: exceptWindows([".gemini", "settings.json"]),
    settings: [
      {
        path: ["security", "folderTrust", "enabled"],
        target: true,
        accepted: [true],
        effect: "Untrusted folders cannot load their settings or MCP servers.",
      },
      {
        path: ["security", "disableYoloMode"],
        target: true,
        accepted: [true],
        effect: "YOLO mode can no longer be turned on.",
      },
    ],
  },
];

export const LOCK_AGENTS = PROFILES.map((profile) => profile.id);

export type LockChange = { key: string; current: string; target: string; effect: string };

export type LockEntry = {
  id: string;
  label: string;
  file: string | null;
  state: "ready" | "locked" | "not_installed" | "unsupported" | "blocked";
  reason?: string;
  changes: LockChange[];
  kept: string[];
  before?: string | null;
  after?: string;
};

export type LockResult = { label: string; file: string; ok: boolean; message: string };

type ManifestEntry = {
  label: string;
  file: string;
  existed: boolean;
  backup: string | null;
  mode: number;
  afterSha256: string;
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseRoot(text: string, format: Profile["format"]): Record<string, unknown> | null {
  if (!text.trim()) return {};
  let value: unknown;
  if (format === "json") {
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  } else {
    const errors: ParseError[] = [];
    value = parse(text, errors, { allowTrailingComma: true });
    if (errors.length > 0) return null;
  }
  return isRecord(value) ? value : null;
}

/** Returns the value at a path. `blocked` means a parent key holds something unexpected. */
function readValue(root: Record<string, unknown>, path: JSONPath) {
  let current: unknown = root;
  for (const [index, key] of path.entries()) {
    if (!isRecord(current)) return { blocked: true, value: undefined };
    if (!Object.hasOwn(current, String(key))) return { blocked: false, value: undefined };
    current = current[String(key)];
    if (index < path.length - 1 && current !== undefined && !isRecord(current)) {
      return { blocked: true, value: undefined };
    }
  }
  return { blocked: false, value: current };
}

function describeValue(value: unknown): string {
  if (value === undefined) return "not set";
  return typeof value === "boolean" || typeof value === "string" || typeof value === "number"
    ? JSON.stringify(value)
    : "custom value";
}

async function readSettings(
  file: string,
): Promise<
  { state: "missing" } | { state: "blocked"; reason: string } | { state: "ok"; text: string | null }
> {
  try {
    if (!(await stat(dirname(file))).isDirectory()) return { state: "missing" };
  } catch {
    return { state: "missing" };
  }
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink()) {
      return { state: "blocked", reason: "The file is a symbolic link. Edit it by hand." };
    }
    if (!info.isFile()) return { state: "blocked", reason: "This path is not a regular file." };
    if (info.size > MAX_SETTINGS_BYTES) {
      return { state: "blocked", reason: "The file is too large." };
    }
    return { state: "ok", text: await readFile(file, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "ok", text: null };
    return { state: "blocked", reason: "The file could not be read." };
  }
}

async function planProfile(profile: Profile, env: LockEnv): Promise<LockEntry> {
  const base = { id: profile.id, label: profile.label, changes: [], kept: [] };
  if (profile.unsupported) {
    return { ...base, file: null, state: "unsupported", reason: profile.unsupported };
  }
  const file = profile.file(env);
  if (!file) {
    return {
      ...base,
      file: null,
      state: "unsupported",
      reason: "Not changed, because its settings path on this system is not documented.",
    };
  }

  const loaded = await readSettings(file);
  if (loaded.state === "missing") {
    return { ...base, file, state: "not_installed", reason: "Not found on this computer." };
  }
  if (loaded.state === "blocked") return { ...base, file, state: "blocked", reason: loaded.reason };

  const root = parseRoot(loaded.text ?? "", profile.format);
  if (!root) {
    return {
      ...base,
      file,
      state: "blocked",
      reason: "The file is not valid, so it was left alone.",
    };
  }

  const changes: LockChange[] = [];
  const kept: string[] = [];
  let after = loaded.text?.trim() ? loaded.text : "{}\n";

  for (const setting of profile.settings) {
    const key = setting.path.join(".");
    const { blocked, value } = readValue(root, setting.path);
    if (blocked) {
      return {
        ...base,
        file,
        state: "blocked",
        reason: `${key} has an unexpected shape, so the file was left alone.`,
      };
    }
    if (setting.accepted.includes(value as JsonValue)) {
      kept.push(key);
      continue;
    }
    after = applyEdits(after, modify(after, setting.path, setting.target, FORMATTING));
    changes.push({
      key,
      current: describeValue(value),
      target: JSON.stringify(setting.target),
      effect: setting.effect,
    });
  }

  if (!after.endsWith("\n")) after += "\n";
  return changes.length > 0
    ? {
        id: profile.id,
        label: profile.label,
        file,
        state: "ready",
        changes,
        kept,
        before: loaded.text,
        after,
      }
    : { id: profile.id, label: profile.label, file, state: "locked", changes, kept };
}

/** Reads settings and works out what would change. It never writes. */
export async function planLock(env: LockEnv, agents: readonly string[] = []): Promise<LockEntry[]> {
  const unknown = agents.find((agent) => !LOCK_AGENTS.includes(agent));
  if (unknown !== undefined) {
    throw new UsageError(`--agent must be one of: ${LOCK_AGENTS.join(", ")}.`);
  }
  const selected = PROFILES.filter((profile) => agents.length === 0 || agents.includes(profile.id));
  return Promise.all(selected.map((profile) => planProfile(profile, env)));
}

async function writeAtomic(file: string, text: string, mode: number): Promise<void> {
  const temp = join(
    dirname(file),
    `.${basename(file)}.hierophant-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    const handle = await open(temp, "wx", mode);
    try {
      await handle.writeFile(text);
      await handle.chmod(mode);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

async function backupsRoot(home: string): Promise<string> {
  const base = join(home, ".hierophant");
  await mkdir(base, { recursive: true, mode: 0o700 });
  if ((await lstat(base)).isSymbolicLink()) {
    throw new UsageError("~/.hierophant is a symbolic link, so nothing was changed.");
  }
  const backups = join(base, "backups");
  await mkdir(backups, { recursive: true, mode: 0o700 });
  return backups;
}

const saveManifest = (directory: string, entries: ManifestEntry[]) =>
  writeFile(join(directory, "manifest.json"), `${JSON.stringify({ entries }, null, 2)}\n`, {
    mode: 0o600,
  });

/** Backs up each file first, because settings files can hold private values. */
export async function applyLock(env: LockEnv, plan: readonly LockEntry[]): Promise<LockResult[]> {
  const ready = plan.filter((entry) => entry.state === "ready");
  if (ready.length === 0) return [];

  const root = await backupsRoot(env.home);
  const stamp = String(Date.now()).padStart(15, "0");
  const directory = join(root, `${stamp}-${randomBytes(4).toString("hex")}`);
  await mkdir(directory, { mode: 0o700 });

  const manifest: ManifestEntry[] = [];
  for (const [index, entry] of ready.entries()) {
    const file = entry.file!;
    const existed = entry.before !== null && entry.before !== undefined;
    const mode = existed ? (await stat(file)).mode & 0o777 : 0o600;
    let backup: string | null = null;
    if (existed) {
      backup = `${index}.backup`;
      await writeFile(join(directory, backup), entry.before!, { mode: 0o600 });
    }
    manifest.push({
      label: entry.label,
      file,
      existed,
      backup,
      mode,
      afterSha256: sha256(entry.after!),
    });
  }
  await saveManifest(directory, manifest);

  const results: LockResult[] = [];
  const applied: ManifestEntry[] = [];
  for (const [index, entry] of ready.entries()) {
    const file = entry.file!;
    const record = manifest[index]!;
    try {
      const current = await readSettings(file);
      if (current.state !== "ok" || current.text !== (entry.before ?? null)) {
        results.push({
          label: entry.label,
          file,
          ok: false,
          message: "The file changed during this run, so it was left alone.",
        });
        continue;
      }
      await writeAtomic(file, entry.after!, record.mode);
      applied.push(record);
      results.push({ label: entry.label, file, ok: true, message: "Locked." });
    } catch {
      results.push({
        label: entry.label,
        file,
        ok: false,
        message: "The file could not be written.",
      });
    }
  }

  if (applied.length === 0) await rm(directory, { recursive: true, force: true });
  else await saveManifest(directory, applied);
  return results;
}

/** Restores the latest lock, and refuses to overwrite anything edited since then. */
export async function undoLock(env: LockEnv): Promise<LockResult[] | null> {
  const root = join(env.home, ".hierophant", "backups");
  let names: string[];
  try {
    names = (await readdir(root)).filter((name) => /^\d{15}-[0-9a-f]{8}$/.test(name)).sort();
  } catch {
    return null;
  }
  const latest = names.at(-1);
  if (!latest) return null;

  const directory = join(root, latest);
  const { entries } = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
    entries: ManifestEntry[];
  };
  const knownFiles = new Set(PROFILES.map((profile) => profile.file(env)));
  const results: LockResult[] = [];
  const remaining: ManifestEntry[] = [];

  for (const entry of entries) {
    const { file, label } = entry;
    if (!knownFiles.has(file)) {
      results.push({ label, file, ok: false, message: "Unexpected path in the backup record." });
      remaining.push(entry);
      continue;
    }
    const current = await readSettings(file);
    if (current.state !== "ok" || sha256(current.text ?? "") !== entry.afterSha256) {
      const copy = entry.backup ? ` Your backup is at ${join(directory, entry.backup)}.` : "";
      results.push({
        label,
        file,
        ok: false,
        message: `This file was edited after locking, so it was left alone.${copy}`,
      });
      remaining.push(entry);
      continue;
    }
    try {
      if (entry.existed && entry.backup) {
        await writeAtomic(file, await readFile(join(directory, entry.backup), "utf8"), entry.mode);
      } else {
        await unlink(file);
      }
      results.push({ label, file, ok: true, message: "Restored." });
    } catch {
      results.push({ label, file, ok: false, message: "The file could not be restored." });
      remaining.push(entry);
    }
  }

  if (remaining.length === 0) await rm(directory, { recursive: true, force: true });
  else await saveManifest(directory, remaining);
  return results;
}
