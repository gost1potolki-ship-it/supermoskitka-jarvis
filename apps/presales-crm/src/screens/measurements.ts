import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { phoneE164Russia } from '@calc/lib/phone';
import { PRICES as DEFAULT_PRICES } from '@calc/constants';
import { btn, el } from '../dom';
import { db } from '../firebase';
import { formatPayerLabel, normalizeMeasurement } from '../lib/upcoming';
import type { UpcomingMeasurement } from '@calc/types';

export interface MeasurementsScreenDeps {
  prices: typeof DEFAULT_PRICES;
  onBack: () => void;
}

let measurements: UpcomingMeasurement[] = [];
let loading = true;
let loadError: string | null = null;
let unsub: (() => void) | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  listeners.forEach((cb) => cb());
};

export const subscribeMeasurements = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const startMeasurementsSubscription = (): void => {
  if (unsub) return;
  const q = query(collection(db, 'upcoming_measurements'), orderBy('address'));
  unsub = onSnapshot(
    q,
    (snapshot) => {
      measurements = snapshot.docs.map((d) => normalizeMeasurement({ id: d.id, data: () => d.data() }));
      loading = false;
      loadError = null;
      notify();
    },
    (error) => {
      console.error('[MEASUREMENTS] onSnapshot error', error);
      loading = false;
      loadError = 'Не удалось загрузить данные. Проверьте подключение к сети.';
      notify();
    }
  );
};

export function renderMeasurementsScreen(deps: MeasurementsScreenDeps): HTMLElement {
  const section = el('section', 'measurements-page');

  const header = el('div', 'list-page-header');
  header.appendChild(el('h2', 'list-page-title', `Замеры (${measurements.length})`));
  const refreshBtn = btn('Обновить', () => {
    loading = true;
    notify();
    startMeasurementsSubscription();
  }, 'btn-header');
  header.appendChild(refreshBtn);
  section.appendChild(header);

  if (loading && measurements.length === 0) {
    section.appendChild(el('p', 'list-empty', 'Загрузка…'));
    return section;
  }

  if (loadError && measurements.length === 0) {
    const err = el('p', 'list-error', loadError);
    section.appendChild(err);
    return section;
  }

  if (measurements.length === 0) {
    section.appendChild(el('p', 'list-empty', 'Нет активных замеров'));
    return section;
  }

  const list = el('div', 'measurements-list');
  for (const m of measurements) {
    list.appendChild(renderMeasurementCard(m, deps.prices));
  }
  section.appendChild(list);
  return section;
}

function renderMeasurementCard(m: UpcomingMeasurement, prices: typeof DEFAULT_PRICES): HTMLElement {
  const card = el('article', 'measurement-card');
  const top = el('div', 'card-top');
  top.appendChild(el('h3', 'card-title', m.customerName || '—'));
  if (m.price > 0) {
    top.appendChild(el('span', 'card-amount', `${m.price.toLocaleString('ru-RU')} ₽`));
  }
  card.appendChild(top);

  const phone = m.phone?.trim();
  if (phone) {
    const phoneRow = el('div', 'card-row');
    phoneRow.appendChild(el('span', 'card-label', 'Телефон'));
    const phoneLink = el('a', 'card-link', phone);
    phoneLink.href = `tel:${phoneE164Russia(phone) || phone.replace(/\D/g, '')}`;
    phoneRow.appendChild(phoneLink);
    card.appendChild(phoneRow);
  }

  const addressParts = [m.address, m.apartment].filter(Boolean).join(', ');
  if (addressParts) {
    const addrRow = el('div', 'card-row');
    addrRow.appendChild(el('span', 'card-label', 'Адрес'));
    addrRow.appendChild(el('span', 'card-value', addressParts));
    card.appendChild(addrRow);
  }

  if (m.time) {
    const timeRow = el('div', 'card-row');
    timeRow.appendChild(el('span', 'card-label', 'Время'));
    timeRow.appendChild(el('span', 'card-value', m.time));
    card.appendChild(timeRow);
  }

  if (m.comment) {
    const commentRow = el('div', 'card-row card-comment');
    commentRow.appendChild(el('span', 'card-label', 'Комментарий'));
    commentRow.appendChild(el('span', 'card-value', m.comment));
    card.appendChild(commentRow);
  }

  const payerRow = el('div', 'card-row');
  payerRow.appendChild(el('span', 'card-label', 'Плательщик'));
  payerRow.appendChild(el('span', 'card-value', formatPayerLabel(m)));
  card.appendChild(payerRow);

  const actions = el('div', 'card-actions');
  if (phone) {
    const callBtn = btn('Позвонить', () => {
      window.location.href = `tel:${phone.replace(/\D/g, '')}`;
    }, 'btn-secondary btn-sm');
    actions.appendChild(callBtn);
  }
  if (addressParts) {
    const mapBtn = btn('Маршрут', () => {
      const q = encodeURIComponent(addressParts);
      window.open(`https://yandex.ru/maps/?text=${q}`, '_blank');
    }, 'btn-secondary btn-sm');
    actions.appendChild(mapBtn);
  }
  if (actions.childElementCount > 0) card.appendChild(actions);

  return card;
}
