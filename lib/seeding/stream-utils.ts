/**
 * Pure utility functions for SSE stream processing.
 * Extracted from use-seeding-stream for unit testability.
 */

export const MAX_RETRIES = 5;
export const RETRY_DELAY_MS = 2000;

export type ParsedSSEMessage =
  | { type: "progress"; data: unknown }
  | { type: "complete"; data: unknown }
  | { type: "error"; data: unknown }
  | { type: "done" }
  | { type: "unknown"; raw: string };

/**
 * Parse a single SSE `data:` line into a structured message.
 * Returns null for lines that are not `data:` lines.
 */
export function parseSeedingSSELine(line: string): ParsedSSEMessage | null {
  if (!line.startsWith("data: ")) return null;
  const raw = line.slice(6);

  if (raw === "[DONE]") return { type: "done" };

  try {
    const message = JSON.parse(raw) as { type: string; data?: unknown };
    if (message.type === "progress") return { type: "progress", data: message.data };
    if (message.type === "complete") return { type: "complete", data: message.data };
    if (message.type === "error") return { type: "error", data: message.data };
    return { type: "unknown", raw };
  } catch {
    return null;
  }
}

/**
 * Decide whether to auto-retry after an unexpected stream disconnect.
 */
export function shouldAutoRetry(isStopped: boolean, retryCount: number): boolean {
  return !isStopped && retryCount < MAX_RETRIES;
}
