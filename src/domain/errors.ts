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

export class PersistenceConfigError extends Error {
  readonly code = 'PERSISTENCE_CONFIG_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'PersistenceConfigError';
  }
}

export class PersistenceDataError extends Error {
  readonly code = 'PERSISTENCE_DATA_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'PersistenceDataError';
  }
}

export class PersistenceConflictError extends Error {
  readonly code = 'PERSISTENCE_CONFLICT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'PersistenceConflictError';
  }
}

export class PersistenceSizeLimitError extends Error {
  readonly code = 'PERSISTENCE_SIZE_LIMIT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'PersistenceSizeLimitError';
  }
}
