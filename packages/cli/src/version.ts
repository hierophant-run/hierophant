import { ENGINE_VERSION } from "@hierophant/engine";

declare const __HIEROPHANT_CLI_VERSION__: string | undefined;

/** The build sets the package version. Runs from source fall back to the engine version. */
export const CLI_VERSION =
  typeof __HIEROPHANT_CLI_VERSION__ === "string" ? __HIEROPHANT_CLI_VERSION__ : ENGINE_VERSION;
