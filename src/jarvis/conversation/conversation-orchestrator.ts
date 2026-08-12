import { randomUUID } from 'node:crypto';

import type { Conversation } from '../../domain/conversation.js';
import { ConversationNotFoundError, InvalidOperationError } from '../../domain/errors.js';
import type { Message } from '../../domain/message.js';
import type { LlmProvider } from '../../llm/llm-provider.js';
import type { ConversationStore } from '../../storage/conversation-store.js';

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

export class ConversationOrchestrator {
  constructor(
    private readonly store: ConversationStore,
    private readonly llm: LlmProvider,
  ) {}

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
    const llmResponse = await this.llm.generate({
      conversationId: conversation.conversationId,
      messages: mapMessagesToLlm(history),
    });

    const replyText = llmResponse.text.trim();
    if (replyText === '') {
      throw new InvalidOperationError('LLM returned an empty response');
    }

    const aiMessage = await this.store.appendMessage({
      messageId: randomUUID(),
      conversationId: conversation.conversationId,
      channel: conversation.channel,
      sender: 'AI',
      text: replyText,
      createdAt: new Date().toISOString(),
    });

    return {
      status: 'ai_replied',
      conversation,
      customerMessage,
      aiMessage,
      replyText,
    };
  }
}
