import type { RuleId } from "../catalog.js";
import type { Severity } from "../types.js";

export type ReportOptions = { severity?: Severity };

/** Records a finding at a character offset of the current file. */
export type Reporter = (ruleId: RuleId, offset: number, options?: ReportOptions) => void;
