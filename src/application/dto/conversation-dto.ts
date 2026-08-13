import type { ConversationMode } from '../../domain/conversation.js';

export interface ConversationDto {
  conversationId: string;
  mode: ConversationMode;
  channel: string;
  createdAt: string;
  updatedAt: string;
}
