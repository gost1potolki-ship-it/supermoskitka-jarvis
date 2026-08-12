import type { Conversation } from '../domain/conversation.js';
import type { Message } from '../domain/message.js';

export interface ConversationStore {
  createConversation(conversation: Conversation): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation | undefined>;
  saveConversation(conversation: Conversation): Promise<Conversation>;

  appendMessage(message: Message): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;
}
