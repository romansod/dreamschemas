import { describe, it, expect } from "vitest";
import {
  estimateRowBytesFromSchema,
  calculateBatchSize,
  TEXT_DEFAULT_BYTES,
} from "../batch-calculator";
import { PROCESSING_CONFIG } from "../constants";
import type { Column } from "@/types/schema.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function col(type: Column["type"], length?: number): Column {
  return {
    id: "c",
    name: "col",
    type,
    nullable: true,
    constraints: [],
    ...(length !== undefined ? { length } : {}),
  };
}

// ---------------------------------------------------------------------------
// estimateRowBytesFromSchema
// ---------------------------------------------------------------------------

describe("estimateRowBytesFromSchema", () => {
  it("returns 0 for an empty column list", () => {
    expect(estimateRowBytesFromSchema([])).toBe(0);
  });

  it("uses known byte estimates for primitive types", () => {
    const columns: Column[] = [col("UUID"), col("INTEGER"), col("BOOLEAN")];
    // 36 + 10 + 5 = 51
    expect(estimateRowBytesFromSchema(columns)).toBe(51);
  });

  it("uses col.length for VARCHAR columns", () => {
    const columns: Column[] = [col("VARCHAR", 255)];
    expect(estimateRowBytesFromSchema(columns)).toBe(255);
  });

  it("falls back to TEXT_DEFAULT_BYTES for VARCHAR without a length", () => {
    const columns: Column[] = [col("VARCHAR")];
    expect(estimateRowBytesFromSchema(columns)).toBe(TEXT_DEFAULT_BYTES);
  });

  it("uses col.length for CHAR columns", () => {
    const columns: Column[] = [col("CHAR", 10)];
    expect(estimateRowBytesFromSchema(columns)).toBe(10);
  });

  it("uses TEXT_DEFAULT_BYTES for TEXT columns", () => {
    const columns: Column[] = [col("TEXT")];
    expect(estimateRowBytesFromSchema(columns)).toBe(TEXT_DEFAULT_BYTES);
  });

  it("uses 200 bytes for JSONB columns", () => {
    const columns: Column[] = [col("JSONB")];
    expect(estimateRowBytesFromSchema(columns)).toBe(200);
  });

  it("uses TEXT_DEFAULT_BYTES for ENUM (unknown to the map)", () => {
    const columns: Column[] = [col("ENUM")];
    expect(estimateRowBytesFromSchema(columns)).toBe(TEXT_DEFAULT_BYTES);
  });

  it("uses TEXT_DEFAULT_BYTES for ARRAY (unknown to the map)", () => {
    const columns: Column[] = [col("ARRAY")];
    expect(estimateRowBytesFromSchema(columns)).toBe(TEXT_DEFAULT_BYTES);
  });

  it("sums correctly across a mixed-type schema", () => {
    // UUID(36) + TIMESTAMPTZ(30) + VARCHAR(50)(50) + TEXT(100) + BOOLEAN(5) = 221
    const columns: Column[] = [
      col("UUID"),
      col("TIMESTAMPTZ"),
      col("VARCHAR", 50),
      col("TEXT"),
      col("BOOLEAN"),
    ];
    expect(estimateRowBytesFromSchema(columns)).toBe(221);
  });

  it("handles TIMESTAMP and TIMESTAMPTZ both as 30 bytes", () => {
    const ts = col("TIMESTAMP");
    const tstz = col("TIMESTAMPTZ");
    expect(estimateRowBytesFromSchema([ts])).toBe(30);
    expect(estimateRowBytesFromSchema([tstz])).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// calculateBatchSize
// ---------------------------------------------------------------------------

describe("calculateBatchSize", () => {
  const { TARGET_BATCH_BYTES, MIN_BATCH_SIZE, MAX_BATCH_SIZE, DEFAULT_BATCH_SIZE } =
    PROCESSING_CONFIG;

  it("returns DEFAULT_BATCH_SIZE when avgRowBytes is 0", () => {
    expect(calculateBatchSize(0)).toBe(DEFAULT_BATCH_SIZE);
  });

  it("returns DEFAULT_BATCH_SIZE when avgRowBytes is negative", () => {
    expect(calculateBatchSize(-1)).toBe(DEFAULT_BATCH_SIZE);
  });

  it("computes the correct row count for a given byte size", () => {
    // 512 * 1024 / 512 = 1024 rows
    expect(calculateBatchSize(512)).toBe(1024);
  });

  it("clamps to MIN_BATCH_SIZE when computed value is too small", () => {
    // A very large row (100 KB) → floor(512 KB / 100 KB) = 5, below MIN_BATCH_SIZE
    const hugeRowBytes = 100 * 1024;
    expect(calculateBatchSize(hugeRowBytes)).toBe(MIN_BATCH_SIZE);
  });

  it("clamps to MAX_BATCH_SIZE when computed value is too large", () => {
    // A tiny row (1 byte) → 512 * 1024 = 524288, above MAX_BATCH_SIZE
    expect(calculateBatchSize(1)).toBe(MAX_BATCH_SIZE);
  });

  it("respects a custom targetBatchBytes", () => {
    // 1 MB target / 512 bytes per row = 2048
    const oneMB = 1024 * 1024;
    expect(calculateBatchSize(512, oneMB)).toBe(2048);
  });

  it("floors the computed value (no fractional rows)", () => {
    // 512 * 1024 / 300 = 1747.something → should floor to 1747
    expect(calculateBatchSize(300)).toBe(Math.floor(TARGET_BATCH_BYTES / 300));
  });

  it("uses TARGET_BATCH_BYTES by default", () => {
    const rowBytes = 200;
    const expected = Math.floor(TARGET_BATCH_BYTES / rowBytes);
    expect(calculateBatchSize(rowBytes)).toBe(expected);
  });
});
