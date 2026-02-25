import { describe, it, expect } from 'vitest';
import { DataProcessor } from '../data-processor';
import type { SeedingJob, SeedingConfiguration } from '@/types/seeding.types';
import type { DatabaseSchema } from '@/types/schema.types';

// Helpers to build minimal test fixtures
function makeSchema(tableNames: string[]): DatabaseSchema {
  return {
    id: 'schema-1',
    name: 'test',
    tables: tableNames.map(name => ({
      id: `${name}-id`,
      name,
      columns: [],
      indexes: [],
      constraints: [],
      rlsPolicies: [],
    })),
    relationships: [],
    rlsPolicies: [],
    version: '1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeJob(schema: DatabaseSchema, config: Partial<SeedingConfiguration> = {}): SeedingJob {
  const configuration: SeedingConfiguration = {
    mode: 'append',
    batchSize: 100,
    maxErrors: 50,
    skipOnError: false,
    validateForeignKeys: false,
    handleDuplicates: 'skip',
    dataTransformations: [],
    customValidations: [],
    parallelProcessing: false,
    maxConcurrency: 1,
    ...config,
  };

  return {
    id: 'job-1',
    userId: 'user-1',
    projectId: 'proj-1',
    fileId: 'file-1',
    schemaId: 'schema-1',
    schema,
    status: 'pending',
    totalRows: 0,
    processedRows: 0,
    successfulRows: 0,
    failedRows: 0,
    errors: [],
    warnings: [],
    statistics: {} as never,
    configuration,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Access private method for unit testing
function groupRowsByTable(
  processor: DataProcessor,
  rows: Record<string, unknown>[]
): Record<string, Record<string, unknown>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (processor as any).groupRowsByTable(rows);
}

describe('DataProcessor.groupRowsByTable', () => {
  it('routes all rows to the first table when no dataTransformations are configured', () => {
    const schema = makeSchema(['users', 'orders']);
    const processor = new DataProcessor(makeJob(schema));
    const rows = [{ name: 'Alice' }, { name: 'Bob' }];

    const result = groupRowsByTable(processor, rows);

    expect(Object.keys(result)).toEqual(['users']);
    expect(result['users']).toHaveLength(2);
  });

  it('routes rows to the correct table based on column mappings', () => {
    const schema = makeSchema(['users', 'orders']);
    const processor = new DataProcessor(makeJob(schema, {
      dataTransformations: [
        { sourceColumn: 'user_name', targetColumn: 'name', targetTable: 'users' },
        { sourceColumn: 'order_total', targetColumn: 'total', targetTable: 'orders' },
      ],
    }));

    const rows = [
      { user_name: 'Alice' },
      { order_total: 99.99 },
    ];

    const result = groupRowsByTable(processor, rows);

    expect(result['users']).toHaveLength(1);
    expect(result['users'][0]).toEqual({ user_name: 'Alice' });
    expect(result['orders']).toHaveLength(1);
    expect(result['orders'][0]).toEqual({ order_total: 99.99 });
  });

  it('adds a row to multiple tables when its columns map to more than one table', () => {
    const schema = makeSchema(['users', 'orders']);
    const processor = new DataProcessor(makeJob(schema, {
      dataTransformations: [
        { sourceColumn: 'user_name', targetColumn: 'name', targetTable: 'users' },
        { sourceColumn: 'order_total', targetColumn: 'total', targetTable: 'orders' },
      ],
    }));

    const rows = [{ user_name: 'Alice', order_total: 99.99 }];

    const result = groupRowsByTable(processor, rows);

    expect(result['users']).toHaveLength(1);
    expect(result['orders']).toHaveLength(1);
  });

  it('falls back to the primary table for rows with no matching mapped columns', () => {
    // Use a schema where the primary table ('users') is distinct from the only
    // target table ('orders') so we can verify the fallback is separate.
    const schema = makeSchema(['users', 'orders']);
    const processor = new DataProcessor(makeJob(schema, {
      dataTransformations: [
        { sourceColumn: 'order_total', targetColumn: 'total', targetTable: 'orders' },
      ],
    }));

    const rows = [
      { order_total: 99.99 },
      { unknown_column: 'foo' }, // no mapping -> falls back to primary ('users')
    ];

    const result = groupRowsByTable(processor, rows);

    expect(result['orders']).toHaveLength(1);
    expect(result['orders'][0]).toEqual({ order_total: 99.99 });
    // fallback row lands in the primary (first) schema table
    expect(result['users']).toHaveLength(1);
    expect(result['users'][0]).toEqual({ unknown_column: 'foo' });
  });

  it('initialises empty arrays for every target table even if no rows match', () => {
    const schema = makeSchema(['users', 'orders']);
    const processor = new DataProcessor(makeJob(schema, {
      dataTransformations: [
        { sourceColumn: 'user_name', targetColumn: 'name', targetTable: 'users' },
        { sourceColumn: 'order_total', targetColumn: 'total', targetTable: 'orders' },
      ],
    }));

    // All rows only match 'users'
    const rows = [{ user_name: 'Alice' }];

    const result = groupRowsByTable(processor, rows);

    expect(result['users']).toHaveLength(1);
    expect(result['orders']).toEqual([]);
  });

  it('routes a shared source column to all explicitly mapped tables without last-write-wins loss', () => {
    // 'created_at' is declared for both tables — both should receive the row.
    // A naive Record<string, string> map would only keep the last mapping.
    const schema = makeSchema(['users', 'orders']);
    const processor = new DataProcessor(makeJob(schema, {
      dataTransformations: [
        { sourceColumn: 'created_at', targetColumn: 'created_at', targetTable: 'users' },
        { sourceColumn: 'created_at', targetColumn: 'created_at', targetTable: 'orders' },
      ],
    }));

    const rows = [{ created_at: '2024-01-01' }];

    const result = groupRowsByTable(processor, rows);

    expect(result['users']).toHaveLength(1);
    expect(result['orders']).toHaveLength(1);
  });

  it('does not route a column to a table that shares the column name but has no explicit mapping', () => {
    // Only 'users' has an explicit mapping for 'created_at'.
    // Even though 'orders' might also have a created_at column in the schema,
    // it should NOT receive this row.
    const schema = makeSchema(['users', 'orders']);
    const processor = new DataProcessor(makeJob(schema, {
      dataTransformations: [
        { sourceColumn: 'created_at', targetColumn: 'created_at', targetTable: 'users' },
        { sourceColumn: 'order_ref', targetColumn: 'ref', targetTable: 'orders' },
      ],
    }));

    const rows = [{ created_at: '2024-01-01' }]; // no order_ref column

    const result = groupRowsByTable(processor, rows);

    expect(result['users']).toHaveLength(1);
    expect(result['orders']).toEqual([]); // no explicit mapping matched
  });

  it('handles an empty rows array without errors', () => {
    const schema = makeSchema(['users']);
    const processor = new DataProcessor(makeJob(schema, {
      dataTransformations: [
        { sourceColumn: 'user_name', targetColumn: 'name', targetTable: 'users' },
      ],
    }));

    const result = groupRowsByTable(processor, []);

    expect(result['users']).toEqual([]);
  });
});
