import type { AISchemaAnalysis } from '../schema-analyzer';

export interface AIProvider {
  generateSchema(
    prompt: string,
    systemPrompt: string,
    schema: object,
    options?: { temperature?: number; maxRetries?: number }
  ): Promise<AISchemaAnalysis>;
  generateText(
    prompt: string,
    systemPrompt: string,
    options?: { temperature?: number; maxRetries?: number }
  ): Promise<string>;
  streamText(
    prompt: string,
    systemPrompt: string,
    options?: { temperature?: number; maxRetries?: number }
  ): AsyncIterable<string>;
}

export type AIProviderFactory = () => AIProvider;
