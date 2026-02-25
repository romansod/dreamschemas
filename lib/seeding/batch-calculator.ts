import { PROCESSING_CONFIG } from "./constants";
import type { Column } from "@/types/schema.types";

// Estimated serialized byte size per PostgreSQL type (JSON wire representation).
// These are conservative estimates — larger estimates produce smaller, safer batches.
const TYPE_BYTE_ESTIMATES: Record<string, number> = {
  UUID: 36,
  BOOLEAN: 5,
  SMALLINT: 6,
  INTEGER: 10,
  BIGINT: 12,
  DECIMAL: 20,
  NUMERIC: 20,
  REAL: 12,
  DATE: 12,
  TIME: 10,
  TIMESTAMPTZ: 30,
  TIMESTAMP: 30,
  JSONB: 200,
  JSON: 200,
};

// Default byte estimate for TEXT columns without a declared length, and for unknown types.
export const TEXT_DEFAULT_BYTES = 100;

/**
 * Estimate the serialized byte size of one row from the schema's column definitions.
 * VARCHAR(n) / CHAR(n) use col.length as the byte estimate; TEXT without a length uses
 * TEXT_DEFAULT_BYTES. Unknown types also fall back to TEXT_DEFAULT_BYTES.
 */
export function estimateRowBytesFromSchema(columns: Column[]): number {
  return columns.reduce((total, col) => {
    const typeName = col.type.toUpperCase().split("(")[0].trim();
    if (typeName === "VARCHAR" || typeName === "CHAR") {
      return total + (col.length ?? TEXT_DEFAULT_BYTES);
    }
    return total + (TYPE_BYTE_ESTIMATES[typeName] ?? TEXT_DEFAULT_BYTES);
  }, 0);
}

/**
 * Compute the number of rows per batch to target a maximum data payload size.
 * Result is clamped between MIN_BATCH_SIZE and MAX_BATCH_SIZE.
 */
export function calculateBatchSize(
  avgRowBytes: number,
  targetBatchBytes = PROCESSING_CONFIG.TARGET_BATCH_BYTES
): number {
  if (avgRowBytes <= 0) return PROCESSING_CONFIG.DEFAULT_BATCH_SIZE;
  const computed = Math.floor(targetBatchBytes / avgRowBytes);
  return Math.max(
    PROCESSING_CONFIG.MIN_BATCH_SIZE,
    Math.min(PROCESSING_CONFIG.MAX_BATCH_SIZE, computed)
  );
}
