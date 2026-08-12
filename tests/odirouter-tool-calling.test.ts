import {
  mapNeutralToolsToOdiRouter,
  mapOdiRouterToolCallsToNeutral,
  mapToolConversationToOdiRouter,
  OdiRouterLlmProvider,
  type OdiRouterChatClient,
  type OdiRouterChatCompletionInput,
  type OdiRouterChatCompletionOutput,
} from '../src/llm/index.js';
import { createCalculateOrderToolDefinition } from '../src/jarvis/tools/index.js';
import { describe, expect, it } from 'vitest';

class FakeOdiToolClient implements OdiRouterChatClient {
  readonly calls: OdiRouterChatCompletionInput[] = [];
  next: OdiRouterChatCompletionOutput = { text: 'ok', toolCalls: [] };

  async createChatCompletion(
    input: OdiRouterChatCompletionInput,
  ): Promise<OdiRouterChatCompletionOutput> {
    this.calls.push(structuredClone(input));
    return this.next;
  }
}

describe('OdiRouter tool calling mapping', () => {
  it('ODI-TOOL-1 neutral definition → OpenAI tools format', () => {
    const mapped = mapNeutralToolsToOdiRouter([createCalculateOrderToolDefinition()]);
    expect(mapped).toEqual([
      {
        type: 'function',
        function: {
          name: 'calculate_order',
          description: expect.any(String),
          parameters: expect.any(Object),
        },
      },
    ]);
  });

  it('ODI-TOOL-2 tool_choice=auto', async () => {
    const client = new FakeOdiToolClient();
    client.next = { text: 'hi', toolCalls: [] };
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'grok-4.5', baseUrl: 'https://api.odirouter.ai/v1' },
      client,
    );
    await provider.generateWithTools({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'price?' }],
      tools: [createCalculateOrderToolDefinition()],
    });
    expect(client.calls[0]?.tool_choice).toBe('auto');
    expect(client.calls[0]?.tools?.[0]?.type).toBe('function');
  });

  it('ODI-TOOL-2b tool_choice=none is forwarded', async () => {
    const client = new FakeOdiToolClient();
    client.next = { text: 'итог', toolCalls: [] };
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: 'https://api.odirouter.ai/v1' },
      client,
    );
    await provider.generateWithTools({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'price?' }],
      tools: [createCalculateOrderToolDefinition()],
      toolChoice: 'none',
    });
    expect(client.calls[0]?.tool_choice).toBe('none');
  });

  it('ODI-TOOL-3 tool_calls response mapped to neutral calls', async () => {
    const client = new FakeOdiToolClient();
    client.next = {
      text: undefined,
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'calculate_order', arguments: '{"customerType":"retail"}' },
        },
      ],
    };
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: 'https://api.odirouter.ai/v1' },
      client,
    );
    const response = await provider.generateWithTools({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [createCalculateOrderToolDefinition()],
    });
    expect(response).toEqual({
      type: 'tool_calls',
      toolCalls: [
        {
          id: 'call_1',
          name: 'calculate_order',
          argumentsJson: '{"customerType":"retail"}',
        },
      ],
    });
  });

  it('ODI-TOOL-4 function.arguments preserved as string until validation', () => {
    const mapped = mapOdiRouterToolCallsToNeutral([
      {
        id: 'x',
        type: 'function',
        function: { name: 'calculate_order', arguments: '{not-json' },
      },
    ]);
    expect(mapped[0]?.argumentsJson).toBe('{not-json');
  });

  it('ODI-TOOL-5 assistant tool-call follow-up mapping', () => {
    const mapped = mapToolConversationToOdiRouter([
      {
        role: 'assistant',
        toolCalls: [
          { id: 'call_1', name: 'calculate_order', argumentsJson: '{"a":1}' },
        ],
      },
    ]);
    expect(mapped[0]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'calculate_order', arguments: '{"a":1}' },
        },
      ],
    });
  });

  it('ODI-TOOL-6 role=tool + tool_call_id mapping', () => {
    const mapped = mapToolConversationToOdiRouter([
      { role: 'tool', toolCallId: 'call_1', content: '{"status":"calculated"}' },
    ]);
    expect(mapped[0]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"status":"calculated"}',
    });
  });

  it('ODI-TOOL-7 text-only response still works', async () => {
    const client = new FakeOdiToolClient();
    client.next = { text: 'Без расчёта', toolCalls: [] };
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: 'https://api.odirouter.ai/v1' },
      client,
    );
    await expect(
      provider.generateWithTools({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'привет' }],
        tools: [createCalculateOrderToolDefinition()],
      }),
    ).resolves.toEqual({ type: 'text', text: 'Без расчёта' });
  });

  it('ODI-TOOL-8 empty text + no tool_calls fails closed', async () => {
    const client = new FakeOdiToolClient();
    client.next = { text: '  ', toolCalls: [] };
    const provider = new OdiRouterLlmProvider(
      { apiKey: 'k', model: 'm', baseUrl: 'https://api.odirouter.ai/v1' },
      client,
    );
    await expect(
      provider.generateWithTools({
        conversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [createCalculateOrderToolDefinition()],
      }),
    ).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });
});
