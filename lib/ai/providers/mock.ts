import type { AIProvider } from './types';
import type { AISchemaAnalysis } from '../schema-analyzer';
import fixtureData from '../__fixtures__/test-data-analysis.json';

export interface MockProviderOptions {
  /** Simulate per-chunk delay in ms (default 0 for instant) */
  streamDelayMs?: number;
  /** Override the fixture with a custom response */
  fixture?: AISchemaAnalysis;
  /** Throw an error instead of returning data (for fallback testing) */
  shouldFail?: boolean;
  /** Error message when shouldFail is true */
  failMessage?: string;
}

export function createMockProvider(options: MockProviderOptions = {}): AIProvider {
  const fixture = (options.fixture ?? fixtureData) as AISchemaAnalysis;

  return {
    async generateSchema() {
      if (options.shouldFail) {
        throw new Error(options.failMessage ?? 'Mock provider error');
      }
      return fixture;
    },

    async generateText() {
      if (options.shouldFail) {
        throw new Error(options.failMessage ?? 'Mock provider error');
      }
      return fixture.reasoning;
    },

    async *streamText() {
      if (options.shouldFail) {
        throw new Error(options.failMessage ?? 'Mock provider stream error');
      }
      const words = fixture.reasoning.split(' ');
      for (const word of words) {
        if (options.streamDelayMs) {
          await new Promise(resolve => setTimeout(resolve, options.streamDelayMs));
        }
        yield word + ' ';
      }
    },
  };
}
