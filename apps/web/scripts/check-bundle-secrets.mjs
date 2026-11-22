// Fails a deploy if any value from a local env file reached the build output.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [envPath, directory] = process.argv.slice(2);
if (!envPath || !directory) {
  console.error("Usage: node check-bundle-secrets.mjs <env-file> <build-directory>");
  process.exit(2);
}

const values = new Set();
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const index = line.indexOf("=");
  if (index <= 0 || line.startsWith("#")) continue;
  const value = line.slice(index + 1).trim();
  if (value.length >= 12) values.add(value);
  try {
    const { password } = new URL(value);
    if (password.length >= 8) values.add(decodeURIComponent(password));
  } catch {
    // Not a URL.
  }
}

const needles = [...values].map((value) => Buffer.from(value));
let files = 0;
let leaks = 0;
const walk = (folder) => {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) {
      files += 1;
      const bytes = readFileSync(path);
      if (needles.some((needle) => bytes.includes(needle))) leaks += 1;
    }
  }
};
walk(directory);

// Only counts are printed, so this check can never reveal a value.
console.log(`Checked ${files} build files for ${needles.length} values: ${leaks} leaks.`);
process.exitCode = leaks === 0 && needles.length > 0 ? 0 : 1;
