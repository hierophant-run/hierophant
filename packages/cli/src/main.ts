import { homedir } from "node:os";
import { runCli } from "./cli.js";

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  // A closed pipe, such as `hierophant scan | head`, is not a failure.
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  color,
  fetch: (input, init) => fetch(input, init),
  home: homedir(),
  platform: process.platform,
  ...(process.env.APPDATA ? { appData: process.env.APPDATA } : {}),
}).then((code) => {
  process.exitCode = code;
});
