import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DeepSeekConfigError,
  DeepSeekLlmProvider,
  DeepSeekProviderError,
  loadDeepSeekConfig,
  mapLlmMessagesToDeepSeek,
  OpenAiCompatibleDeepSeekClient,
  type DeepSeekChatClient,
  type DeepSeekChatCompletionInput,
  type DeepSeekChatCompletionOutput,
} from '../src/llm/index.js';
import { describe, expect, it } from 'vitest';

class FakeDeepSeekClient implements DeepSeekChatClient {
  readonly calls: DeepSeekChatCompletionInput[] = [];
  nextOutput: DeepSeekChatCompletionOutput = { text: 'ok' };
  nextError: Error | undefined;

  async createChatCompletion(
    input: DeepSeekChatCompletionInput,
  ): Promise<DeepSeekChatCompletionOutput> {
    this.calls.push({
      model: input.model,
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });
    if (this.nextError) {
      throw this.nextError;
    }
    return this.nextOutput;
  }
}

describe('DeepSeek message mapping', () => {
  it('DEEPSEEK-1 system → system', () => {
    expect(mapLlmMessagesToDeepSeek([{ role: 'system', content: 'rules' }])).toEqual([
      { role: 'system', content: 'rules' },
    ]);
  });

  it('DEEPSEEK-2 user → user', () => {
    expect(mapLlmMessagesToDeepSeek([{ role: 'user', content: 'hello' }])).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });

  it('DEEPSEEK-3 assistant → assistant', () => {
    expect(mapLlmMessagesToDeepSeek([{ role: 'assistant', content: 'hi' }])).toEqual([
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('DEEPSEEK-4 order preserved', () => {
    const mapped = mapLlmMessagesToDeepSeek([
      { role: 'system', content: 's' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ]);
    expect(mapped.map((item) => item.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(mapped.map((item) => item.content)).toEqual(['s', 'u1', 'a1', 'u2']);
  });
});

describe('DeepSeek config and model', () => {
  it('DEEPSEEK-5 configured model is passed to client', async () => {
    const client = new FakeDeepSeekClient();
    client.nextOutput = { text: 'ответ' };
    const provider = new DeepSeekLlmProvider(
      {
        apiKey: 'test-key',
        model: 'deepseek-configured-model',
        baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      },
      client,
    );

    await provider.generate({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(client.calls[0]?.model).toBe('deepseek-configured-model');
  });

  it('DEEPSEEK-6 configured base URL used / factory default', () => {
    expect(
      loadDeepSeekConfig({
        DEEPSEEK_API_KEY: 'k',
        DEEPSEEK_MODEL: 'deepseek-v4-pro',
      }).baseUrl,
    ).toBe(DEFAULT_DEEPSEEK_BASE_URL);

    expect(
      loadDeepSeekConfig({
        DEEPSEEK_API_KEY: 'k',
        DEEPSEEK_MODEL: 'deepseek-v4-pro',
        DEEPSEEK_BASE_URL: 'https://example.test/v1',
      }).baseUrl,
    ).toBe('https://example.test/v1');

    const client = new OpenAiCompatibleDeepSeekClient({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
    });
    expect(client.baseUrl).toBe('https://example.test/v1');
  });

  it('DEEPSEEK-7 missing API key fails safely', () => {
    expect(() => loadDeepSeekConfig({ DEEPSEEK_MODEL: 'deepseek-v4-pro' })).toThrow(
      DeepSeekConfigError,
    );
    try {
      loadDeepSeekConfig({ DEEPSEEK_MODEL: 'deepseek-v4-pro', OTHER_SECRET: 'leak' });
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekConfigError);
      expect((error as Error).message).toContain('DEEPSEEK_API_KEY');
      expect((error as Error).message).not.toContain('leak');
    }
  });

  it('DEEPSEEK-8 missing model fails without silent default', () => {
    expect(() => loadDeepSeekConfig({ DEEPSEEK_API_KEY: 'k' })).toThrow(DeepSeekConfigError);
    expect(() => loadDeepSeekConfig({ DEEPSEEK_API_KEY: 'k' })).toThrow(/DEEPSEEK_MODEL/);
  });
});

describe('DeepSeek response and errors', () => {
  it('DEEPSEEK-9 returns usable text', async () => {
    const client = new FakeDeepSeekClient();
    client.nextOutput = { text: 'Здравствуйте' };
    const provider = new DeepSeekLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: DEFAULT_DEEPSEEK_BASE_URL },
      client,
    );

    await expect(
      provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).resolves.toEqual({ text: 'Здравствуйте' });
  });

  it('DEEPSEEK-10 empty response is controlled error', async () => {
    const client = new FakeDeepSeekClient();
    client.nextOutput = { text: '   ' };
    const provider = new DeepSeekLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: DEFAULT_DEEPSEEK_BASE_URL },
      client,
    );

    await expect(
      provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({
      name: 'DeepSeekProviderError',
      code: 'EMPTY_RESPONSE',
    });
  });

  it('DEEPSEEK-11 API failure is wrapped safely', async () => {
    const client = new FakeDeepSeekClient();
    const upstream = Object.assign(new Error('upstream failed'), { status: 429 });
    client.nextError = upstream;
    const provider = new DeepSeekLlmProvider(
      { apiKey: 'k', model: 'deepseek-v4-pro', baseUrl: DEFAULT_DEEPSEEK_BASE_URL },
      client,
    );

    try {
      await provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekProviderError);
      const providerError = error as DeepSeekProviderError;
      expect(providerError.code).toBe('API_ERROR');
      expect(providerError.message).toBe('DeepSeek API request failed');
      expect(providerError.model).toBe('deepseek-v4-pro');
      expect(providerError.status).toBe(429);
    }
  });

  it('DEEPSEEK-12 API key is not present in error message', async () => {
    const secret = 'sk-super-secret-deepseek-key';
    const client = new FakeDeepSeekClient();
    client.nextError = new Error(`auth failed for ${secret}`);
    const provider = new DeepSeekLlmProvider(
      { apiKey: secret, model: 'm', baseUrl: DEFAULT_DEEPSEEK_BASE_URL },
      client,
    );

    try {
      await provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekProviderError);
      expect((error as Error).message).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });
});
