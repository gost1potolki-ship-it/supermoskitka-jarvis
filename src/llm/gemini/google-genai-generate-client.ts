import { GoogleGenAI } from '@google/genai';

import type { GeminiConfig } from './gemini-config.js';
import type {
  GeminiGenerateClient,
  GeminiGenerateInput,
  GeminiGenerateOutput,
} from './gemini-generate-client.js';

/** Production wrapper around @google/genai. Kept inside Gemini adapter layer. */
export class GoogleGenAiGenerateClient implements GeminiGenerateClient {
  private readonly ai: GoogleGenAI;

  constructor(config: Pick<GeminiConfig, 'apiKey'>) {
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateContent(input: GeminiGenerateInput): Promise<GeminiGenerateOutput> {
    const response = await this.ai.models.generateContent({
      model: input.model,
      contents: input.contents,
      ...(input.systemInstruction !== undefined
        ? {
            config: {
              systemInstruction: input.systemInstruction,
            },
          }
        : {}),
    });

    const text = typeof response.text === 'string' ? response.text : undefined;
    return { text };
  }
}
