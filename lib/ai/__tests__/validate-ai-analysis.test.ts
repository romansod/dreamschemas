import { describe, it, expect } from 'vitest';
import { validateAIAnalysis, CONFIDENCE_THRESHOLDS } from '../schema-analyzer';
import type { AISchemaAnalysis } from '../schema-analyzer';
import fixtureData from '../__fixtures__/test-data-analysis.json';

function makeMinimalTable(name: string): AISchemaAnalysis['tables'][0] {
  return {
    name,
    columns: [
      {
        name: 'id',
        type: 'UUID',
        nullable: false,
        constraints: ['PRIMARY KEY', 'DEFAULT uuid_generate_v4()'],
        reasoning: 'Primary key',
      },
      {
        name: 'created_at',
        type: 'TIMESTAMPTZ',
        nullable: false,
        constraints: ['DEFAULT NOW()'],
        reasoning: 'Audit timestamp',
      },
      {
        name: 'updated_at',
        type: 'TIMESTAMPTZ',
        nullable: false,
        constraints: ['DEFAULT NOW()'],
        reasoning: 'Audit timestamp',
      },
    ],
    relationships: [],
    indexes: [],
    rlsPolicies: [],
  };
}

describe('validateAIAnalysis', () => {
  it('returns isValid true for the fixture', () => {
    const result = validateAIAnalysis(fixtureData as AISchemaAnalysis);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports issue when confidence is below LOW threshold', () => {
    const low = { ...fixtureData, confidence: CONFIDENCE_THRESHOLDS.LOW - 0.01 } as AISchemaAnalysis;
    const result = validateAIAnalysis(low);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes('confidence'))).toBe(true);
  });

  it('reports issue when a table has no name', () => {
    const analysis: AISchemaAnalysis = {
      ...fixtureData,
      tables: [{ ...makeMinimalTable(''), name: '' }],
    } as AISchemaAnalysis;
    const result = validateAIAnalysis(analysis);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes('missing name'))).toBe(true);
  });

  it('reports issue when a table has no columns', () => {
    const analysis: AISchemaAnalysis = {
      ...fixtureData,
      tables: [{ ...makeMinimalTable('empty_table'), columns: [] }],
    } as AISchemaAnalysis;
    const result = validateAIAnalysis(analysis);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes('no columns'))).toBe(true);
  });

  it('reports issue when a table is missing a primary key', () => {
    const noPK = makeMinimalTable('no_pk');
    noPK.columns = noPK.columns.map(c => ({
      ...c,
      constraints: c.constraints.filter(con => !con.includes('PRIMARY KEY')),
    }));
    const analysis: AISchemaAnalysis = {
      ...fixtureData,
      tables: [noPK],
    } as AISchemaAnalysis;
    const result = validateAIAnalysis(analysis);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.includes('primary key'))).toBe(true);
  });
});
