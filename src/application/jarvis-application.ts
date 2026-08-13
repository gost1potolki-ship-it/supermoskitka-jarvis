import type { Channel } from '../domain/channel.js';
import { CHANNELS } from '../domain/channel.js';
import type { ConversationMode } from '../domain/conversation.js';
import {
  ConversationNotFoundError,
  InvalidOperationError,
  PersistenceConflictError,
} from '../domain/errors.js';
import type { Message } from '../domain/message.js';
import type { MeasurementActionPolicy } from '../domain/lead-readiness.js';
import type { ConversationOrchestrator } from '../jarvis/conversation/index.js';
import { createOrderMemory } from '../jarvis/memory/index.js';
import {
  DeepSeekProviderError,
  GeminiProviderError,
  OdiRouterProviderError,
} from '../llm/index.js';
import type { ConversationStore } from '../storage/conversation-store.js';
import type { OrderMemoryStore } from '../storage/order-memory-store.js';

import { ApplicationError } from './application-errors.js';
import type { ConversationDto } from './dto/conversation-dto.js';
import type { HandleCustomerMessageResultDto } from './dto/handle-message-result-dto.js';
import type { MeasurementActionDto } from './dto/measurement-action-dto.js';
import type { MessageDto } from './dto/message-dto.js';
import type { ConversationOrderStateDto } from './dto/order-state-dto.js';
import {
  toConversationDto,
  toMeasurementActionDto,
  toMessageDto,
  toOrderStateDto,
} from './dto/mappers.js';
import type { IdGenerator } from './id-generator.js';
import { UuidIdGenerator } from './id-generator.js';

export interface CreateConversationInput {
  channel?: string;
  customerId?: string;
}

export interface HandleCustomerMessageInput {
  conversationId: string;
  messageId: string;
  text: string;
  createdAt?: string;
}

export interface JarvisApplicationDeps {
  conversationStore: ConversationStore;
  orderMemoryStore: OrderMemoryStore;
  orchestrator: ConversationOrchestrator;
  idGenerator?: IdGenerator;
  measurementActionPolicy?: MeasurementActionPolicy;
  now?: () => string;
}

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

function findAiReplyAfterCustomer(messages: Message[], customerMessageId: string): Message | undefined {
  const sorted = [...messages].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    if (byTime !== 0) {
      return byTime;
    }
    return a.messageId.localeCompare(b.messageId);
  });
  const idx = sorted.findIndex((message) => message.messageId === customerMessageId);
  if (idx < 0) {
    return undefined;
  }
  for (let i = idx + 1; i < sorted.length; i += 1) {
    const next = sorted[i]!;
    if (next.sender === 'AI') {
      return next;
    }
    if (next.sender === 'CUSTOMER') {
      break;
    }
  }
  return undefined;
}

function mapProviderError(error: unknown): ApplicationError | undefined {
  if (
    error instanceof OdiRouterProviderError ||
    error instanceof GeminiProviderError ||
    error instanceof DeepSeekProviderError
  ) {
    return ApplicationError.providerUnavailable('LLM provider unavailable');
  }
  return undefined;
}

export class JarvisApplication {
  private readonly conversationStore: ConversationStore;
  private readonly orderMemoryStore: OrderMemoryStore;
  private readonly orchestrator: ConversationOrchestrator;
  private readonly idGenerator: IdGenerator;
  private readonly measurementActionPolicy: MeasurementActionPolicy | undefined;
  private readonly now: () => string;

  constructor(deps: JarvisApplicationDeps) {
    this.conversationStore = deps.conversationStore;
    this.orderMemoryStore = deps.orderMemoryStore;
    this.orchestrator = deps.orchestrator;
    this.idGenerator = deps.idGenerator ?? new UuidIdGenerator();
    this.measurementActionPolicy = deps.measurementActionPolicy;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  async createConversation(input: CreateConversationInput = {}): Promise<ConversationDto> {
    const channelRaw = input.channel ?? 'unknown';
    if (!isChannel(channelRaw)) {
      throw ApplicationError.validation('Invalid channel', { channel: channelRaw });
    }

    const timestamp = this.now();
    const conversation = await this.conversationStore.createConversation({
      conversationId: this.idGenerator.generate(),
      channel: channelRaw,
      customerId: input.customerId?.trim() || this.idGenerator.generate(),
      mode: 'AI',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return toConversationDto(conversation);
  }

  async getConversation(conversationId: string): Promise<ConversationDto> {
    const conversation = await this.requireConversation(conversationId);
    return toConversationDto(conversation);
  }

  async listConversationMessages(conversationId: string): Promise<MessageDto[]> {
    await this.requireConversation(conversationId);
    const messages = await this.conversationStore.getMessages(conversationId);
    return messages
      .map((message) => toMessageDto(message))
      .filter((message): message is MessageDto => message !== undefined);
  }

  async setConversationMode(
    conversationId: string,
    mode: string,
  ): Promise<ConversationDto> {
    if (mode !== 'AI' && mode !== 'HUMAN') {
      throw ApplicationError.modeInvalid();
    }
    const conversation = await this.requireConversation(conversationId);
    try {
      const saved = await this.conversationStore.saveConversation({
        ...conversation,
        mode: mode as ConversationMode,
        updatedAt: this.now(),
      });
      return toConversationDto(saved);
    } catch (error) {
      if (error instanceof PersistenceConflictError) {
        throw ApplicationError.persistenceConflict(error.message);
      }
      throw error;
    }
  }

  async handleCustomerMessage(
    input: HandleCustomerMessageInput,
  ): Promise<HandleCustomerMessageResultDto> {
    if (!input.conversationId?.trim()) {
      throw ApplicationError.validation('conversationId is required');
    }
    if (!input.messageId?.trim()) {
      throw ApplicationError.validation('messageId is required');
    }
    if (typeof input.text !== 'string' || input.text.trim() === '') {
      throw ApplicationError.validation('text must be a non-empty string');
    }

    const conversation = await this.requireConversation(input.conversationId);
    const existingMessages = await this.conversationStore.getMessages(input.conversationId);
    const existing = existingMessages.find((message) => message.messageId === input.messageId);
    if (existing) {
      if (existing.sender !== 'CUSTOMER') {
        throw ApplicationError.messageIdConflict('Message id already used by a non-customer message');
      }
      if (existing.text !== input.text) {
        throw ApplicationError.messageIdConflict();
      }
      const ai = findAiReplyAfterCustomer(existingMessages, existing.messageId);
      return {
        conversationId: conversation.conversationId,
        conversationMode: conversation.mode,
        customerMessageId: existing.messageId,
        duplicate: true,
        aiReply: ai ? { messageId: ai.messageId, text: ai.text } : null,
      };
    }

    try {
      const result = await this.orchestrator.handleIncomingMessage({
        conversationId: input.conversationId,
        messageId: input.messageId,
        text: input.text,
        createdAt: input.createdAt,
      });

      if (result.status === 'human_owned') {
        return {
          conversationId: result.conversation.conversationId,
          conversationMode: 'HUMAN',
          customerMessageId: result.customerMessage.messageId,
          duplicate: false,
          aiReply: null,
        };
      }

      return {
        conversationId: result.conversation.conversationId,
        conversationMode: 'AI',
        customerMessageId: result.customerMessage.messageId,
        duplicate: false,
        aiReply: {
          messageId: result.aiMessage.messageId,
          text: result.replyText,
        },
      };
    } catch (error) {
      const mapped = mapProviderError(error);
      if (mapped) {
        throw mapped;
      }
      if (error instanceof ConversationNotFoundError) {
        throw ApplicationError.notFound();
      }
      if (error instanceof InvalidOperationError) {
        throw ApplicationError.validation(error.message);
      }
      if (error instanceof PersistenceConflictError) {
        throw ApplicationError.persistenceConflict(error.message);
      }
      throw error;
    }
  }

  async getConversationOrderState(conversationId: string): Promise<ConversationOrderStateDto> {
    await this.requireConversation(conversationId);
    const memory =
      (await this.orderMemoryStore.get(conversationId)) ??
      createOrderMemory({
        orderId: conversationId,
        conversationId,
        now: this.now(),
      });
    return toOrderStateDto(memory, this.measurementActionPolicy);
  }

  async getMeasurementAction(conversationId: string): Promise<MeasurementActionDto> {
    await this.requireConversation(conversationId);
    const memory =
      (await this.orderMemoryStore.get(conversationId)) ??
      createOrderMemory({
        orderId: conversationId,
        conversationId,
        now: this.now(),
      });
    return toMeasurementActionDto(memory, this.measurementActionPolicy);
  }

  private async requireConversation(conversationId: string) {
    const conversation = await this.conversationStore.getConversation(conversationId);
    if (!conversation) {
      throw ApplicationError.notFound();
    }
    return conversation;
  }
}
