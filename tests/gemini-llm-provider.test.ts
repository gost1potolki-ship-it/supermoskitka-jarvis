import {
  GeminiConfigError,
  GeminiLlmProvider,
  GeminiProviderError,
  loadGeminiConfig,
  mapLlmMessagesToGemini,
  type GeminiGenerateClient,
  type GeminiGenerateInput,
  type GeminiGenerateOutput,
} from '../src/llm/index.js';
import { describe, expect, it } from 'vitest';

class FakeGeminiClient implements GeminiGenerateClient {
  readonly calls: GeminiGenerateInput[] = [];
  nextOutput: GeminiGenerateOutput = { text: 'ok' };
  nextError: Error | undefined;

  async generateContent(input: GeminiGenerateInput): Promise<GeminiGenerateOutput> {
    this.calls.push({
      model: input.model,
      contents: input.contents.map((content) => ({
        role: content.role,
        parts: content.parts.map((part) => ({ text: part.text })),
      })),
      ...(input.systemInstruction !== undefined
        ? { systemInstruction: input.systemInstruction }
        : {}),
    });
    if (this.nextError) {
      throw this.nextError;
    }
    return this.nextOutput;
  }
}

describe('Gemini message mapping', () => {
  it('GEMINI-1 user maps to Gemini user', () => {
    const mapped = mapLlmMessagesToGemini([{ role: 'user', content: 'hello' }]);
    expect(mapped.contents).toEqual([{ role: 'user', parts: [{ text: 'hello' }] }]);
  });

  it('GEMINI-2 assistant maps to Gemini model', () => {
    const mapped = mapLlmMessagesToGemini([{ role: 'assistant', content: 'hi' }]);
    expect(mapped.contents).toEqual([{ role: 'model', parts: [{ text: 'hi' }] }]);
  });

  it('GEMINI-3 conversation order is preserved', () => {
    const mapped = mapLlmMessagesToGemini([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
    ]);
    expect(mapped.contents.map((item) => item.role)).toEqual([
      'user',
      'model',
      'user',
      'model',
      'user',
    ]);
    expect(mapped.contents.map((item) => item.parts[0]?.text)).toEqual([
      'u1',
      'a1',
      'u2',
      'a2',
      'u3',
    ]);
  });

  it('GEMINI-4 system goes to systemInstruction, not contents', () => {
    const mapped = mapLlmMessagesToGemini([
      { role: 'system', content: 'You are Jarvis' },
      { role: 'user', content: 'Привет' },
    ]);
    expect(mapped.systemInstruction).toBe('You are Jarvis');
    expect(mapped.contents).toEqual([{ role: 'user', parts: [{ text: 'Привет' }] }]);
    expect(mapped.contents.some((item) => item.parts[0]?.text.includes('You are Jarvis'))).toBe(
      false,
    );
  });

  it('GEMINI-5 multiple system messages are joined deterministically', () => {
    const mapped = mapLlmMessagesToGemini([
      { role: 'system', content: 'SYSTEM MESSAGE 1' },
      { role: 'system', content: 'SYSTEM MESSAGE 2' },
      { role: 'user', content: 'q' },
    ]);
    expect(mapped.systemInstruction).toBe('SYSTEM MESSAGE 1\n\nSYSTEM MESSAGE 2');
    expect(mapped.contents).toHaveLength(1);
  });

  it('GEMINI-6 no system messages → systemInstruction omitted', () => {
    const mapped = mapLlmMessagesToGemini([{ role: 'user', content: 'only user' }]);
    expect(mapped.systemInstruction).toBeUndefined();
    expect(mapped.contents).toHaveLength(1);
  });
});

describe('Gemini config and model', () => {
  it('GEMINI-7 configured model is passed to client', async () => {
    const client = new FakeGeminiClient();
    client.nextOutput = { text: 'ответ' };
    const provider = new GeminiLlmProvider(
      { apiKey: 'test-key', model: 'configured-model-name' },
      client,
    );

    await provider.generate({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(client.calls[0]?.model).toBe('configured-model-name');
  });

  it('GEMINI-8 missing API key fails safely', () => {
    expect(() => loadGeminiConfig({ GEMINI_MODEL: 'gemini-3.1-pro-preview' })).toThrow(
      GeminiConfigError,
    );
    try {
      loadGeminiConfig({ GEMINI_MODEL: 'gemini-3.1-pro-preview', OTHER_SECRET: 'leak' });
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiConfigError);
      expect((error as Error).message).toContain('GEMINI_API_KEY');
      expect((error as Error).message).not.toContain('leak');
    }
  });

  it('GEMINI-9 missing model fails without silent default', () => {
    expect(() => loadGeminiConfig({ GEMINI_API_KEY: 'k' })).toThrow(GeminiConfigError);
    expect(() => loadGeminiConfig({ GEMINI_API_KEY: 'k' })).toThrow(/GEMINI_MODEL/);
  });
});

describe('Gemini response and errors', () => {
  it('GEMINI-10 returns usable text', async () => {
    const client = new FakeGeminiClient();
    client.nextOutput = { text: 'Здравствуйте' };
    const provider = new GeminiLlmProvider({ apiKey: 'k', model: 'm' }, client);

    const response = await provider.generate({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response).toEqual({ text: 'Здравствуйте' });
  });

  it('GEMINI-11 empty response is controlled error', async () => {
    const client = new FakeGeminiClient();
    client.nextOutput = { text: '   ' };
    const provider = new GeminiLlmProvider({ apiKey: 'k', model: 'm' }, client);

    await expect(
      provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({
      name: 'GeminiProviderError',
      code: 'EMPTY_RESPONSE',
    });
  });

  it('GEMINI-12 API failure is wrapped without leaking secrets', async () => {
    const client = new FakeGeminiClient();
    client.nextError = new Error('upstream failed key=super-secret-api-key');
    const provider = new GeminiLlmProvider(
      { apiKey: 'super-secret-api-key', model: 'gemini-test' },
      client,
    );

    try {
      await provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiProviderError);
      const providerError = error as GeminiProviderError;
      expect(providerError.code).toBe('API_ERROR');
      expect(providerError.message).toBe('Gemini API request failed');
      expect(providerError.message).not.toContain('super-secret-api-key');
      expect(providerError.model).toBe('gemini-test');
    }
  });
});
