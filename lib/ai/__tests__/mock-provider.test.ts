import { describe, it, expect } from 'vitest';
import { createMockProvider } from '../providers/mock';
import fixtureData from '../__fixtures__/test-data-analysis.json';

describe('createMockProvider', () => {
  it('returns the fixture from generateSchema', async () => {
    const provider = createMockProvider();
    const result = await provider.generateSchema('', '');
    expect(result).toEqual(fixtureData);
  });

  it('returns fixture reasoning from generateText', async () => {
    const provider = createMockProvider();
    const result = await provider.generateText('', '');
    expect(result).toBe(fixtureData.reasoning);
  });

  it('yields fixture reasoning words from streamText', async () => {
    const provider = createMockProvider();
    const chunks: string[] = [];
    for await (const chunk of provider.streamText('', '')) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('').trim()).toBe(fixtureData.reasoning);
  });

  it('throws from generateSchema when shouldFail is true', async () => {
    const provider = createMockProvider({ shouldFail: true, failMessage: 'boom' });
    await expect(provider.generateSchema('', '')).rejects.toThrow('boom');
  });

  it('throws from streamText when shouldFail is true', async () => {
    const provider = createMockProvider({ shouldFail: true });
    await expect(async () => {
      for await (const _ of provider.streamText('', '')) { /* drain */ }
    }).rejects.toThrow('Mock provider stream error');
  });

  it('accepts a custom fixture override', async () => {
    const custom = { ...fixtureData, confidence: 0.42 };
    const provider = createMockProvider({ fixture: custom as typeof fixtureData });
    const result = await provider.generateSchema('', '');
    expect(result.confidence).toBe(0.42);
  });
});
