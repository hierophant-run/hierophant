import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  findReferencedScripts,
  isAgentFile,
  MAX_FILE_CHARS,
  MAX_FILES,
  MAX_TOTAL_CHARS,
  type RepoFile,
  type SkippedFile,
} from "@hierophant/engine";

const MAX_ENTRIES = 200_000;
const MAX_DEPTH = 64;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
/* eslint-disable no-control-regex -- These patterns exist to reject control characters. */
const UNSAFE_NAME = /[\u0000-\u001f\u007f\\]/;

const displayPath = (path: string) => path.replace(/[\u0000-\u001f\u007f]/g, "?");
/* eslint-enable no-control-regex */

function compareByDepth(a: string, b: string): number {
  const depth = a.split("/").length - b.split("/").length;
  if (depth !== 0) return depth;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Lists regular files without following symbolic links or entering submodules. */
async function listRegularFiles(root: string, skipped: SkippedFile[]): Promise<Set<string>> {
  const regular = new Set<string>();
  const pending: Array<{ directory: string; depth: number }> = [{ directory: "", depth: 0 }];
  let seen = 0;

  while (pending.length > 0) {
    const { directory, depth } = pending.pop()!;
    let entries;
    try {
      entries = await readdir(join(root, directory), { withFileTypes: true });
    } catch {
      skipped.push({ path: displayPath(directory || "."), reason: "Could not read this folder" });
      continue;
    }
    if (directory && entries.some((entry) => entry.name === ".git")) {
      skipped.push({ path: displayPath(directory), reason: "Git submodule" });
      continue;
    }

    for (const entry of entries) {
      seen += 1;
      if (seen > MAX_ENTRIES) {
        skipped.push({ path: ".", reason: "The checkout has too many files to list completely" });
        return regular;
      }

      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        if (depth + 1 >= MAX_DEPTH) {
          skipped.push({ path: displayPath(path), reason: "Folder is nested too deeply" });
        } else {
          pending.push({ directory: path, depth: depth + 1 });
        }
      } else if (entry.isSymbolicLink()) {
        if (isAgentFile(path)) skipped.push({ path: displayPath(path), reason: "Symbolic link" });
      } else if (entry.isFile()) {
        if (!UNSAFE_NAME.test(path)) regular.add(path);
        else if (isAgentFile(path)) {
          skipped.push({ path: displayPath(path), reason: "Unsafe file name" });
        }
      }
    }
  }
  return regular;
}

async function readText(root: string, path: string): Promise<string | null> {
  const flags = constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(join(root, path), flags);
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_FILE_CHARS) return null;
    return await handle.readFile("utf8");
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

/** Reads agent files and the scripts they launch. Nothing in the checkout is executed. */
export async function collectFiles(
  root: string,
): Promise<{ files: RepoFile[]; skipped: SkippedFile[] }> {
  const skipped: SkippedFile[] = [];
  const regular = await listRegularFiles(root, skipped);
  const files: RepoFile[] = [];
  let totalChars = 0;

  const load = async (path: string, tooLargeReason: string) => {
    const content = await readText(root, path);
    if (content === null) {
      skipped.push({ path, reason: tooLargeReason });
    } else if (totalChars + content.length > MAX_TOTAL_CHARS) {
      skipped.push({ path, reason: "Total size limit reached" });
    } else {
      totalChars += content.length;
      files.push({ path, content });
    }
  };

  for (const path of [...regular].filter(isAgentFile).sort(compareByDepth)) {
    if (files.length >= MAX_FILES) skipped.push({ path, reason: "File limit reached" });
    else await load(path, "File is too large or could not be read");
  }

  const loaded = new Set(files.map((file) => file.path));
  for (const path of findReferencedScripts(files)) {
    if (!loaded.has(path) && regular.has(path)) {
      await load(path, "Referenced script is too large or could not be read");
    }
  }
  return { files, skipped };
}
