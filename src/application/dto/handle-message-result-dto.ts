import type { ConversationMode } from '../../domain/conversation.js';

export interface HandleCustomerMessageResultDto {
  conversationId: string;
  conversationMode: ConversationMode;
  customerMessageId: string;
  duplicate: boolean;
  /** True when a previously persisted incomplete customer turn was resumed. */
  resumed?: boolean;
  aiReply: { messageId: string; text: string } | null;
}
