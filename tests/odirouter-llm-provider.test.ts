import {
  DEFAULT_ODIROUTER_BASE_URL,
  OdiRouterConfigError,
  OdiRouterLlmProvider,
  OdiRouterProviderError,
  filterTextLlmCatalogModels,
  loadOdiRouterConfig,
  mapLlmMessagesToOdiRouter,
  OpenAiCompatibleOdiRouterClient,
  parseOdiRouterCatalogPayload,
  toOdiRouterModelShortlist,
  type OdiRouterChatClient,
  type OdiRouterChatCompletionInput,
  type OdiRouterChatCompletionOutput,
} from '../src/llm/index.js';
import { describe, expect, it } from 'vitest';

class FakeOdiRouterClient implements OdiRouterChatClient {
  readonly calls: OdiRouterChatCompletionInput[] = [];
  nextOutput: OdiRouterChatCompletionOutput = { text: 'ok' };
  nextError: Error | undefined;

  async createChatCompletion(
    input: OdiRouterChatCompletionInput,
  ): Promise<OdiRouterChatCompletionOutput> {
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

describe('OdiRouter message mapping', () => {
  it('ODIROUTER-1 system → system', () => {
    expect(mapLlmMessagesToOdiRouter([{ role: 'system', content: 'rules' }])).toEqual([
      { role: 'system', content: 'rules' },
    ]);
  });

  it('ODIROUTER-2 user → user', () => {
    expect(mapLlmMessagesToOdiRouter([{ role: 'user', content: 'hello' }])).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });

  it('ODIROUTER-3 assistant → assistant', () => {
    expect(mapLlmMessagesToOdiRouter([{ role: 'assistant', content: 'hi' }])).toEqual([
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('ODIROUTER-4 message order preserved', () => {
    const mapped = mapLlmMessagesToOdiRouter([
      { role: 'system', content: 's' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ]);
    expect(mapped.map((item) => item.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(mapped.map((item) => item.content)).toEqual(['s', 'u1', 'a1', 'u2']);
  });
});

describe('OdiRouter config and model', () => {
  it('ODIROUTER-5 configured model is passed to client', async () => {
    const client = new FakeOdiRouterClient();
    client.nextOutput = { text: 'ответ' };
    const provider = new OdiRouterLlmProvider(
      {
        apiKey: 'test-key',
        model: 'exact-catalog-model-id',
        baseUrl: DEFAULT_ODIROUTER_BASE_URL,
      },
      client,
    );

    await provider.generate({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(client.calls[0]?.model).toBe('exact-catalog-model-id');
  });

  it('ODIROUTER-6 configured base URL used', () => {
    expect(
      loadOdiRouterConfig({
        ODIROUTER_API_KEY: 'k',
        ODIROUTER_MODEL: 'model-id',
      }).baseUrl,
    ).toBe(DEFAULT_ODIROUTER_BASE_URL);

    expect(
      loadOdiRouterConfig({
        ODIROUTER_API_KEY: 'k',
        ODIROUTER_MODEL: 'model-id',
        ODIROUTER_BASE_URL: 'https://example.test/v1',
      }).baseUrl,
    ).toBe('https://example.test/v1');

    const client = new OpenAiCompatibleOdiRouterClient({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
    });
    expect(client.baseUrl).toBe('https://example.test/v1');
  });

  it('ODIROUTER-7 missing API key → safe config error', () => {
    expect(() => loadOdiRouterConfig({ ODIROUTER_MODEL: 'm' })).toThrow(OdiRouterConfigError);
    try {
      loadOdiRouterConfig({ ODIROUTER_MODEL: 'm', OTHER_SECRET: 'leak' });
    } catch (error) {
      expect(error).toBeInstanceOf(OdiRouterConfigError);
      expect((error as Error).message).toContain('ODIROUTER_API_KEY');
      expect((error as Error).message).not.toContain('leak');
    }
  });

  it('ODIROUTER-8 missing model → safe config error', () => {
    expect(() => loadOdiRouterConfig({ ODIROUTER_API_KEY: 'k' })).toThrow(OdiRouterConfigError);
    expect(() => loadOdiRouterConfig({ ODIROUTER_API_KEY: 'k' })).toThrow(/ODIROUTER_MODEL/);
  });
});

describe('OdiRouter response and errors', () => {
  it('ODIROUTER-9 text response', async () => {
    const client = new FakeOdiRouterClient();
    client.nextOutput = { text: 'Здравствуйте' };
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: DEFAULT_ODIROUTER_BASE_URL },
      client,
    );

    await expect(
      provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).resolves.toEqual({ text: 'Здравствуйте' });
  });

  it('ODIROUTER-10 empty response fail closed', async () => {
    const client = new FakeOdiRouterClient();
    client.nextOutput = { text: '   ' };
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: DEFAULT_ODIROUTER_BASE_URL },
      client,
    );

    await expect(
      provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({
      name: 'OdiRouterProviderError',
      code: 'EMPTY_RESPONSE',
    });
  });

  it('ODIROUTER-11 API failure wrapped safely', async () => {
    const client = new FakeOdiRouterClient();
    client.nextError = Object.assign(new Error('upstream'), { status: 502 });
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'catalog-model', baseUrl: DEFAULT_ODIROUTER_BASE_URL },
      client,
    );

    try {
      await provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(OdiRouterProviderError);
      const providerError = error as OdiRouterProviderError;
      expect(providerError.code).toBe('API_ERROR');
      expect(providerError.message).toBe('OdiRouter API request failed');
      expect(providerError.model).toBe('catalog-model');
      expect(providerError.status).toBe(502);
      expect(providerError.provider).toBe('odirouter');
    }
  });

  it('ODIROUTER-12 API key not present in error', async () => {
    const secret = 'odi-super-secret-key';
    const client = new FakeOdiRouterClient();
    client.nextError = new Error(`auth failed for ${secret}`);
    const provider = new OdiRouterLlmProvider(
      { apiKey: secret, model: 'm', baseUrl: DEFAULT_ODIROUTER_BASE_URL },
      client,
    );

    try {
      await provider.generate({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(OdiRouterProviderError);
      expect((error as Error).message).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });
});

describe('OdiRouter catalog helpers', () => {
  it('ODIROUTER-MODELS-1 only category=llm retained when category present', () => {
    const models = parseOdiRouterCatalogPayload({
      data: [
        { id: 'llm-1', category: 'llm', input_modalities: ['text'], output_modalities: ['text'] },
        {
          id: 'image-1',
          category: 'image',
          input_modalities: ['text'],
          output_modalities: ['image'],
        },
      ],
    });
    expect(filterTextLlmCatalogModels(models).map((item) => item.id)).toEqual(['llm-1']);
  });

  it('ODIROUTER-MODELS-2 text input/output retained', () => {
    const models = parseOdiRouterCatalogPayload({
      data: [
        {
          id: 'text-llm',
          category: 'llm',
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
        {
          id: 'vision-only-out',
          category: 'llm',
          input_modalities: ['text'],
          output_modalities: ['image'],
        },
      ],
    });
    expect(filterTextLlmCatalogModels(models).map((item) => item.id)).toEqual(['text-llm']);
  });

  it('ODIROUTER-MODELS-3 safe fields only in shortlist', () => {
    const shortlist = toOdiRouterModelShortlist(
      filterTextLlmCatalogModels(
        parseOdiRouterCatalogPayload({
          data: [
            {
              id: 'prov/model-a',
              name: 'Model A',
              provider: 'prov',
              category: 'llm',
              features: ['tool_calling', 'streaming'],
              context_length: 128000,
              max_output_tokens: 8192,
              input_modalities: ['text'],
              output_modalities: ['text'],
              free: true,
              secret_field: 'should-not-leak',
            },
          ],
        }),
      ),
    );

    expect(shortlist).toEqual([
      {
        id: 'prov/model-a',
        name: 'Model A',
        provider: 'prov',
        features: ['tool_calling', 'streaming'],
        context_length: 128000,
        max_output_tokens: 8192,
        toolCalling: true,
        free: true,
      },
    ]);
    expect(JSON.stringify(shortlist)).not.toContain('secret_field');
  });
});
