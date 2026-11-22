type LogFields = Record<string, string | number | boolean>;

export const errorName = (error: unknown) => (error instanceof Error ? error.name : "unknown");

/**
 * Writes one JSON line. Callers pass fixed codes only: error messages, URLs, IP addresses,
 * tokens, and repository content must never be logged.
 */
export function logError(event: string, fields: LogFields = {}): void {
  console.error(
    JSON.stringify({ level: "error", event, time: new Date().toISOString(), ...fields }),
  );
}
