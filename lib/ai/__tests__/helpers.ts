import type { CSVParseResult } from '../../../types/csv.types';

/** Build a minimal CSVParseResult for use in tests */
export function makeCSVResult(overrides: Partial<CSVParseResult> = {}): CSVParseResult {
  return {
    id: 'test-id',
    fileName: 'test.csv',
    headers: ['id', 'name'],
    data: [['1', 'Alice']],
    totalRows: 1,
    sampledRows: 1,
    columns: [
      {
        index: 0,
        name: 'id',
        originalName: 'id',
        sampleValues: ['1'],
        uniqueValues: new Set(['1']),
        nullCount: 0,
        emptyCount: 0,
        totalCount: 1,
        inferredType: 'UUID',
      },
      {
        index: 1,
        name: 'name',
        originalName: 'name',
        sampleValues: ['Alice'],
        uniqueValues: new Set(['Alice']),
        nullCount: 0,
        emptyCount: 0,
        totalCount: 1,
        inferredType: 'TEXT',
      },
    ],
    config: {
      hasHeader: true,
      skipEmptyLines: true,
      trimWhitespace: true,
    },
    parseErrors: [],
    timestamp: new Date(),
    ...overrides,
  };
}
