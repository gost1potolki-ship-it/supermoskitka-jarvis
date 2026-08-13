import {
  ConversationAlreadyExistsError,
  ConversationNotFoundError,
  InvalidOperationError,
  MessageAlreadyExistsError,
  PersistenceConflictError,
  type Conversation,
  type Message,
} from '../../domain/index.js';
import type { ConversationStore } from '../../storage/conversation-store.js';

import {
  JARVIS_CONVERSATIONS_COLLECTION,
  JARVIS_PERSISTENCE_SCHEMA_VERSION,
  assertJarvisCollectionName,
  assertSafeDocumentId,
  assertSerializedSize,
} from './constants.js';
import {
  buildConversationDocument,
  decodeConversationDocument,
} from './firestore-codec.js';
import type { JarvisFirestoreGateway } from './firestore-gateway.js';

assertJarvisCollectionName(JARVIS_CONVERSATIONS_COLLECTION);

export class FirestoreConversationStore implements ConversationStore {
  constructor(private readonly gateway: JarvisFirestoreGateway) {}

  async createConversation(conversation: Conversation): Promise<Conversation> {
    assertSafeDocumentId(conversation.conversationId);
    return this.gateway.runTransaction(async (tx) => {
      const existing = await tx.get(JARVIS_CONVERSATIONS_COLLECTION, conversation.conversationId);
      if (existing) {
        throw new ConversationAlreadyExistsError(conversation.conversationId);
      }
      const revision = 1;
      const doc = buildConversationDocument(conversation, [], revision);
      assertSerializedSize(doc, 'conversation');
      tx.set(JARVIS_CONVERSATIONS_COLLECTION, conversation.conversationId, doc);
      return { ...conversation, revision };
    });
  }

  async getConversation(conversationId: string): Promise<Conversation | undefined> {
    assertSafeDocumentId(conversationId);
    const raw = await this.gateway.get(JARVIS_CONVERSATIONS_COLLECTION, conversationId);
    if (!raw) {
      return undefined;
    }
    return decodeConversationDocument(raw).conversation;
  }

  async saveConversation(conversation: Conversation): Promise<Conversation> {
    assertSafeDocumentId(conversation.conversationId);
    return this.gateway.runTransaction(async (tx) => {
      const existing = await tx.get(JARVIS_CONVERSATIONS_COLLECTION, conversation.conversationId);
      if (!existing) {
        throw new ConversationNotFoundError(conversation.conversationId);
      }
      const decoded = decodeConversationDocument(existing);
      const expected = conversation.revision;
      if (expected !== undefined && expected !== decoded.revision) {
        throw new PersistenceConflictError(
          `Conversation revision conflict for ${conversation.conversationId}`,
        );
      }
      const revision = decoded.revision + 1;
      const { revision: _ignored, ...conversationWithoutRevision } = conversation;
      const doc = buildConversationDocument(
        conversationWithoutRevision,
        decoded.messages,
        revision,
      );
      assertSerializedSize(doc, 'conversation');
      tx.set(JARVIS_CONVERSATIONS_COLLECTION, conversation.conversationId, doc);
      return { ...conversationWithoutRevision, revision };
    });
  }

  async appendMessage(message: Message): Promise<Message> {
    assertSafeDocumentId(message.conversationId);
    if (message.text.trim() === '') {
      throw new InvalidOperationError('Message text must not be empty');
    }
    return this.gateway.runTransaction(async (tx) => {
      const existing = await tx.get(JARVIS_CONVERSATIONS_COLLECTION, message.conversationId);
      if (!existing) {
        throw new ConversationNotFoundError(message.conversationId);
      }
      const decoded = decodeConversationDocument(existing);
      if (decoded.messages.some((entry) => entry.messageId === message.messageId)) {
        throw new MessageAlreadyExistsError(message.messageId);
      }
      const messages = [...decoded.messages, { ...message }].sort((a, b) => {
        const byTime = a.createdAt.localeCompare(b.createdAt);
        if (byTime !== 0) {
          return byTime;
        }
        return a.messageId.localeCompare(b.messageId);
      });
      const revision = decoded.revision + 1;
      const { revision: _ignored, ...conversation } = decoded.conversation;
      const doc = buildConversationDocument(conversation, messages, revision);
      assertSerializedSize(doc, 'conversation');
      tx.set(JARVIS_CONVERSATIONS_COLLECTION, message.conversationId, doc);
      return { ...message };
    });
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    assertSafeDocumentId(conversationId);
    const raw = await this.gateway.get(JARVIS_CONVERSATIONS_COLLECTION, conversationId);
    if (!raw) {
      throw new ConversationNotFoundError(conversationId);
    }
    return decodeConversationDocument(raw).messages.map((message) => ({ ...message }));
  }
}

export function isJarvisConversationDocument(raw: Record<string, unknown>): boolean {
  return (
    raw.schemaVersion === JARVIS_PERSISTENCE_SCHEMA_VERSION &&
    typeof raw.revision === 'number' &&
    typeof raw.conversation === 'object'
  );
}
