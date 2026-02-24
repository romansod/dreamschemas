import { anthropic } from '@ai-sdk/anthropic';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod';
import type { AIProvider } from './types';
import type { AISchemaAnalysis } from '../schema-analyzer';

export function createAnthropicProvider(modelId = 'claude-sonnet-4-6'): AIProvider {
  const model = anthropic(modelId);

  return {
    async generateSchema(prompt, systemPrompt, schema, options = {}) {
      const result = await generateObject({
        model,
        mode: 'tool',
        schema: schema as z.ZodType<AISchemaAnalysis>,
        system: systemPrompt,
        prompt,
        maxRetries: options.maxRetries ?? 3,
        temperature: options.temperature ?? 0.3,
      });
      return result.object;
    },

    async generateText(prompt, systemPrompt, options = {}) {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt,
        maxRetries: options.maxRetries ?? 3,
        temperature: options.temperature ?? 0.3,
      });
      return result.text;
    },

    async *streamText(prompt, systemPrompt, options = {}) {
      const stream = streamText({
        model,
        system: systemPrompt,
        prompt,
        maxRetries: options.maxRetries ?? 3,
        temperature: options.temperature ?? 0.3,
      });
      for await (const chunk of (await stream).textStream) {
        yield chunk;
      }
    },
  };
}
