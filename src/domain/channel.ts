export const CHANNELS = [
  'telegram',
  'website',
  'whatsapp',
  'avito',
  'max',
  'email',
  'unknown',
] as const;

export type Channel = (typeof CHANNELS)[number];
