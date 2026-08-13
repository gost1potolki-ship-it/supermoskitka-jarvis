import type { Conversation } from '../../domain/conversation.js';
import { getFactValue, type OrderMemory } from '../../domain/index.js';
import type { Message } from '../../domain/message.js';
import type { OrderProfitabilitySnapshot } from '../../domain/profitability.js';
import type { MeasurementActionPolicy } from '../../domain/lead-readiness.js';
import {
  buildMeasurementDraft,
  buildTrustedPreliminaryCalculationInput,
  computeQuoteInputFingerprintFromMemory,
  computeQuoteInputFingerprintFromTrustedCalculation,
  decideMeasurementAction,
  evaluateLeadReadiness,
} from '../../jarvis/preliminary/index.js';

import type { ConversationDto } from './conversation-dto.js';
import type { MeasurementActionDto, MeasurementDraftDto } from './measurement-action-dto.js';
import type { MessageDto } from './message-dto.js';
import type { ConversationOrderStateDto } from './order-state-dto.js';

export function toConversationDto(conversation: Conversation): ConversationDto {
  return {
    conversationId: conversation.conversationId,
    mode: conversation.mode,
    channel: conversation.channel,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function toMessageDto(message: Message): MessageDto | undefined {
  if (message.sender === 'SYSTEM') {
    return undefined;
  }
  if (
    message.sender !== 'CUSTOMER' &&
    message.sender !== 'AI' &&
    message.sender !== 'HUMAN'
  ) {
    return undefined;
  }
  return {
    messageId: message.messageId,
    sender: message.sender,
    text: message.text,
    createdAt: message.createdAt,
  };
}

function isQuoteCurrent(memory: OrderMemory): boolean {
  if (!memory.preliminaryQuote) {
    return false;
  }
  if (memory.preliminaryQuote.quoteTrustStatus !== 'TRUSTED_LEGACY_CALCULATION') {
    return false;
  }
  const trustedBuild = buildTrustedPreliminaryCalculationInput(memory);
  const currentFingerprint = trustedBuild.ok
    ? computeQuoteInputFingerprintFromTrustedCalculation(memory, trustedBuild.input)
    : computeQuoteInputFingerprintFromMemory(memory);
  return memory.preliminaryQuote.inputFingerprint === currentFingerprint;
}

function mapProfitability(
  snap: OrderProfitabilitySnapshot | undefined,
): ConversationOrderStateDto['profitability'] {
  if (!snap) {
    return undefined;
  }
  if (snap.costBasisStatus !== 'EXACT') {
    return {
      costBasisStatus: snap.costBasisStatus,
      profitabilityBand: 'UNAVAILABLE',
    };
  }
  return {
    costBasisStatus: 'EXACT',
    ...(snap.grossProfitRub !== undefined ? { grossProfitRub: snap.grossProfitRub } : {}),
    ...(snap.grossMarginPercent !== undefined
      ? { grossMarginPercent: snap.grossMarginPercent }
      : {}),
    ...(snap.markupPercent !== undefined ? { markupPercent: snap.markupPercent } : {}),
    profitabilityBand: snap.profitabilityBand,
  };
}

export function toOrderStateDto(
  memory: OrderMemory,
  measurementActionPolicy?: MeasurementActionPolicy,
): ConversationOrderStateDto {
  const readiness = evaluateLeadReadiness(memory);
  const action = decideMeasurementAction(memory, measurementActionPolicy);
  const quoteCurrent = isQuoteCurrent(memory);
  const accepted =
    getFactValue(memory.commercial?.preliminaryPriceAccepted) === true &&
    memory.preliminaryQuote !== undefined &&
    memory.acceptedPreliminaryQuoteId === memory.preliminaryQuote.quoteId;

  return {
    conversationId: memory.conversationId,
    memoryRevision: memory.revision ?? 0,
    customer: {
      ...(getFactValue(memory.customer?.name) !== undefined
        ? { name: getFactValue(memory.customer?.name) }
        : {}),
      ...(getFactValue(memory.customer?.phone) !== undefined
        ? { phone: getFactValue(memory.customer?.phone) }
        : {}),
      ...(getFactValue(memory.customer?.address) !== undefined
        ? { address: getFactValue(memory.customer?.address) }
        : {}),
      ...(getFactValue(memory.customer?.customerType) !== undefined
        ? { customerType: getFactValue(memory.customer?.customerType) }
        : {}),
    },
    items: memory.items.map((item) => ({
      localItemId: item.id,
      ...(getFactValue(item.productType) !== undefined
        ? { productType: getFactValue(item.productType) }
        : {}),
      ...(getFactValue(item.quantity) !== undefined ? { quantity: getFactValue(item.quantity) } : {}),
      ...(getFactValue(item.widthMm) !== undefined ? { widthMm: getFactValue(item.widthMm) } : {}),
      ...(getFactValue(item.heightMm) !== undefined ? { heightMm: getFactValue(item.heightMm) } : {}),
      ...(getFactValue(item.measurementBasis) !== undefined
        ? { measurementBasis: getFactValue(item.measurementBasis) }
        : {}),
      ...(getFactValue(item.meshType) !== undefined ? { mesh: getFactValue(item.meshType) } : {}),
      ...(getFactValue(item.profileType) !== undefined
        ? { profile: getFactValue(item.profileType) }
        : {}),
      ...(getFactValue(item.profileColor) !== undefined
        ? { profileColor: getFactValue(item.profileColor) }
        : {}),
      ...(getFactValue(item.ral) !== undefined ? { ral: getFactValue(item.ral) } : {}),
      ...(getFactValue(item.colorFinish) !== undefined
        ? { finish: getFactValue(item.colorFinish) }
        : {}),
      ...(getFactValue(item.fastening) !== undefined
        ? { fastening: getFactValue(item.fastening) }
        : {}),
      ...(getFactValue(item.openingType) !== undefined
        ? { opening: getFactValue(item.openingType) }
        : {}),
      ...(getFactValue(item.comment) !== undefined ? { comment: getFactValue(item.comment) } : {}),
    })),
    ...(memory.preliminaryQuote
      ? {
          preliminaryQuote: {
            quoteId: memory.preliminaryQuote.quoteId,
            publicTotalRub: memory.preliminaryQuote.publicTotalRub,
            current: quoteCurrent && !readiness.blockingCodes.includes('QUOTE_STALE'),
            accepted,
          },
        }
      : {}),
    ...(getFactValue(memory.commercial?.measurementAgreed) !== undefined
      ? { measurementAgreed: getFactValue(memory.commercial?.measurementAgreed) === true }
      : {}),
    readiness: {
      status: readiness.status,
      missingCodes: [...readiness.blockingCodes],
    },
    measurementAction: {
      kind: action,
    },
    ...(mapProfitability(memory.orderProfitability)
      ? { profitability: mapProfitability(memory.orderProfitability) }
      : {}),
  };
}

function toDraftDto(memory: OrderMemory): MeasurementDraftDto {
  const draft = buildMeasurementDraft(memory);
  return {
    conversationId: draft.conversationId,
    memoryRevision: memory.revision ?? 0,
    customer: draft.customer,
    items: draft.items.map((item) => ({
      localItemId: item.itemId,
      ...(item.productType !== undefined ? { productType: item.productType } : {}),
      ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
      ...(item.widthMm !== undefined ? { widthMm: item.widthMm } : {}),
      ...(item.heightMm !== undefined ? { heightMm: item.heightMm } : {}),
      ...(item.measurementBasis !== undefined
        ? { measurementBasis: item.measurementBasis }
        : {}),
      ...(item.meshType !== undefined ? { mesh: item.meshType } : {}),
      ...(item.profileType !== undefined ? { profile: item.profileType } : {}),
      ...(item.profileColor !== undefined ? { profileColor: item.profileColor } : {}),
      ...(item.ral !== undefined ? { ral: item.ral } : {}),
      ...(item.colorFinish !== undefined ? { finish: item.colorFinish } : {}),
      ...(item.fastening !== undefined ? { fastening: item.fastening } : {}),
      ...(item.openingType !== undefined ? { opening: item.openingType } : {}),
    })),
    fulfillment: draft.fulfillment,
    ...(memory.preliminaryQuote
      ? {
          preliminaryQuote: {
            quoteId: memory.preliminaryQuote.quoteId,
            publicTotalRub: memory.preliminaryQuote.publicTotalRub,
          },
        }
      : {}),
  };
}

export function toMeasurementActionDto(
  memory: OrderMemory,
  measurementActionPolicy?: MeasurementActionPolicy,
): MeasurementActionDto {
  const readiness = evaluateLeadReadiness(memory);
  const kind = decideMeasurementAction(memory, measurementActionPolicy);
  return {
    conversationId: memory.conversationId,
    kind,
    readiness: {
      status: readiness.status,
      missingCodes: [...readiness.blockingCodes],
    },
    ...(kind === 'NOT_READY' ? {} : { draft: toDraftDto(memory) }),
  };
}
