import type { ConversationMode } from '../../domain/conversation.js';

export interface HandleCustomerMessageResultDto {
  conversationId: string;
  conversationMode: ConversationMode;
  customerMessageId: string;
  duplicate: boolean;
  aiReply: { messageId: string; text: string } | null;
}
