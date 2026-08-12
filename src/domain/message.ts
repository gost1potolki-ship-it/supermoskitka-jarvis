import type { Channel } from './channel.js';

export type MessageSender = 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM';

export interface Message {
  messageId: string;
  conversationId: string;
  channel: Channel;
  sender: MessageSender;
  text: string;
  createdAt: string;
  externalMessageId?: string;
}
