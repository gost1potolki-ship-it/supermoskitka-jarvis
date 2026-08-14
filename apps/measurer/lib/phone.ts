/**
 * Нормализация телефона для SMS/WhatsApp и др.: только цифры, формат 7XXXXXXXXXX (Россия).
 */
export function normalizePhoneForMessenger(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.startsWith('8') && digits.length >= 11) return '7' + digits.slice(1);
  if (digits.startsWith('7') && digits.length === 11) return digits;
  if (digits.length === 10 && digits.startsWith('9')) return '7' + digits;
  if (digits.startsWith('8') && digits.length === 10) return '7' + digits;
  return digits.startsWith('7') ? digits : '7' + digits;
}

/**
 * E.164 для РФ (+7…) — для tel:-ссылок, чтобы набор на телефоне шёл в международном формате.
 */
export function phoneE164Russia(raw: string | undefined): string {
  const d = normalizePhoneForMessenger(raw);
  return d ? `+${d}` : '';
}
