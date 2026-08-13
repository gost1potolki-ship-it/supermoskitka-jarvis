import {
  CHANNELS,
  CUSTOMER_FACT_FIELDS,
  FULFILLMENT_FACT_FIELDS,
  ORDER_ITEM_FACT_FIELDS,
  PersistenceDataError,
  type Channel,
  type Conversation,
  type ConversationMode,
  type CustomerFactField,
  type CustomerFacts,
  type Fact,
  type FactSource,
  type FulfillmentFactField,
  type FulfillmentFacts,
  type Message,
  type MessageSender,
  type OrderChange,
  type OrderItem,
  type OrderItemFactField,
  type OrderMemory,
} from '../../domain/index.js';

import { JARVIS_PERSISTENCE_SCHEMA_VERSION } from './constants.js';

const CHANNEL_SET = new Set<string>(CHANNELS);
const MODE_SET = new Set<string>(['AI', 'HUMAN']);
const SENDER_SET = new Set<string>(['CUSTOMER', 'AI', 'HUMAN', 'SYSTEM']);
const ITEM_FIELD_SET = new Set<string>(ORDER_ITEM_FACT_FIELDS);
const CUSTOMER_FIELD_SET = new Set<string>(CUSTOMER_FACT_FIELDS);
const FULFILLMENT_FIELD_SET = new Set<string>(FULFILLMENT_FACT_FIELDS);
const PROFILE_COLORS = new Set(['WHITE', 'BROWN_8017', 'GRAY_7016', 'CUSTOM_RAL']);
const PRODUCT_TYPES = new Set(['FRAME', 'WING', 'DOOR', 'PLISSE_NET']);
const MESH_TYPES = new Set(['STANDARD', 'ANTIMOSHKA', 'ANTICAT', 'ANTIDUST']);
const CUSTOMER_TYPES = new Set(['retail', 'dealer', 'corporate', 'unknown']);
const DELIVERY_TYPES = new Set(['city', 'out', 'pickup']);

function fail(message: string): never {
  throw new PersistenceDataError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`Invalid string at ${path}`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireString(value, path);
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`Invalid number at ${path}`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(`Invalid boolean at ${path}`);
  }
  return value;
}

function requireChannel(value: unknown, path: string): Channel {
  const channel = requireString(value, path);
  if (!CHANNEL_SET.has(channel)) {
    fail(`Invalid channel at ${path}`);
  }
  return channel as Channel;
}

function decodeFactSource(value: unknown, path: string): FactSource {
  if (!isRecord(value)) {
    fail(`Invalid FactSource at ${path}`);
  }
  return {
    sourceMessageId: requireString(value.sourceMessageId, `${path}.sourceMessageId`),
    sourceChannel: requireChannel(value.sourceChannel, `${path}.sourceChannel`),
    sourceTimestamp: requireString(value.sourceTimestamp, `${path}.sourceTimestamp`),
  };
}

function decodeFact<T>(
  value: unknown,
  path: string,
  decodeValue: (raw: unknown, valuePath: string) => T,
): Fact<T> {
  if (!isRecord(value)) {
    fail(`Invalid Fact at ${path}`);
  }
  if (!isRecord(value.current)) {
    fail(`Invalid Fact.current at ${path}`);
  }
  if (!Array.isArray(value.history)) {
    fail(`Invalid Fact.history at ${path}`);
  }
  const currentValue = decodeValue(value.current.value, `${path}.current.value`);
  const currentSource = decodeFactSource(value.current, `${path}.current`);
  const history = value.history.map((entry, index) => {
    if (!isRecord(entry)) {
      fail(`Invalid Fact.history[${index}] at ${path}`);
    }
    return {
      value: decodeValue(entry.value, `${path}.history[${index}].value`),
      ...decodeFactSource(entry, `${path}.history[${index}]`),
    };
  });
  return {
    current: { value: currentValue, ...currentSource },
    history,
    lastSeenSource: decodeFactSource(value.lastSeenSource, `${path}.lastSeenSource`),
  };
}

function decodeItemFieldValue(field: OrderItemFactField, value: unknown, path: string): unknown {
  if (field === 'quantity' || field === 'widthMm' || field === 'heightMm') {
    return requireNumber(value, path);
  }
  const asString = requireString(value, path);
  if (field === 'productType' && !PRODUCT_TYPES.has(asString)) {
    fail(`Invalid productType enum at ${path}`);
  }
  if (field === 'meshType' && !MESH_TYPES.has(asString)) {
    fail(`Invalid meshType enum at ${path}`);
  }
  if (field === 'profileColor' && !PROFILE_COLORS.has(asString)) {
    fail(`Invalid profileColor enum at ${path}`);
  }
  return asString;
}

function decodeOrderItem(value: unknown, path: string): OrderItem {
  if (!isRecord(value)) {
    fail(`Invalid OrderItem at ${path}`);
  }
  const item: OrderItem = { id: requireString(value.id, `${path}.id`) };
  for (const field of ORDER_ITEM_FACT_FIELDS) {
    if (value[field] === undefined) {
      continue;
    }
    item[field] = decodeFact(value[field], `${path}.${field}`, (raw, valuePath) =>
      decodeItemFieldValue(field, raw, valuePath),
    ) as never;
  }
  for (const key of Object.keys(value)) {
    if (key === 'id') {
      continue;
    }
    if (!ITEM_FIELD_SET.has(key)) {
      fail(`Unknown OrderItem field at ${path}.${key}`);
    }
  }
  return item;
}

function decodeCustomerFacts(value: unknown, path: string): CustomerFacts {
  if (!isRecord(value)) {
    fail(`Invalid customer facts at ${path}`);
  }
  const customer: CustomerFacts = {};
  for (const key of Object.keys(value)) {
    if (!CUSTOMER_FIELD_SET.has(key)) {
      fail(`Unknown customer field at ${path}.${key}`);
    }
    const field = key as CustomerFactField;
    customer[field] = decodeFact(value[field], `${path}.${field}`, (raw, valuePath) => {
      if (field === 'customerType') {
        const type = requireString(raw, valuePath);
        if (!CUSTOMER_TYPES.has(type)) {
          fail(`Invalid customerType at ${valuePath}`);
        }
        return type;
      }
      return requireString(raw, valuePath);
    }) as never;
  }
  return customer;
}

function decodeFulfillmentFacts(value: unknown, path: string): FulfillmentFacts {
  if (!isRecord(value)) {
    fail(`Invalid fulfillment facts at ${path}`);
  }
  const fulfillment: FulfillmentFacts = {};
  for (const key of Object.keys(value)) {
    if (!FULFILLMENT_FIELD_SET.has(key)) {
      fail(`Unknown fulfillment field at ${path}.${key}`);
    }
    const field = key as FulfillmentFactField;
    fulfillment[field] = decodeFact(value[field], `${path}.${field}`, (raw, valuePath) => {
      if (
        field === 'installationRequested' ||
        field === 'pickupRequested' ||
        field === 'deliveryRequested'
      ) {
        return requireBoolean(raw, valuePath);
      }
      if (field === 'deliveryType') {
        const type = requireString(raw, valuePath);
        if (!DELIVERY_TYPES.has(type)) {
          fail(`Invalid deliveryType at ${valuePath}`);
        }
        return type;
      }
      return requireNumber(raw, valuePath);
    }) as never;
  }
  return fulfillment;
}

function decodeOrderChange(value: unknown, path: string): OrderChange {
  if (!isRecord(value)) {
    fail(`Invalid OrderChange at ${path}`);
  }
  if (value.type !== 'FIELD_CHANGED') {
    fail(`Invalid OrderChange.type at ${path}`);
  }
  const field = requireString(value.field, `${path}.field`);
  if (!ITEM_FIELD_SET.has(field)) {
    fail(`Invalid OrderChange.field at ${path}`);
  }
  return {
    type: 'FIELD_CHANGED',
    orderItemId: requireString(value.orderItemId, `${path}.orderItemId`),
    field: field as OrderItemFactField,
    oldValue: value.oldValue,
    newValue: value.newValue,
    sourceMessageId: requireString(value.sourceMessageId, `${path}.sourceMessageId`),
  };
}

export function encodeOrderMemory(memory: OrderMemory): Record<string, unknown> {
  const { revision: _revision, ...rest } = memory;
  return structuredClone(rest) as unknown as Record<string, unknown>;
}

export function decodeOrderMemory(raw: unknown): OrderMemory {
  if (!isRecord(raw)) {
    fail('OrderMemory root must be an object');
  }
  if (!Array.isArray(raw.items) || !Array.isArray(raw.changes)) {
    fail('OrderMemory.items/changes must be arrays');
  }
  const memory: OrderMemory = {
    orderId: requireString(raw.orderId, 'orderId'),
    conversationId: requireString(raw.conversationId, 'conversationId'),
    items: raw.items.map((item, index) => decodeOrderItem(item, `items[${index}]`)),
    changes: raw.changes.map((change, index) => decodeOrderChange(change, `changes[${index}]`)),
    createdAt: requireString(raw.createdAt, 'createdAt'),
    updatedAt: requireString(raw.updatedAt, 'updatedAt'),
  };
  if (raw.customer !== undefined) {
    memory.customer = decodeCustomerFacts(raw.customer, 'customer');
  }
  if (raw.fulfillment !== undefined) {
    memory.fulfillment = decodeFulfillmentFacts(raw.fulfillment, 'fulfillment');
  }
  return memory;
}

export function encodeConversationAggregate(
  conversation: Conversation,
  messages: readonly Message[],
): { conversation: Record<string, unknown>; messages: Record<string, unknown>[] } {
  const { revision: _revision, ...rest } = conversation;
  return {
    conversation: structuredClone(rest) as unknown as Record<string, unknown>,
    messages: messages.map((message) => structuredClone(message) as unknown as Record<string, unknown>),
  };
}

export function decodeConversation(raw: unknown): Conversation {
  if (!isRecord(raw)) {
    fail('Conversation root must be an object');
  }
  const mode = requireString(raw.mode, 'mode');
  if (!MODE_SET.has(mode)) {
    fail('Invalid conversation mode');
  }
  return {
    conversationId: requireString(raw.conversationId, 'conversationId'),
    channel: requireChannel(raw.channel, 'channel'),
    customerId: requireString(raw.customerId, 'customerId'),
    mode: mode as ConversationMode,
    createdAt: requireString(raw.createdAt, 'createdAt'),
    updatedAt: requireString(raw.updatedAt, 'updatedAt'),
  };
}

export function decodeMessage(raw: unknown, path: string): Message {
  if (!isRecord(raw)) {
    fail(`Invalid Message at ${path}`);
  }
  const sender = requireString(raw.sender, `${path}.sender`);
  if (!SENDER_SET.has(sender)) {
    fail(`Invalid Message.sender at ${path}`);
  }
  return {
    messageId: requireString(raw.messageId, `${path}.messageId`),
    conversationId: requireString(raw.conversationId, `${path}.conversationId`),
    channel: requireChannel(raw.channel, `${path}.channel`),
    sender: sender as MessageSender,
    text: requireString(raw.text, `${path}.text`),
    createdAt: requireString(raw.createdAt, `${path}.createdAt`),
    ...(optionalString(raw.externalMessageId, `${path}.externalMessageId`) !== undefined
      ? { externalMessageId: optionalString(raw.externalMessageId, `${path}.externalMessageId`) }
      : {}),
  };
}

export function decodeConversationDocument(raw: unknown): {
  revision: number;
  conversation: Conversation;
  messages: Message[];
} {
  if (!isRecord(raw)) {
    fail('Conversation document must be an object');
  }
  if (raw.schemaVersion !== JARVIS_PERSISTENCE_SCHEMA_VERSION) {
    fail('Unsupported conversation schemaVersion');
  }
  const revision = requireNumber(raw.revision, 'revision');
  if (!Number.isInteger(revision) || revision < 1) {
    fail('Invalid conversation revision');
  }
  if (!Array.isArray(raw.messages)) {
    fail('Conversation.messages must be an array');
  }
  const conversation = decodeConversation(raw.conversation);
  const messages = raw.messages
    .map((message, index) => decodeMessage(message, `messages[${index}]`))
    .sort((a, b) => {
      const byTime = a.createdAt.localeCompare(b.createdAt);
      if (byTime !== 0) {
        return byTime;
      }
      return a.messageId.localeCompare(b.messageId);
    });
  return {
    revision,
    conversation: { ...conversation, revision },
    messages,
  };
}

export function decodeOrderMemoryDocument(raw: unknown): {
  revision: number;
  memory: OrderMemory;
} {
  if (!isRecord(raw)) {
    fail('OrderMemory document must be an object');
  }
  if (raw.schemaVersion !== JARVIS_PERSISTENCE_SCHEMA_VERSION) {
    fail('Unsupported order memory schemaVersion');
  }
  const revision = requireNumber(raw.revision, 'revision');
  if (!Number.isInteger(revision) || revision < 1) {
    fail('Invalid order memory revision');
  }
  const memory = decodeOrderMemory(raw.memory);
  return {
    revision,
    memory: { ...memory, revision },
  };
}

export function buildConversationDocument(
  conversation: Conversation,
  messages: readonly Message[],
  revision: number,
): Record<string, unknown> {
  const encoded = encodeConversationAggregate(conversation, messages);
  return {
    schemaVersion: JARVIS_PERSISTENCE_SCHEMA_VERSION,
    revision,
    conversation: encoded.conversation,
    messages: encoded.messages,
  };
}

export function buildOrderMemoryDocument(memory: OrderMemory, revision: number): Record<string, unknown> {
  return {
    schemaVersion: JARVIS_PERSISTENCE_SCHEMA_VERSION,
    revision,
    memory: encodeOrderMemory(memory),
  };
}
