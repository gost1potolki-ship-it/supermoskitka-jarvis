import { getFactValue, type OrderMemory } from '../../domain/index.js';

export interface MeasurementDraftItem {
  itemId: string;
  productType?: string;
  quantity?: number;
  widthMm?: number;
  heightMm?: number;
  measurementBasis?: string;
  meshType?: string;
  profileType?: string;
  profileColor?: string;
  ral?: string;
  colorFinish?: string;
  fastening?: string;
  openingType?: string;
}

export interface MeasurementDraft {
  conversationId: string;
  orderId: string;
  customer: {
    name?: string;
    phone?: string;
    address?: string;
  };
  items: MeasurementDraftItem[];
  fulfillment: {
    installationRequested?: boolean;
    pickupRequested?: boolean;
    deliveryRequested?: boolean;
    deliveryType?: string;
    deliveryKm?: number;
  };
  acceptedPreliminaryQuoteId?: string;
  preliminaryQuoteId?: string;
}

export function buildMeasurementDraft(memory: OrderMemory): MeasurementDraft {
  return {
    conversationId: memory.conversationId,
    orderId: memory.orderId,
    customer: {
      name: getFactValue(memory.customer?.name),
      phone: getFactValue(memory.customer?.phone),
      address: getFactValue(memory.customer?.address),
    },
    items: memory.items.map((item) => ({
      itemId: item.id,
      productType: getFactValue(item.productType),
      quantity: getFactValue(item.quantity),
      widthMm: getFactValue(item.widthMm),
      heightMm: getFactValue(item.heightMm),
      measurementBasis: getFactValue(item.measurementBasis),
      meshType: getFactValue(item.meshType),
      profileType: getFactValue(item.profileType),
      profileColor: getFactValue(item.profileColor),
      ral: getFactValue(item.ral),
      colorFinish: getFactValue(item.colorFinish),
      fastening: getFactValue(item.fastening),
      openingType: getFactValue(item.openingType),
    })),
    fulfillment: {
      installationRequested: getFactValue(memory.fulfillment?.installationRequested),
      pickupRequested: getFactValue(memory.fulfillment?.pickupRequested),
      deliveryRequested: getFactValue(memory.fulfillment?.deliveryRequested),
      deliveryType: getFactValue(memory.fulfillment?.deliveryType),
      deliveryKm: getFactValue(memory.fulfillment?.deliveryKm),
    },
    acceptedPreliminaryQuoteId: memory.acceptedPreliminaryQuoteId,
    preliminaryQuoteId: memory.preliminaryQuote?.quoteId,
  };
}
