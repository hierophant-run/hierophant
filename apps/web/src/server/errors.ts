const ERRORS = {
  invalid_url: [400, "Enter a public GitHub repository URL, like https://github.com/owner/repo."],
  invalid_request: [400, "The request body must be JSON with a url field."],
  forbidden_origin: [403, "This request was blocked because it came from another site."],
  bot_check_failed: [403, "We could not verify this request. Please try again."],
  repo_private: [403, "This repository is private. Hierophant only scans public repositories."],
  check_not_found: [404, "We could not find that. Check the name, URL, or address."],
  repo_not_found: [404, "Repository or branch not found. It may be private or may not exist."],
  report_not_found: [404, "Report not found."],
  payload_too_large: [413, "The request body is too large."],
  repo_too_large: [413, "This repository is too large to scan."],
  unsupported_media_type: [415, "The request must use the application/json content type."],
  repo_empty: [422, "This repository has no commits to scan."],
  rate_limited: [429, "Too many scans. Please wait and try again."],
  internal_error: [500, "Something went wrong. Please try again."],
  github_unavailable: [502, "GitHub could not be reached. Please try again."],
  database_unavailable: [503, "Reports are temporarily unavailable. Please try again."],
  check_unavailable: [503, "A public source could not be reached. Please try again."],
  github_rate_limited: [503, "The GitHub API limit was reached. Please try again later."],
  service_unavailable: [503, "The scanner is not configured."],
  scan_timeout: [504, "The scan took too long. Please try again."],
} as const satisfies Record<string, readonly [number, string]>;

export type ApiErrorCode = keyof typeof ERRORS;

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(ERRORS[code][1]);
    this.name = "ApiError";
    this.status = ERRORS[code][0];
  }
}
