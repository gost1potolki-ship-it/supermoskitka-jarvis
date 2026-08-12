import type { MessageSender } from '../domain/message.js';

import type { KnowledgeSource } from './types.js';

export interface RegressionCaseMessage {
  sender: MessageSender;
  text: string;
}

export interface RegressionCase {
  id: string;
  title: string;
  source: KnowledgeSource;
  messages: RegressionCaseMessage[];
  expectedBehaviors: string[];
  forbiddenBehaviors: string[];
  tags: string[];
}
