export const FEEDBACK_REASONS = {
  expected_behavior: "This is expected in this repo",
  wrong_location: "Wrong file or line",
  not_a_risk: "This is not a real risk",
} as const;

export type FeedbackReason = keyof typeof FEEDBACK_REASONS;

export function isFeedbackReason(value: unknown): value is FeedbackReason {
  return typeof value === "string" && Object.hasOwn(FEEDBACK_REASONS, value);
}
