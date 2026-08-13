import type { Fact } from './fact.js';

export const CUSTOMER_FACT_FIELDS = ['name', 'phone', 'address', 'customerType'] as const;

export type CustomerFactField = (typeof CUSTOMER_FACT_FIELDS)[number];

export type CustomerFactValue = {
  name: string;
  phone: string;
  address: string;
  customerType: 'retail' | 'dealer' | 'corporate' | 'unknown';
};

export type CustomerFacts = {
  [K in CustomerFactField]?: Fact<CustomerFactValue[K]>;
};

export const FULFILLMENT_FACT_FIELDS = [
  'installationRequested',
  'pickupRequested',
  'deliveryRequested',
  'deliveryType',
  'deliveryKm',
] as const;

export type FulfillmentFactField = (typeof FULFILLMENT_FACT_FIELDS)[number];

export type FulfillmentFactValue = {
  installationRequested: boolean;
  pickupRequested: boolean;
  deliveryRequested: boolean;
  deliveryType: 'city' | 'out' | 'pickup';
  deliveryKm: number;
};

export type FulfillmentFacts = {
  [K in FulfillmentFactField]?: Fact<FulfillmentFactValue[K]>;
};
