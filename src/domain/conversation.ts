import type { Channel } from './channel.js';

export type ConversationMode = 'AI' | 'HUMAN';

export interface Conversation {
  conversationId: string;
  channel: Channel;
  customerId: string;
  mode: ConversationMode;
  createdAt: string;
  updatedAt: string;
}
