import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseRepoList, runResearch } from "./run";

const OUTPUT_DIRECTORY = ".research";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  if (!inputPath) {
    console.error("Usage: pnpm research:launch --input repos.txt [--confirm]");
    return 2;
  }

  const repos = parseRepoList(await readFile(inputPath, "utf8"));
  if (!args.includes("--confirm")) {
    console.log(`Dry run: ${repos.length} repos listed. Nothing was requested from GitHub.`);
    console.log("Add --confirm to run the scan.");
    return 0;
  }

  const { stats, disclosures } = await runResearch({
    repos,
    fetch: (input, init) => fetch(input, init),
    ...(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {}),
    onProgress: (done, total) => console.log(`${done}/${total}`),
  });

  const date = new Date().toISOString().slice(0, 10);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
  const statsPath = join(OUTPUT_DIRECTORY, `aggregate-${date}.json`);
  const privatePath = join(OUTPUT_DIRECTORY, `PRIVATE-disclosure-${date}.json`);

  await writeFile(statsPath, `${JSON.stringify(stats, null, 2)}\n`, { mode: 0o600 });
  await writeFile(
    privatePath,
    `${JSON.stringify(
      {
        notice:
          "PRIVATE. Do not publish. Confirm each finding by hand, then tell the repository owner privately.",
        disclosures,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  console.log(`Aggregate statistics: ${statsPath}`);
  console.log(`Private follow-up list: ${privatePath}`);
  if (!stats.publishable) console.log("This result is not publishable yet.");
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "The research run failed.");
    process.exitCode = 1;
  },
);
