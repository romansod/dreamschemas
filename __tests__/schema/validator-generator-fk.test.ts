import { describe, it, expect } from 'vitest';
import { SchemaValidator } from '@/lib/schema/validator';
import type { DatabaseSchema, Table, Relationship } from '@/types/schema.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTable(id: string, name: string, columns: { id: string; name: string; isPK?: boolean }[] = []): Table {
  return {
    id,
    name,
    indexes: [],
    columns: columns.map(col => ({
      id: col.id,
      name: col.name,
      type: 'UUID',
      nullable: false,
      constraints: col.isPK ? [{ type: 'PRIMARY KEY' }] : [],
    })),
  };
}

function makeSchema(tables: Table[], relationships: Relationship[]): DatabaseSchema {
  return {
    id: 'schema-1',
    name: 'test_schema',
    tables,
    relationships,
    rlsPolicies: [],
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests: validateRelationship uses table IDs (not names)
// ---------------------------------------------------------------------------

describe('SchemaValidator.validateRelationship – FK reference by ID', () => {
  it('passes when sourceTable and targetTable are valid table IDs', () => {
    const orders = makeTable('tbl-orders', 'orders', [
      { id: 'col-orders-id', name: 'id', isPK: true },
      { id: 'col-user-id', name: 'user_id' },
    ]);
    const users = makeTable('tbl-users', 'users', [
      { id: 'col-users-id', name: 'id', isPK: true },
    ]);

    const rel: Relationship = {
      id: 'rel-1',
      name: 'fk_orders_user_id',
      sourceTable: 'tbl-orders',   // ID
      sourceColumn: 'user_id',
      targetTable: 'tbl-users',   // ID
      targetColumn: 'id',
      type: 'one-to-many',
    };

    const validator = new SchemaValidator(makeSchema([orders, users], [rel]));
    const errors = validator.validateRelationship(rel);

    expect(errors).toHaveLength(0);
  });

  it('reports MISSING_SOURCE_TABLE when sourceTable ID does not exist', () => {
    const users = makeTable('tbl-users', 'users', [
      { id: 'col-users-id', name: 'id', isPK: true },
    ]);

    const rel: Relationship = {
      id: 'rel-2',
      sourceTable: 'nonexistent-id',
      sourceColumn: 'user_id',
      targetTable: 'tbl-users',
      targetColumn: 'id',
      type: 'one-to-many',
    };

    const validator = new SchemaValidator(makeSchema([users], [rel]));
    const errors = validator.validateRelationship(rel);

    expect(errors.some(e => e.code === 'MISSING_SOURCE_TABLE')).toBe(true);
  });

  it('reports MISSING_TARGET_TABLE when targetTable ID does not exist', () => {
    const orders = makeTable('tbl-orders', 'orders', [
      { id: 'col-orders-id', name: 'id', isPK: true },
      { id: 'col-user-id', name: 'user_id' },
    ]);

    const rel: Relationship = {
      id: 'rel-3',
      sourceTable: 'tbl-orders',
      sourceColumn: 'user_id',
      targetTable: 'nonexistent-id',
      targetColumn: 'id',
      type: 'one-to-many',
    };

    const validator = new SchemaValidator(makeSchema([orders], [rel]));
    const errors = validator.validateRelationship(rel);

    expect(errors.some(e => e.code === 'MISSING_TARGET_TABLE')).toBe(true);
  });

  it('does NOT match tables by name (regression: old bug)', () => {
    // A relationship whose sourceTable value matches a table *name*, not its ID.
    // Under the old code this would silently pass; now it must fail.
    const users = makeTable('tbl-users', 'users', [
      { id: 'col-users-id', name: 'id', isPK: true },
    ]);

    const rel: Relationship = {
      id: 'rel-4',
      sourceTable: 'users',        // <-- table NAME, not ID – should NOT match
      sourceColumn: 'id',
      targetTable: 'tbl-users',
      targetColumn: 'id',
      type: 'one-to-many',
    };

    const validator = new SchemaValidator(makeSchema([users], [rel]));
    const errors = validator.validateRelationship(rel);

    expect(errors.some(e => e.code === 'MISSING_SOURCE_TABLE')).toBe(true);
  });

  it('reports MISSING_SOURCE_COLUMN with the table name (not its ID)', () => {
    const orders = makeTable('tbl-orders', 'orders', [
      { id: 'col-orders-id', name: 'id', isPK: true },
    ]);
    const users = makeTable('tbl-users', 'users', [
      { id: 'col-users-id', name: 'id', isPK: true },
    ]);

    const rel: Relationship = {
      id: 'rel-5',
      sourceTable: 'tbl-orders',
      sourceColumn: 'missing_column',
      targetTable: 'tbl-users',
      targetColumn: 'id',
      type: 'one-to-many',
    };

    const validator = new SchemaValidator(makeSchema([orders, users], [rel]));
    const errors = validator.validateRelationship(rel);

    const colError = errors.find(e => e.code === 'MISSING_SOURCE_COLUMN');
    expect(colError).toBeDefined();
    // The `table` field on the error should be the human-readable name, not the UUID
    expect(colError!.table).toBe('orders');
  });

  it('reports MISSING_TARGET_COLUMN with the table name (not its ID)', () => {
    const orders = makeTable('tbl-orders', 'orders', [
      { id: 'col-orders-id', name: 'id', isPK: true },
      { id: 'col-user-id', name: 'user_id' },
    ]);
    const users = makeTable('tbl-users', 'users', [
      { id: 'col-users-id', name: 'id', isPK: true },
    ]);

    const rel: Relationship = {
      id: 'rel-6',
      sourceTable: 'tbl-orders',
      sourceColumn: 'user_id',
      targetTable: 'tbl-users',
      targetColumn: 'nonexistent',
      type: 'one-to-many',
    };

    const validator = new SchemaValidator(makeSchema([orders, users], [rel]));
    const errors = validator.validateRelationship(rel);

    const colError = errors.find(e => e.code === 'MISSING_TARGET_COLUMN');
    expect(colError).toBeDefined();
    expect(colError!.table).toBe('users');
  });
});

// ---------------------------------------------------------------------------
// Tests: validateRelationshipConsistency cycle detection uses IDs
// ---------------------------------------------------------------------------

describe('SchemaValidator – circular dependency detection with ID-based relationships', () => {
  it('detects a cycle when relationships reference tables by ID', () => {
    const a = makeTable('tbl-a', 'table_a', [{ id: 'col-a-id', name: 'id', isPK: true }, { id: 'col-a-b', name: 'b_id' }]);
    const b = makeTable('tbl-b', 'table_b', [{ id: 'col-b-id', name: 'id', isPK: true }, { id: 'col-b-a', name: 'a_id' }]);

    const relAtoB: Relationship = { id: 'rel-ab', sourceTable: 'tbl-a', sourceColumn: 'b_id', targetTable: 'tbl-b', targetColumn: 'id', type: 'one-to-many' };
    const relBtoA: Relationship = { id: 'rel-ba', sourceTable: 'tbl-b', sourceColumn: 'a_id', targetTable: 'tbl-a', targetColumn: 'id', type: 'one-to-many' };

    const schema = makeSchema([a, b], [relAtoB, relBtoA]);
    const validator = new SchemaValidator(schema);
    const result = validator.validateSchema();

    expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
  });

  it('does not false-positive on a valid acyclic schema', () => {
    const users = makeTable('tbl-users', 'users', [{ id: 'col-u-id', name: 'id', isPK: true }]);
    const posts = makeTable('tbl-posts', 'posts', [{ id: 'col-p-id', name: 'id', isPK: true }, { id: 'col-p-uid', name: 'user_id' }]);

    const rel: Relationship = { id: 'rel-p-u', sourceTable: 'tbl-posts', sourceColumn: 'user_id', targetTable: 'tbl-users', targetColumn: 'id', type: 'one-to-many' };

    const schema = makeSchema([users, posts], [rel]);
    const validator = new SchemaValidator(schema);
    const result = validator.validateSchema();

    expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: validateDataIntegrity type-mismatch check uses IDs
// ---------------------------------------------------------------------------

describe('SchemaValidator – data integrity type-mismatch check with ID-based relationships', () => {
  it('warns on type mismatch between linked columns found by table ID', () => {
    const users = makeTable('tbl-users', 'users', [{ id: 'col-u-id', name: 'id', isPK: true }]);
    // Override type of the column for this test
    users.columns[0].type = 'UUID';

    const posts = makeTable('tbl-posts', 'posts', [
      { id: 'col-p-id', name: 'id', isPK: true },
      { id: 'col-p-uid', name: 'user_id' },
    ]);
    posts.columns[1].type = 'INTEGER'; // mismatch with UUID

    const rel: Relationship = {
      id: 'rel-p-u',
      sourceTable: 'tbl-posts',
      sourceColumn: 'user_id',
      targetTable: 'tbl-users',
      targetColumn: 'id',
      type: 'one-to-many',
    };

    const schema = makeSchema([users, posts], [rel]);
    const validator = new SchemaValidator(schema);
    const result = validator.validateSchema();

    expect(result.warnings.some(w => w.code === 'TYPE_MISMATCH')).toBe(true);
  });
});
