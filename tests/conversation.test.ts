import type { Conversation, Customer } from '../src/domain/index.js';
import { describe, expect, it } from 'vitest';

describe('conversation and customer models', () => {
  it('supports AI/HUMAN mode and channel typing', () => {
    const conversation: Conversation = {
      conversationId: 'conv-1',
      channel: 'telegram',
      customerId: 'customer-1',
      mode: 'AI',
      createdAt: '2026-07-07T10:00:00.000Z',
      updatedAt: '2026-07-07T10:00:00.000Z',
    };

    const customer: Customer = {
      customerId: 'customer-1',
      displayName: 'Dealer North',
    };

    expect(conversation.mode).toBe('AI');
    expect(conversation.channel).toBe('telegram');
    expect(customer.customerId).toBe(conversation.customerId);
  });
});
