import { DATABASE_MAPPING, type UpcomingMeasurement } from '@calc/types';

const getField = (data: Record<string, unknown>, keys: readonly string[]): string => {
  for (const k of keys) {
    const foundKey = Object.keys(data).find((dk) => dk.toLowerCase() === k.toLowerCase());
    if (foundKey && data[foundKey]) return String(data[foundKey]);
  }
  return '';
};

export const normalizeMeasurement = (
  doc: { id?: string; data?: () => Record<string, unknown> } | Record<string, unknown>
): UpcomingMeasurement => {
  const data = typeof (doc as { data?: () => Record<string, unknown> }).data === 'function'
    ? (doc as { data: () => Record<string, unknown> }).data()
    : (doc as Record<string, unknown>);
  const id = (doc as { id?: string }).id || (data.id as string) || Math.random().toString();

  const payerVal = getField(data, DATABASE_MAPPING.payer).toLowerCase();
  const isCompany = payerVal.includes('фирма') || payerVal.includes('офис') || payerVal.includes('безнал');

  return {
    id,
    address: getField(data, DATABASE_MAPPING.address),
    apartment: getField(data, DATABASE_MAPPING.apartment) || undefined,
    customerName: getField(data, DATABASE_MAPPING.customerName),
    phone: getField(data, DATABASE_MAPPING.phone),
    comment: getField(data, DATABASE_MAPPING.comment) || undefined,
    price: parseFloat(getField(data, DATABASE_MAPPING.price)) || 0,
    payerType: isCompany ? 'company' : 'customer',
    time: getField(data, DATABASE_MAPPING.time) || undefined,
    coordinates: data.lat
      ? { lat: Number(data.lat), lon: Number(data.lon || data.long) }
      : undefined,
    ...(data.reservationStatus === 'reserved' ? { reservationStatus: 'reserved' as const } : {}),
    ...(data.reservedAt != null ? { reservedAt: data.reservedAt } : {}),
  };
};

export const formatPayerLabel = (m: UpcomingMeasurement): string =>
  m.payerType === 'company' ? 'Фирма' : 'Клиент';
