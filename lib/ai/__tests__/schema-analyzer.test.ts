import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SchemaAnalyzer } from '../schema-analyzer';
import { createMockProvider } from '../providers/mock';
import { makeCSVResult } from './helpers';
import fixtureData from '../__fixtures__/test-data-analysis.json';

describe('SchemaAnalyzer', () => {
  describe('analyzeSchema – happy path', () => {
    it('returns fixture data from the mock provider', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      expect(result).toEqual(fixtureData);
    });

    it('returns 5 tables for the e-commerce fixture', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      expect(result.tables).toHaveLength(5);
    });

    it('includes expected table names', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      const names = result.tables.map(t => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['users', 'categories', 'products', 'orders', 'order_items'])
      );
    });

    it('confidence is above 0.8', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('every table has a UUID primary key named id', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      for (const table of result.tables) {
        const idCol = table.columns.find(c => c.name === 'id');
        expect(idCol, `${table.name} missing id column`).toBeDefined();
        expect(idCol?.type).toBe('UUID');
        expect(
          idCol?.constraints.some(c => c.includes('PRIMARY KEY')),
          `${table.name}.id missing PRIMARY KEY`
        ).toBe(true);
      }
    });

    it('every table has created_at and updated_at as TIMESTAMPTZ', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      for (const table of result.tables) {
        const createdAt = table.columns.find(c => c.name === 'created_at');
        const updatedAt = table.columns.find(c => c.name === 'updated_at');
        expect(createdAt?.type, `${table.name}.created_at type`).toBe('TIMESTAMPTZ');
        expect(updatedAt?.type, `${table.name}.updated_at type`).toBe('TIMESTAMPTZ');
      }
    });

    it('orders table has a user_id FK column', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      const orders = result.tables.find(t => t.name === 'orders')!;
      const userIdCol = orders.columns.find(c => c.name === 'user_id');
      expect(userIdCol).toBeDefined();
      expect(userIdCol?.type).toBe('UUID');
    });

    it('categories table has a self-referential parent_id', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      const categories = result.tables.find(t => t.name === 'categories')!;
      const parentId = categories.columns.find(c => c.name === 'parent_id');
      expect(parentId).toBeDefined();
      expect(parentId?.nullable).toBe(true);
    });

    it('order_items has relationships to both orders and products', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      const orderItems = result.tables.find(t => t.name === 'order_items')!;
      const targets = orderItems.relationships.map(r => r.targetTable);
      expect(targets).toContain('orders');
      expect(targets).toContain('products');
    });

    it('returns suggestions', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeSchema – fallback on provider failure', () => {
    beforeEach(() => {
      console.log('== Expected errors below (provider failure simulation) ==');
    });
    afterEach(() => {
      console.log('== End of expected errors ==');
    });

    it('falls back to rule-based analysis when provider throws', async () => {
      const analyzer = new SchemaAnalyzer(
        createMockProvider({ shouldFail: true, failMessage: 'API down' })
      );
      const csv = makeCSVResult({ fileName: 'widgets.csv' });
      const result = await analyzer.analyzeSchema([csv]);

      // Fallback should still produce a schema, just with lower confidence
      expect(result.tables.length).toBeGreaterThan(0);
      expect(result.reasoning).toContain('FALLBACK');
    });

    it('fallback schema includes an id UUID column', async () => {
      const analyzer = new SchemaAnalyzer(
        createMockProvider({ shouldFail: true })
      );
      const result = await analyzer.analyzeSchema([makeCSVResult({ fileName: 'things.csv' })]);

      for (const table of result.tables) {
        const id = table.columns.find(c => c.name === 'id');
        expect(id?.type).toBe('UUID');
      }
    });
  });

  describe('RLS policy field consistency', () => {
    it('fixture RLS policies have no definition field', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const result = await analyzer.analyzeSchema([makeCSVResult()]);

      for (const table of result.tables) {
        for (const policy of table.rlsPolicies) {
          expect(policy).not.toHaveProperty('definition');
        }
      }
    });

    it('fallback RLS policies have no definition field', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider({ shouldFail: true }));
      const result = await analyzer.analyzeSchema([makeCSVResult({ fileName: 'items.csv' })]);

      for (const table of result.tables) {
        for (const policy of table.rlsPolicies) {
          expect(policy).not.toHaveProperty('definition');
        }
      }
    });

    it('fallback SELECT policy uses using, not with_check', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider({ shouldFail: true }));
      const result = await analyzer.analyzeSchema([makeCSVResult({ fileName: 'items.csv' })]);

      for (const table of result.tables) {
        const select = table.rlsPolicies.find(p => p.operation === 'SELECT');
        expect(select).toBeDefined();
        expect(select?.using).toBeTruthy();
        expect(select).not.toHaveProperty('with_check');
      }
    });

    it('fallback INSERT policy uses with_check, not using', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider({ shouldFail: true }));
      const result = await analyzer.analyzeSchema([makeCSVResult({ fileName: 'items.csv' })]);

      for (const table of result.tables) {
        const insert = table.rlsPolicies.find(p => p.operation === 'INSERT');
        expect(insert).toBeDefined();
        expect(insert?.with_check).toBeTruthy();
        expect(insert).not.toHaveProperty('using');
      }
    });

    it('fallback UPDATE policy uses both using and with_check', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider({ shouldFail: true }));
      const result = await analyzer.analyzeSchema([makeCSVResult({ fileName: 'items.csv' })]);

      for (const table of result.tables) {
        const update = table.rlsPolicies.find(p => p.operation === 'UPDATE');
        expect(update).toBeDefined();
        expect(update?.using).toBeTruthy();
        expect(update?.with_check).toBeTruthy();
      }
    });

    it('fallback DELETE policy uses using, not with_check', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider({ shouldFail: true }));
      const result = await analyzer.analyzeSchema([makeCSVResult({ fileName: 'items.csv' })]);

      for (const table of result.tables) {
        const del = table.rlsPolicies.find(p => p.operation === 'DELETE');
        expect(del).toBeDefined();
        expect(del?.using).toBeTruthy();
        expect(del).not.toHaveProperty('with_check');
      }
    });
  });

  describe('streamSchemaAnalysis', () => {
    it('yields string chunks', async () => {
      const analyzer = new SchemaAnalyzer(createMockProvider());
      const stream = await analyzer.streamSchemaAnalysis([makeCSVResult()]);

      const chunks: string[] = [];
      for await (const chunk of stream.textStream) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThan(0);
      expect(typeof chunks[0]).toBe('string');
    });
  });
});
