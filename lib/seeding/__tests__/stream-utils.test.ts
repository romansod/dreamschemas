import { describe, it, expect } from "vitest";
import {
  MAX_RETRIES,
  RETRY_DELAY_MS,
  parseSeedingSSELine,
  shouldAutoRetry,
} from "../stream-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("MAX_RETRIES is 5", () => {
    expect(MAX_RETRIES).toBe(5);
  });

  it("RETRY_DELAY_MS is 2000", () => {
    expect(RETRY_DELAY_MS).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// parseSeedingSSELine
// ---------------------------------------------------------------------------

describe("parseSeedingSSELine", () => {
  it("returns null for non-data lines", () => {
    expect(parseSeedingSSELine("")).toBeNull();
    expect(parseSeedingSSELine("event: message")).toBeNull();
    expect(parseSeedingSSELine(": heartbeat")).toBeNull();
  });

  it("returns { type: 'done' } for [DONE]", () => {
    expect(parseSeedingSSELine("data: [DONE]")).toEqual({ type: "done" });
  });

  it("parses a progress message", () => {
    const payload = { jobId: "abc", overallProgress: 50 };
    const line = `data: ${JSON.stringify({ type: "progress", data: payload })}`;
    expect(parseSeedingSSELine(line)).toEqual({ type: "progress", data: payload });
  });

  it("parses a complete message", () => {
    const payload = { success: true };
    const line = `data: ${JSON.stringify({ type: "complete", data: payload })}`;
    expect(parseSeedingSSELine(line)).toEqual({ type: "complete", data: payload });
  });

  it("parses an error message", () => {
    const payload = { error: { message: "failed" } };
    const line = `data: ${JSON.stringify({ type: "error", data: payload })}`;
    expect(parseSeedingSSELine(line)).toEqual({ type: "error", data: payload });
  });

  it("returns { type: 'unknown' } for an unrecognised message type", () => {
    const line = `data: ${JSON.stringify({ type: "ping" })}`;
    const result = parseSeedingSSELine(line);
    expect(result?.type).toBe("unknown");
  });

  it("returns null for malformed JSON", () => {
    expect(parseSeedingSSELine("data: {not valid json}")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shouldAutoRetry
// ---------------------------------------------------------------------------

describe("shouldAutoRetry", () => {
  it("returns true when not stopped and retries remain", () => {
    expect(shouldAutoRetry(false, 0)).toBe(true);
    expect(shouldAutoRetry(false, MAX_RETRIES - 1)).toBe(true);
  });

  it("returns false when retries are exhausted", () => {
    expect(shouldAutoRetry(false, MAX_RETRIES)).toBe(false);
    expect(shouldAutoRetry(false, MAX_RETRIES + 1)).toBe(false);
  });

  it("returns false when intentionally stopped, regardless of retry count", () => {
    expect(shouldAutoRetry(true, 0)).toBe(false);
    expect(shouldAutoRetry(true, 1)).toBe(false);
    expect(shouldAutoRetry(true, MAX_RETRIES - 1)).toBe(false);
  });
});
