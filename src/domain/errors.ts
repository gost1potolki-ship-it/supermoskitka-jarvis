export class ConversationAlreadyExistsError extends Error {
  readonly code = 'CONVERSATION_ALREADY_EXISTS' as const;

  constructor(conversationId: string) {
    super(`Conversation already exists: ${conversationId}`);
    this.name = 'ConversationAlreadyExistsError';
  }
}

export class ConversationNotFoundError extends Error {
  readonly code = 'CONVERSATION_NOT_FOUND' as const;

  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = 'ConversationNotFoundError';
  }
}

export class MessageAlreadyExistsError extends Error {
  readonly code = 'MESSAGE_ALREADY_EXISTS' as const;

  constructor(messageId: string) {
    super(`Message already exists: ${messageId}`);
    this.name = 'MessageAlreadyExistsError';
  }
}

export class InvalidOperationError extends Error {
  readonly code = 'INVALID_OPERATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidOperationError';
  }
}
