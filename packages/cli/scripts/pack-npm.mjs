import { execFileSync } from "node:child_process";
import console from "node:console";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@hierophanthq/cli";
const ALLOWED_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);
const EXPECTED_FILES = [
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "dist/cli.cjs",
  "package.json",
];
const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bnpm_[A-Za-z0-9]{30,}/,
];

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(cliRoot, "../..");
const outRoot = join(cliRoot, "dist/npm");
const packageDir = join(outRoot, "package");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

function isAllowedLicense(license) {
  if (typeof license !== "string") return false;
  const options = license.replace(/[()]/g, "").split(/\s+OR\s+/);
  return options.some((option) => ALLOWED_LICENSES.has(option.trim()));
}

async function bundledPackages() {
  const meta = await readJson(join(cliRoot, "dist/cli.meta.json"));
  const inputs = Object.values(meta.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([path]) => path),
  );
  const roots = new Set(
    inputs.flatMap((path) => {
      const match = path.match(/^(.*node_modules\/(?:@[^/]+\/[^/]+|[^/]+))\//);
      return match ? [resolve(cliRoot, match[1])] : [];
    }),
  );

  const packages = await Promise.all(
    [...roots].map(async (root) => {
      const { name, version, license } = await readJson(join(root, "package.json"));
      if (!isAllowedLicense(license)) throw new Error(`Unapproved license: ${name} ${license}`);
      const file = (await readdir(root)).find((entry) => /^licen[cs]e(?:\.|$)/i.test(entry));
      if (!file) throw new Error(`Missing license file: ${name}`);
      return { name, version, license, text: (await readFile(join(root, file), "utf8")).trim() };
    }),
  );
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function noticesText(packages) {
  const sections = packages.map(
    ({ name, version, license, text }) =>
      `## ${name} ${version}\n\nLicense: ${license}\n\n\`\`\`\`text\n${text}\n\`\`\`\`\n`,
  );
  return `# Third-Party Notices\n\n\`dist/cli.cjs\` bundles the following third-party software.\n\n${sections.join("\n")}`;
}

function assertClean(label, text) {
  for (const local of [homedir(), repoRoot]) {
    if (text.includes(local)) throw new Error(`${label} contains a local path`);
  }
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(`${label} contains a possible secret`);
  }
}

const source = await readJson(join(cliRoot, "package.json"));
const manifest = {
  name: PACKAGE_NAME,
  version: source.version,
  description: "Check what a repository would make your AI coding agent do, before you trust it.",
  license: source.license,
  homepage: "https://hierophanthq.com",
  repository: {
    type: "git",
    url: "git+https://github.com/hierophant-run/hierophant.git",
    directory: "packages/cli",
  },
  bugs: { url: "https://github.com/hierophant-run/hierophant/issues" },
  keywords: ["ai-agents", "claude-code", "cursor", "mcp", "prompt-injection", "security"],
  bin: { hierophant: "dist/cli.cjs" },
  files: ["dist/cli.cjs", "THIRD_PARTY_NOTICES.md"],
  engines: source.engines,
  publishConfig: { access: "public" },
};

await rm(outRoot, { recursive: true, force: true });
await mkdir(join(packageDir, "dist"), { recursive: true });

const bundle = await readFile(join(cliRoot, "dist/cli.cjs"), "utf8");
if (!bundle.startsWith("#!/usr/bin/env node\n")) throw new Error("The bundle has no shebang");
assertClean("The bundle", bundle);

const packages = await bundledPackages();
const notices = noticesText(packages);
assertClean("The notices", notices);

await Promise.all([
  writeFile(join(packageDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(join(packageDir, "THIRD_PARTY_NOTICES.md"), notices),
  writeFile(join(packageDir, "dist/cli.cjs"), bundle, { mode: 0o755 }),
  copyFile(join(cliRoot, "README.md"), join(packageDir, "README.md")),
  copyFile(join(repoRoot, "LICENSE"), join(packageDir, "LICENSE")),
]);

// This only creates a local archive. Publishing is a separate, manual step.
const [result] = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", outRoot], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const files = result.files.map((file) => file.path).sort();
if (JSON.stringify(files) !== JSON.stringify(EXPECTED_FILES)) {
  throw new Error(`Unexpected package contents: ${files.join(", ")}`);
}

console.log(`${result.filename}`);
console.log(`${files.length} files, ${result.size} bytes packed, ${result.unpackedSize} unpacked`);
console.log(`Bundled: ${packages.map(({ name, license }) => `${name} (${license})`).join(", ")}`);
