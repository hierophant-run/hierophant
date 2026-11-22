import { run } from "./run.js";

run(process.env, (line) => console.log(line)).then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    // Error messages can quote paths from the checkout, so none are printed.
    console.log("::error::Hierophant could not finish the check.");
    process.exitCode = 1;
  },
);
