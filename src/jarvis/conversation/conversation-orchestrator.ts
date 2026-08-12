import { randomUUID } from 'node:crypto';

import type { Conversation } from '../../domain/conversation.js';
import { ConversationNotFoundError, InvalidOperationError } from '../../domain/errors.js';
import type { Message } from '../../domain/message.js';
import { isToolCallingLlmProvider, type LlmProvider } from '../../llm/llm-provider.js';
import type { LlmToolConversationMessage } from '../../llm/tool-calling-types.js';
import type { ConversationStore } from '../../storage/conversation-store.js';

import type { SystemPromptProvider } from '../system-prompt-provider.js';
import {
  MAX_TOOL_CALLS_PER_TURN,
  MAX_TOOL_ROUNDS,
  type ToolRuntime,
} from '../tools/index.js';

import { mapMessagesToLlm } from './map-messages-to-llm.js';

export interface IncomingCustomerMessageInput {
  conversationId: string;
  messageId: string;
  text: string;
  createdAt?: string;
  externalMessageId?: string;
}

export type HandleIncomingMessageResult =
  | {
      status: 'ai_replied';
      conversation: Conversation;
      customerMessage: Message;
      aiMessage: Message;
      replyText: string;
    }
  | {
      status: 'human_owned';
      conversation: Conversation;
      customerMessage: Message;
    };

export interface ConversationOrchestratorOptions {
  toolRuntime?: ToolRuntime;
  maxToolRounds?: number;
  maxToolCallsPerTurn?: number;
}

export class ConversationOrchestrator {
  private readonly toolRuntime: ToolRuntime | undefined;
  private readonly maxToolRounds: number;
  private readonly maxToolCallsPerTurn: number;

  constructor(
    private readonly store: ConversationStore,
    private readonly llm: LlmProvider,
    private readonly systemPromptProvider: SystemPromptProvider,
    options: ConversationOrchestratorOptions = {},
  ) {
    this.toolRuntime = options.toolRuntime;
    this.maxToolRounds = options.maxToolRounds ?? MAX_TOOL_ROUNDS;
    this.maxToolCallsPerTurn = options.maxToolCallsPerTurn ?? MAX_TOOL_CALLS_PER_TURN;
  }

  async handleIncomingMessage(
    input: IncomingCustomerMessageInput,
  ): Promise<HandleIncomingMessageResult> {
    const text = input.text.trim();
    if (text === '') {
      throw new InvalidOperationError('Incoming message text must not be empty');
    }

    const conversation = await this.store.getConversation(input.conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }

    const createdAt = input.createdAt ?? new Date().toISOString();
    const customerMessage = await this.store.appendMessage({
      messageId: input.messageId,
      conversationId: conversation.conversationId,
      channel: conversation.channel,
      sender: 'CUSTOMER',
      text,
      createdAt,
      ...(input.externalMessageId !== undefined
        ? { externalMessageId: input.externalMessageId }
        : {}),
    });

    if (conversation.mode === 'HUMAN') {
      return {
        status: 'human_owned',
        conversation,
        customerMessage,
      };
    }

    const history = await this.store.getMessages(conversation.conversationId);
    const systemPrompt = await this.systemPromptProvider.getSystemPrompt();
    const baseMessages: LlmToolConversationMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...mapMessagesToLlm(history),
    ];

    const replyText = this.toolRuntime
      ? await this.runToolAwareTurn(conversation.conversationId, baseMessages)
      : await this.runTextOnlyTurn(conversation.conversationId, baseMessages);

    const aiCreatedAt = new Date(
      Math.max(Date.now(), Date.parse(customerMessage.createdAt) + 1),
    ).toISOString();

    const aiMessage = await this.store.appendMessage({
      messageId: randomUUID(),
      conversationId: conversation.conversationId,
      channel: conversation.channel,
      sender: 'AI',
      text: replyText,
      createdAt: aiCreatedAt,
    });

    return {
      status: 'ai_replied',
      conversation,
      customerMessage,
      aiMessage,
      replyText,
    };
  }

  private async runTextOnlyTurn(
    conversationId: string,
    messages: LlmToolConversationMessage[],
  ): Promise<string> {
    const llmResponse = await this.llm.generate({
      conversationId,
      messages: messages.map((message) => {
        if (message.role === 'tool') {
          throw new InvalidOperationError('Tool messages require tool-capable orchestration');
        }
        if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
          throw new InvalidOperationError('Tool calls require tool-capable orchestration');
        }
        return {
          role: message.role,
          content: message.content ?? '',
        };
      }),
    });

    const replyText = llmResponse.text.trim();
    if (replyText === '') {
      throw new InvalidOperationError('LLM returned an empty response');
    }
    return replyText;
  }

  private async runToolAwareTurn(
    conversationId: string,
    initialMessages: LlmToolConversationMessage[],
  ): Promise<string> {
    if (!this.toolRuntime) {
      throw new InvalidOperationError('Tool runtime is not configured');
    }
    if (!isToolCallingLlmProvider(this.llm)) {
      throw new InvalidOperationError(
        'Tool runtime is enabled but LLM provider does not support tool calling',
      );
    }

    const messages: LlmToolConversationMessage[] = [...initialMessages];
    let toolCallsExecuted = 0;
    let completedToolRound = false;

    for (let round = 0; round < this.maxToolRounds; round += 1) {
      const response = await this.llm.generateWithTools({
        conversationId,
        messages,
        tools: this.toolRuntime.getToolDefinitions(),
        toolChoice: completedToolRound ? 'none' : 'auto',
      });

      if (response.type === 'text') {
        const replyText = response.text.trim();
        if (replyText === '') {
          throw new InvalidOperationError('LLM returned an empty response');
        }
        return replyText;
      }

      if (response.toolCalls.length === 0) {
        throw new InvalidOperationError('LLM returned tool_calls without usable calls');
      }

      if (toolCallsExecuted + response.toolCalls.length > this.maxToolCallsPerTurn) {
        throw new InvalidOperationError('TOOL_LOOP_LIMIT: too many tool calls in one turn');
      }

      messages.push({
        role: 'assistant',
        ...(response.content !== undefined ? { content: response.content } : {}),
        toolCalls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        toolCallsExecuted += 1;
        const result = await this.toolRuntime.executeToolCall(call);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: this.toolRuntime.serializeToolResult(result),
        });
      }
      completedToolRound = true;
    }

    throw new InvalidOperationError('TOOL_LOOP_LIMIT: maximum tool rounds exceeded');
  }
}
