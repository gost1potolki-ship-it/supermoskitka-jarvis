import { randomUUID } from 'node:crypto';

import type { Conversation } from '../../domain/conversation.js';
import { ConversationNotFoundError, InvalidOperationError } from '../../domain/errors.js';
import type { Message } from '../../domain/message.js';
import type { OrderMemory } from '../../domain/order-memory.js';
import { isToolCallingLlmProvider, type LlmProvider } from '../../llm/llm-provider.js';
import type { LlmToolConversationMessage } from '../../llm/tool-calling-types.js';
import type { ConversationStore } from '../../storage/conversation-store.js';
import type { OrderMemoryStore } from '../../storage/order-memory-store.js';

import type { SystemPromptProvider } from '../system-prompt-provider.js';
import {
  applyValidatedExtraction,
  buildOrderMemoryContext,
  type FactExtractionContextMessage,
  type FactExtractor,
  type MemoryApplyDiagnostics,
} from '../extraction/index.js';
import { createOrderMemory } from '../memory/index.js';
import {
  PriceIntegrityGuard,
  type CalculationMode,
  type CalculationTurnState,
  type PriceIntegrityReason,
} from '../pricing/index.js';
import {
  MAX_TOOL_CALLS_PER_TURN,
  MAX_TOOL_ROUNDS,
  type SafeToolResult,
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

export interface PriceIntegrityDiagnostics {
  accepted: boolean;
  reason: PriceIntegrityReason;
  candidateText: string;
  turnKind: CalculationTurnState['kind'];
  authoritativeTotal?: number;
  mode?: CalculationMode;
}

export interface FactExtractionDiagnostics {
  called: boolean;
  failed: boolean;
  appliedFields: string[];
  issues: MemoryApplyDiagnostics['issues'];
  skipped: MemoryApplyDiagnostics['skipped'];
  errorMessage?: string;
}

export type HandleIncomingMessageResult =
  | {
      status: 'ai_replied';
      conversation: Conversation;
      customerMessage: Message;
      aiMessage: Message;
      replyText: string;
      priceIntegrity?: PriceIntegrityDiagnostics;
      factExtraction?: FactExtractionDiagnostics;
      orderMemory?: OrderMemory;
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
  priceIntegrityGuard?: PriceIntegrityGuard;
  factExtractor?: FactExtractor;
  orderMemoryStore?: OrderMemoryStore;
}

interface ToolAwareTurnResult {
  replyText: string;
  priceIntegrity?: PriceIntegrityDiagnostics;
}

function toTurnState(result: SafeToolResult): CalculationTurnState {
  if (result.status === 'calculated') {
    if (
      typeof result.total === 'number' &&
      Number.isInteger(result.total) &&
      (result.mode === 'PRODUCT_ONLY' || result.mode === 'PRELIMINARY_ALL_IN')
    ) {
      return { kind: 'calculated', total: result.total, mode: result.mode };
    }
    return { kind: 'failed' };
  }
  if (result.status === 'needs_input') {
    return { kind: 'needs_input' };
  }
  if (result.status === 'unsupported') {
    return { kind: 'unsupported' };
  }
  return { kind: 'failed' };
}

function toExtractionContext(messages: readonly Message[]): FactExtractionContextMessage[] {
  return messages.map((message) => ({
    role:
      message.sender === 'CUSTOMER'
        ? 'customer'
        : message.sender === 'AI'
          ? 'ai'
          : 'human',
    text: message.text,
    messageId: message.messageId,
  }));
}

export class ConversationOrchestrator {
  private readonly toolRuntime: ToolRuntime | undefined;
  private readonly maxToolRounds: number;
  private readonly maxToolCallsPerTurn: number;
  private readonly priceIntegrityGuard: PriceIntegrityGuard;
  private readonly factExtractor: FactExtractor | undefined;
  private readonly orderMemoryStore: OrderMemoryStore | undefined;

  constructor(
    private readonly store: ConversationStore,
    private readonly llm: LlmProvider,
    private readonly systemPromptProvider: SystemPromptProvider,
    options: ConversationOrchestratorOptions = {},
  ) {
    this.toolRuntime = options.toolRuntime;
    this.maxToolRounds = options.maxToolRounds ?? MAX_TOOL_ROUNDS;
    this.maxToolCallsPerTurn = options.maxToolCallsPerTurn ?? MAX_TOOL_CALLS_PER_TURN;
    this.priceIntegrityGuard = options.priceIntegrityGuard ?? new PriceIntegrityGuard();
    this.factExtractor = options.factExtractor;
    this.orderMemoryStore = options.orderMemoryStore;
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

    let factExtraction: FactExtractionDiagnostics | undefined;
    let orderMemory: OrderMemory | undefined;
    let memoryContext: string | undefined;

    if (this.factExtractor && this.orderMemoryStore) {
      const existing = await this.orderMemoryStore.get(conversation.conversationId);
      let memory =
        existing ??
        createOrderMemory({
          orderId: conversation.conversationId,
          conversationId: conversation.conversationId,
          now: customerMessage.createdAt,
        });

      const history = await this.store.getMessages(conversation.conversationId);
      factExtraction = {
        called: true,
        failed: false,
        appliedFields: [],
        issues: [],
        skipped: [],
      };

      try {
        const extraction = await this.factExtractor.extract({
          conversationId: conversation.conversationId,
          currentMessage: {
            id: customerMessage.messageId,
            text: customerMessage.text,
            channel: conversation.channel,
            timestamp: customerMessage.createdAt,
          },
          memorySnapshot: structuredClone(memory),
          recentContext: toExtractionContext(history),
        });
        const memoryBeforeApply = structuredClone(memory);
        const applied = applyValidatedExtraction(memory, extraction, {
          conversationId: conversation.conversationId,
          currentMessage: {
            id: customerMessage.messageId,
            text: customerMessage.text,
            channel: conversation.channel,
            timestamp: customerMessage.createdAt,
          },
          memorySnapshot: memory,
          recentContext: toExtractionContext(history),
        });
        factExtraction.appliedFields = applied.diagnostics.appliedFields;
        factExtraction.issues = applied.diagnostics.issues;
        factExtraction.skipped = applied.diagnostics.skipped;
        try {
          memory = await this.orderMemoryStore.save(applied.memory);
        } catch (persistError) {
          // Customer message is already stored; do not pretend OrderMemory updated.
          factExtraction.failed = true;
          factExtraction.errorMessage =
            persistError instanceof Error
              ? persistError.message
              : 'Order memory persistence failed';
          factExtraction.issues = [
            ...factExtraction.issues,
            {
              code: 'persistence_failed',
              message: 'Order memory persistence failed; continuing without updated memory.',
            },
          ];
          memory = memoryBeforeApply;
        }
      } catch (error) {
        factExtraction.failed = true;
        factExtraction.errorMessage =
          error instanceof Error ? error.message : 'Fact extraction failed';
        // Memory remains unchanged (do not save partial invalid state).
      }

      orderMemory = memory;
      memoryContext = buildOrderMemoryContext(memory);
    }

    const history = await this.store.getMessages(conversation.conversationId);
    const systemPrompt = await this.systemPromptProvider.getSystemPrompt();
    const baseMessages: LlmToolConversationMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...(memoryContext
        ? ([
            {
              role: 'user',
              content: memoryContext,
            },
          ] as const)
        : []),
      ...mapMessagesToLlm(history),
    ];

    const turn = this.toolRuntime
      ? await this.runToolAwareTurn(conversation.conversationId, baseMessages)
      : {
          replyText: await this.runTextOnlyTurn(conversation.conversationId, baseMessages),
        };

    const aiCreatedAt = new Date(
      Math.max(Date.now(), Date.parse(customerMessage.createdAt) + 1),
    ).toISOString();

    const aiMessage = await this.store.appendMessage({
      messageId: randomUUID(),
      conversationId: conversation.conversationId,
      channel: conversation.channel,
      sender: 'AI',
      text: turn.replyText,
      createdAt: aiCreatedAt,
    });

    return {
      status: 'ai_replied',
      conversation,
      customerMessage,
      aiMessage,
      replyText: turn.replyText,
      ...(turn.priceIntegrity !== undefined
        ? { priceIntegrity: turn.priceIntegrity }
        : {}),
      ...(factExtraction !== undefined ? { factExtraction } : {}),
      ...(orderMemory !== undefined ? { orderMemory } : {}),
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
  ): Promise<ToolAwareTurnResult> {
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
    let turnState: CalculationTurnState = { kind: 'none' };

    for (let round = 0; round < this.maxToolRounds; round += 1) {
      const response = await this.llm.generateWithTools({
        conversationId,
        messages,
        tools: this.toolRuntime.getToolDefinitions(),
        toolChoice: completedToolRound ? 'none' : 'auto',
      });

      if (response.type === 'text') {
        const candidateText = response.text.trim();
        if (candidateText === '') {
          throw new InvalidOperationError('LLM returned an empty response');
        }
        const guarded = this.priceIntegrityGuard.enforceForTurn(candidateText, turnState);
        if (!guarded) {
          return { replyText: candidateText };
        }
        return {
          replyText: guarded.outgoingText,
          priceIntegrity: {
            accepted: guarded.accepted,
            reason: guarded.reason,
            candidateText: guarded.candidateText,
            turnKind: turnState.kind,
            ...(turnState.kind === 'calculated'
              ? {
                  authoritativeTotal: turnState.total,
                  mode: turnState.mode,
                }
              : {}),
          },
        };
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
        turnState = toTurnState(result);
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
