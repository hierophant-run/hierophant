import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const { metafile } = await build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: "dist/cli.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  mainFields: ["module", "main"],
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
  define: { __HIEROPHANT_CLI_VERSION__: JSON.stringify(version) },
  metafile: true,
  logLevel: "warning",
});

// The npm packaging step uses this to list the third-party code in the bundle.
await writeFile(resolve(root, "dist/cli.meta.json"), JSON.stringify(metafile));
