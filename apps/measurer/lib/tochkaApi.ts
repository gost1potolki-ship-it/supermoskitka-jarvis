export interface CreateSbpQrResult {
  paymentUrl?: string;
  qrPayload?: string;
  qrImageBase64?: string;
  raw: unknown;
}

const env = import.meta.env as Record<string, string | undefined>;

const TOCHKA_API_URL = env.VITE_TOCHKA_API_URL || '';
const TOCHKA_JWT_TOKEN = env.VITE_TOCHKA_JWT_TOKEN || '';
const TOCHKA_MERCHANT_ID = env.VITE_TOCHKA_MERCHANT_ID || '';
const TOCHKA_ACCOUNT_ID = env.VITE_TOCHKA_ACCOUNT_ID || '';
const TOCHKA_QRC_TYPE = env.VITE_TOCHKA_QRC_TYPE || '02';
const TOCHKA_GET_QR_URL_BASE = env.VITE_TOCHKA_GET_QR_URL_BASE || '';
const isDev = Boolean(import.meta.env.DEV);

const toStringSafe = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
};

const pickFirstString = (data: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = toStringSafe(data[key]);
    if (value) return value;
  }
  return undefined;
};

const collectStringsDeep = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringsDeep);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(collectStringsDeep);
  }
  return [];
};

const pickFirstByKeyDeep = (value: unknown, keys: string[]): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const visit = (node: unknown): string | undefined => {
    if (!node || typeof node !== 'object') return undefined;
    const obj = node as Record<string, unknown>;

    for (const key of keys) {
      const direct = toStringSafe(obj[key]);
      if (direct) return direct;
    }

    for (const child of Object.values(obj)) {
      const nested = visit(child);
      if (nested) return nested;
    }
    return undefined;
  };

  return visit(value);
};

const resolveTochkaRequestUrl = (): string => {
  if (!TOCHKA_API_URL) return '';

  const hasMerchantPlaceholder =
    TOCHKA_API_URL.includes('{merchant_id}') || TOCHKA_API_URL.includes(':merchant_id');
  const hasAccountPlaceholder =
    TOCHKA_API_URL.includes('{account_id}') || TOCHKA_API_URL.includes(':account_id');

  if ((hasMerchantPlaceholder || hasAccountPlaceholder) && !TOCHKA_ACCOUNT_ID) {
    throw new Error('Не задан VITE_TOCHKA_ACCOUNT_ID (формат: НОМЕР_СЧЕТА/БИК)');
  }

  let fullUrl = TOCHKA_API_URL
    .replace('{merchant_id}', encodeURIComponent(TOCHKA_MERCHANT_ID))
    .replace('{account_id}', encodeURIComponent(TOCHKA_ACCOUNT_ID))
    .replace(':merchant_id', encodeURIComponent(TOCHKA_MERCHANT_ID))
    .replace(':account_id', encodeURIComponent(TOCHKA_ACCOUNT_ID));

  // Если задан только базовый URL .../qr-code, автоматически достраиваем маршрут.
  if (
    !hasMerchantPlaceholder &&
    !hasAccountPlaceholder &&
    /\/qr-code\/?$/.test(fullUrl)
  ) {
    if (!TOCHKA_ACCOUNT_ID) {
      throw new Error(
        'Для endpoint /qr-code нужен VITE_TOCHKA_ACCOUNT_ID (формат: НОМЕР_СЧЕТА/БИК)'
      );
    }
    fullUrl = `${fullUrl.replace(/\/$/, '')}/merchant/${encodeURIComponent(
      TOCHKA_MERCHANT_ID
    )}/${encodeURIComponent(TOCHKA_ACCOUNT_ID)}`;
  }

  if (!isDev) {
    return fullUrl;
  }

  try {
    const parsed = new URL(fullUrl);
    return `/api/tochka${parsed.pathname}${parsed.search}`;
  } catch {
    // Если в env уже относительный путь, отправим его как есть.
    return fullUrl;
  }
};

const resolveTochkaGetQrUrl = (qrcId: string): string => {
  const encodedId = encodeURIComponent(qrcId);

  if (TOCHKA_GET_QR_URL_BASE) {
    return `${TOCHKA_GET_QR_URL_BASE.replace(/\/$/, '')}/${encodedId}`;
  }

  let fullUrl = TOCHKA_API_URL;
  try {
    fullUrl = fullUrl
      .replace('{merchant_id}', encodeURIComponent(TOCHKA_MERCHANT_ID))
      .replace('{account_id}', encodeURIComponent(TOCHKA_ACCOUNT_ID))
      .replace(':merchant_id', encodeURIComponent(TOCHKA_MERCHANT_ID))
      .replace(':account_id', encodeURIComponent(TOCHKA_ACCOUNT_ID));
  } catch {
    // noop
  }

  const derived = fullUrl.replace(/\/merchant\/[^/]+\/[^/]+\/?$/, '');
  const getUrlAbs = `${derived.replace(/\/$/, '')}/${encodedId}`;

  if (!isDev) return getUrlAbs;

  try {
    const parsed = new URL(getUrlAbs);
    return `/api/tochka${parsed.pathname}${parsed.search}`;
  } catch {
    return getUrlAbs;
  }
};

const extractQrFields = (source: unknown): { paymentUrl?: string; qrPayload?: string; qrImageBase64?: string; qrcId?: string } => {
  if (!source || typeof source !== 'object') return {};
  const obj = source as Record<string, unknown>;

  const paymentUrl =
    pickFirstByKeyDeep(obj, ['paymentUrl', 'payment_link', 'payUrl', 'url', 'deeplink', 'sbpLink', 'link']) ||
    collectStringsDeep(obj).find((s) => /^https?:\/\//i.test(s));

  const qrPayload = pickFirstByKeyDeep(obj, ['qrPayload', 'qr_payload', 'payload', 'qrString', 'qrData']);
  const qrImageBase64 =
    pickFirstByKeyDeep(obj, ['qrImageBase64', 'qr_image_base64', 'qrImage', 'qr_code_image']) ||
    collectStringsDeep(obj).find((s) => s.length > 100 && /^[A-Za-z0-9+/=]+$/.test(s));

  const qrcId = pickFirstByKeyDeep(obj, ['qrcId', 'qrc_id', 'qrCodeId', 'id']);

  return { paymentUrl, qrPayload, qrImageBase64, qrcId };
};

/**
 * Создание динамического QR СБП через API Точка.
 * ВАЖНО: структура body может отличаться в зависимости от версии API.
 * Вынесена в отдельный сервис, чтобы легко скорректировать поля под ваш endpoint.
 */
export async function createSbpQr(
  amount: number,
  orderId: string,
  itemsDescription: string
): Promise<CreateSbpQrResult> {
  if (!TOCHKA_API_URL) {
    throw new Error('Не задан VITE_TOCHKA_API_URL');
  }
  if (!TOCHKA_JWT_TOKEN) {
    throw new Error('Не задан VITE_TOCHKA_JWT_TOKEN');
  }
  if (!TOCHKA_MERCHANT_ID) {
    throw new Error('Не задан VITE_TOCHKA_MERCHANT_ID');
  }
  const requestUrl = resolveTochkaRequestUrl();
  if (!requestUrl) {
    throw new Error('Не удалось сформировать URL запроса к Точка API');
  }

  const amountRub = Math.max(0, Math.round(amount));
  const amountKopecks = amountRub * 100;
  const description = itemsDescription || `Оплата заказа ${orderId}`;
  const purpose = `Оплата заказа ${orderId}`;
  const qrcType = TOCHKA_QRC_TYPE === '01' || TOCHKA_QRC_TYPE === '02' ? TOCHKA_QRC_TYPE : '02';

  // У Точка API для части маршрутов обязательно ожидается top-level поле "data".
  // Оставляем также совместимые поля на верхнем уровне.
  const dataPayload = {
    qrcType,
    amount: amountKopecks,
    amountKopecks,
    currency: 'RUB',
    paymentPurpose: purpose,
    purpose,
    orderId,
    description,
    metadata: {
      orderId,
      description,
    },
  };

  const body = {
    data: dataPayload,
    merchantId: TOCHKA_MERCHANT_ID,
    accountId: TOCHKA_ACCOUNT_ID,
    orderId,
    amount: amountRub,
    amountKopecks,
    currency: 'RUB',
    description,
    purpose,
  };

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOCHKA_JWT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    // Оставляем raw text ниже для диагностики.
  }

  if (!response.ok) {
    const errors = Array.isArray(data.Errors)
      ? (data.Errors as Array<Record<string, unknown>>)
          .map((e) => `${String(e.errorCode || e.code || 'error')}: ${String(e.message || '')}`)
          .join('; ')
      : '';
    const details = errors || responseText || `HTTP ${response.status}`;
    throw new Error(`Tochka API error: ${details}`);
  }

  let extracted = extractQrFields(data);
  let getQrRaw: unknown = null;

  // Некоторые методы возвращают только qrcId — тогда нужно сделать второй запрос за содержимым QR.
  if (!extracted.paymentUrl && !extracted.qrPayload && !extracted.qrImageBase64 && extracted.qrcId) {
    const getQrUrl = resolveTochkaGetQrUrl(extracted.qrcId);
    const getRes = await fetch(getQrUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOCHKA_JWT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    const getText = await getRes.text();
    try {
      getQrRaw = getText ? JSON.parse(getText) : {};
    } catch {
      getQrRaw = getText;
    }
    if (getRes.ok) {
      extracted = extractQrFields(getQrRaw);
    }
  }

  console.log('Tochka register QR raw:', data);
  if (getQrRaw) {
    console.log('Tochka get QR raw:', getQrRaw);
  }

  return {
    paymentUrl: extracted.paymentUrl,
    qrPayload: extracted.qrPayload,
    qrImageBase64: extracted.qrImageBase64,
    raw: {
      register: Object.keys(data).length > 0 ? data : responseText,
      getQr: getQrRaw,
    },
  };
}
