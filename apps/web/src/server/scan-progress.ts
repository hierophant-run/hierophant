/** Real stages of a scan, streamed to the browser as they happen. */
export type ScanProgress =
  | { stage: "repository" }
  | { stage: "listing" }
  | { stage: "downloading"; done: number; total: number }
  | { stage: "scanning" }
  | { stage: "packages" }
  | { stage: "saving" };

export type ProgressListener = (progress: ScanProgress) => void;
