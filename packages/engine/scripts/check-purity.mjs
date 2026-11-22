// Fails if the built engine can reach the network, the filesystem, or child processes.
import { readFileSync, statSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_BUILTINS = new Set(["buffer", "process"]);
const builtins = new Set(builtinModules);
const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const specifierPattern =
  /(?:^\s*(?:import|export)\b[^"'\n]*\bfrom\s*|^\s*\}\s*from\s*|^\s*import\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"'\n]+)["']/gm;

const visited = new Set();
const queue = [entry];
const violations = [];

function resolveFile(from, specifier) {
  if (specifier.startsWith(".")) {
    const base = resolve(dirname(from), specifier);
    for (const candidate of [base, `${base}.js`, resolve(base, "index.js")]) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  }
  return createRequire(from).resolve(specifier);
}

while (queue.length > 0) {
  const file = queue.pop();
  if (visited.has(file)) continue;
  visited.add(file);

  for (const [, specifier] of readFileSync(file, "utf8").matchAll(specifierPattern)) {
    const bare = specifier.replace(/^node:/, "");
    if (specifier.startsWith("node:") || builtins.has(bare)) {
      if (!ALLOWED_BUILTINS.has(bare)) violations.push(`${file} imports ${specifier}`);
      continue;
    }
    const next = resolveFile(file, specifier);
    if (next) queue.push(next);
    else violations.push(`${file} has an unresolved import: ${specifier}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(`Engine purity check passed (${visited.size} modules).`);
