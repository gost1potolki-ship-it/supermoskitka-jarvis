import pricesExport from '@calc/docs/prices-export/prices-full.json';
import fieldsMatrix from '@calc/docs/prices-export/product-fields-matrix.json';
import uiSpec from '../calc-spec.json';
import { roundToTens } from '@calc/logic/calculations';
import { calculateOrderTotals } from '@calc/logic/orderTotals';
import { PRICES as DEFAULT_PRICES } from '@calc/constants';
import {
  ProductType,
  type ColorType,
  type CornerType,
  type CustomerInfo,
  type HandleType,
  type MeshType,
  type MountType,
  type OrderState,
  type PlisseOpening,
  type PlisseThreshold,
} from '@calc/types';
import type { PricesExport, ProductFieldsMatrix, Screen, UiMatrixEntry, WebCartItem } from './types';
import { calculateWithCost, calculateOrderCostMetrics, enrichCartItemCosts } from './cost-calculation';
import { getMatrixEntry, isFieldVisible, parseMatrixEntry } from './field-config';
import {
  label,
  COLOR_LABELS,
  MESH_LABELS,
  OPENING_LABELS,
  THRESHOLD_LABELS,
  MOUNT_LABELS,
  CORNER_LABELS,
  HANDLE_LABELS,
} from './labels';
import { formatCartOrder, saveTextFile } from './cart-export';
import {
  applyRetailMarkupToResult,
  parseRetailMarkupPercent,
  refreshCartItemPricing,
  RETAIL_MARKUP_OPTIONS,
  type RetailMarkupPercent,
} from './retail-markup';
import { createProductIcon } from './product-icons';
import { btn, el, fieldRow, fieldRowPair, input, segmentToggle, showToast } from './dom';
import {
  applyArchiveWorkStatusUpdate,
  clearEditingArchiveContext,
  deleteFromArchive,
  getEditingArchiveId,
  persistEditingArchiveContext,
  saveToArchive,
} from './lib/archive-outbox';
import {
  sendOrderToProduction,
  WORK_STATUS_IN_PRODUCTION,
  WORK_STATUS_IN_PRODUCTION_LABEL,
} from './lib/sheet-webhook';
import {
  findOrderByArchiveId,
  getDisplayOrders,
  getOrdersFilter,
  refreshOrders,
  setOrdersFilter,
  startOrdersSubscription,
  subscribeOrders,
} from './orders-store';
import { renderMenuScreen } from './screens/menu';
import { renderMeasurementsScreen, startMeasurementsSubscription, subscribeMeasurements } from './screens/measurements';
import { renderOrdersScreen } from './screens/orders';
import { isAuthenticated, getAuthUsername, logout } from './auth';
import { renderLoginScreen } from './screens/login';
import { initTheme, toggleTheme } from './theme';
import type { ArchivedOrder } from '@calc/types';
import type { ArchiveOrderView } from './lib/archive';
import {
  buildCompactItemSummary,
  buildMeasurementSubmission,
  createMeasurementIntakeGateway,
  createMeasurementSubmissionId,
  measurementFingerprint,
  submitMeasurement,
  type MeasurementPayerType,
  type MeasurementSheetStatus,
  type MeasurementSubmissionInput,
} from './lib/measurement-submission';

/** Прайс из `calc_v2`: npm run export:desktop-prices */
const PRICES = { price_settings: (pricesExport as PricesExport).price_settings } as typeof DEFAULT_PRICES;
const MATRIX = fieldsMatrix as ProductFieldsMatrix;
const UI_MATRIX = (uiSpec as { uiMatrix: Record<string, UiMatrixEntry> }).uiMatrix;

const MAINTENANCE = new Set<ProductType>([
  ProductType.SEAL,
  ProductType.COMB,
  ProductType.CHILD_LOCK,
  ProductType.ADJUSTMENT,
]);

const STORAGE_KEY = 'calc_pc_draft_v2';

const PRODUCT_GROUPS: { title: string; types: ProductType[] }[] = [
  {
    title: 'Москитные сетки',
    types: [ProductType.FRAME, ProductType.WING, ProductType.DOOR, ProductType.PLISSE_NET],
  },
  {
    title: 'Шторы плиссе',
    types: [ProductType.JALOUSIE_CLASSIC, ProductType.JALOUSIE_LIGHT, ProductType.JALOUSIE_COZY],
  },
  {
    title: 'Обслуживание',
    types: [ProductType.SEAL, ProductType.COMB, ProductType.CHILD_LOCK, ProductType.ADJUSTMENT],
  },
];

const PRODUCT_DESC: Partial<Record<ProductType, string>> = {
  [ProductType.FRAME]: 'Обычные оконные сетки',
  [ProductType.WING]: 'Сетка в проём',
  [ProductType.DOOR]: 'Сетки на петлях',
  [ProductType.PLISSE_NET]: 'Сетки гармошкой',
  [ProductType.JALOUSIE_CLASSIC]: 'Шторы плиссе ПОРТАЛ',
  [ProductType.JALOUSIE_LIGHT]: 'ШТОРЫ плиссе ЛАЙТ',
  [ProductType.JALOUSIE_COZY]: 'вставная/накладная',
  [ProductType.SEAL]: 'Замена уплотнителя',
  [ProductType.COMB]: 'Ограничитель открывания',
  [ProductType.CHILD_LOCK]: 'Детский замок',
  [ProductType.ADJUSTMENT]: 'Окна и двери',
};

const TYPE_DISPLAY_LABELS: Partial<Record<ProductType, string>> = {
  [ProductType.FRAME]: 'Москитная сетка РАМОЧНАЯ',
  [ProductType.WING]: 'Москитная сетка "Крыло"',
  [ProductType.INSIDE_INSERT]: 'Внутревставная VSN москитная сетка',
  [ProductType.DOOR]: 'Дверная распашная москитная сетка',
  [ProductType.PLISSE_NET]: 'Москитная сетка ПЛИССЕ',
};

const CORNER_ADJ: Record<string, string> = { plastic: 'пластиковые', aluminum: 'алюминиевые' };
const HANDLE_ADJ: Record<string, string> = { plastic: 'пластиковые', metal: 'металлические' };

interface AppState {
  screen: Screen;
  productType: ProductType | null;
  cart: WebCartItem[];
  customer: CustomerInfo;
  globalInstall: boolean;
  deliveryType: 'city' | 'out' | 'pickup';
  deliveryKm: number;
  orderDiscountPercent: 0 | 5 | 10;
  paymentMethod: 'cash' | 'qr';
  includeMeasurementFee: boolean;
  retailMarkupPercent: RetailMarkupPercent;
  comment: string;
  editingId: string | null;
  editingArchiveId: string | null;
  measurementSubmissionId?: string;
  measurementSubmittedFingerprint?: string;
  measurementSheetStatus?: MeasurementSheetStatus;
  measurementSheetErrorCode?: string;
  measurementApartment: string;
  measurementPreferredTime: string;
  measurementPayerType: MeasurementPayerType;
}

let sendingToWorkId: string | null = null;
let measurementRequestInProgress = false;
const measurementIntakeGateway = createMeasurementIntakeGateway();

let state: AppState = loadState();

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as AppState;
      return {
        screen: normalizeLoadedScreen(p.screen),
        productType: null,
        cart: Array.isArray(p.cart) ? p.cart.map((item) => enrichCartItemCosts(item, PRICES)) : [],
        customer: p.customer ?? { name: '', phone: '', address: '' },
        globalInstall: p.globalInstall !== false,
        deliveryType:
          p.deliveryType === 'city' || p.deliveryType === 'out' || p.deliveryType === 'pickup'
            ? p.deliveryType
            : 'city',
        deliveryKm: Number(p.deliveryKm) || 0,
        orderDiscountPercent: p.orderDiscountPercent === 5 || p.orderDiscountPercent === 10 ? p.orderDiscountPercent : 0,
        paymentMethod: p.paymentMethod === 'qr' ? 'qr' : 'cash',
        includeMeasurementFee: p.includeMeasurementFee !== false,
        retailMarkupPercent: parseRetailMarkupPercent(
          (p as AppState & { mosquitoMarkup30?: boolean }).retailMarkupPercent,
          (p as AppState & { mosquitoMarkup30?: boolean }).mosquitoMarkup30
        ),
        comment: p.comment ?? '',
        editingId: null,
        editingArchiveId: getEditingArchiveId(),
        measurementSubmissionId: p.measurementSubmissionId,
        measurementSubmittedFingerprint: p.measurementSubmittedFingerprint,
        measurementSheetStatus: p.measurementSheetStatus,
        measurementSheetErrorCode: p.measurementSheetErrorCode,
        measurementApartment: p.measurementApartment ?? '',
        measurementPreferredTime: p.measurementPreferredTime ?? '',
        measurementPayerType: p.measurementPayerType === 'COMPANY' ? 'COMPANY' : 'CUSTOMER',
      };
    }
  } catch {
    /* ignore */
  }
  return {
    screen: 'menu',
    productType: null,
    cart: [],
    customer: { name: '', phone: '', address: '' },
    globalInstall: true,
    deliveryType: 'city',
    deliveryKm: 0,
    orderDiscountPercent: 0,
    paymentMethod: 'cash',
    includeMeasurementFee: true,
    retailMarkupPercent: 0,
    comment: '',
    editingId: null,
    editingArchiveId: getEditingArchiveId(),
    measurementApartment: '',
    measurementPreferredTime: '',
    measurementPayerType: 'CUSTOMER',
  };
}

function normalizeLoadedScreen(screen: Screen | undefined): Screen {
  if (screen === 'calc') return 'products';
  if (screen === 'products' || screen === 'cart') return screen;
  return 'menu';
}

function persistState(): void {
  const {
    screen, cart, customer, globalInstall, deliveryType, deliveryKm, orderDiscountPercent,
    paymentMethod, includeMeasurementFee, retailMarkupPercent, comment,
    measurementSubmissionId, measurementSubmittedFingerprint, measurementSheetStatus,
    measurementSheetErrorCode, measurementApartment, measurementPreferredTime,
    measurementPayerType,
  } = state;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      screen: screen === 'calc' ? 'cart' : screen, cart, customer, globalInstall, deliveryType,
      deliveryKm, orderDiscountPercent, paymentMethod, includeMeasurementFee,
      retailMarkupPercent, comment, measurementSubmissionId, measurementSubmittedFingerprint,
      measurementSheetStatus, measurementSheetErrorCode, measurementApartment,
      measurementPreferredTime, measurementPayerType,
    })
  );
}

function buildOrder(): OrderState {
  return {
    items: state.cart,
    deliveryType: state.deliveryType,
    deliveryKm: state.deliveryKm,
    globalInstall: state.globalInstall,
    includeMeasurementFee: state.includeMeasurementFee,
    orderDiscountPercent: state.orderDiscountPercent,
    paymentMethod: state.paymentMethod,
    generalComment: state.comment,
    customer: state.customer,
  };
}

function measurementFeeLabel(): string {
  const fee = (PRICES.price_settings.logistics as { measurement_fee?: number }).measurement_fee ?? 1000;
  return `Учитывать стоимость замера ${fee.toLocaleString('ru-RU')} ₽`;
}

function isMaintenance(type: ProductType): boolean {
  return MAINTENANCE.has(type);
}

interface FormState {
  width: string;
  height: string;
  quantity: number;
  color: ColorType;
  mesh: MeshType;
  mount: MountType;
  cornerType: CornerType;
  handleType: HandleType;
  frameProfile: '25' | '32';
  doorProfile: '32' | '42';
  hingesCount: number;
  hasLatch: boolean;
  hasBolt: boolean;
  subType: 'window' | 'door';
  opening: PlisseOpening;
  threshold: PlisseThreshold;
  handles: number;
  comment: string;
}

function defaultForm(type: ProductType, item?: WebCartItem | null): FormState {
  const ui = UI_MATRIX[type] ?? {};
  const isNewFrame = type === ProductType.FRAME && !item;
  return {
    width: item?.width?.toString() ?? '',
    height: item?.height?.toString() ?? '',
    quantity: item?.quantity ?? 1,
    color: (item?.color ?? ui.color?.[0] ?? 'white') as ColorType,
    mesh: (item?.mesh ?? ui.mesh?.[0] ?? 'standard') as MeshType,
    mount: (item?.mount ?? (isNewFrame ? 'z_metal' : ui.mount?.[0] ?? 'z_metal')) as MountType,
    cornerType: (item?.cornerType ?? (isNewFrame ? 'plastic' : ui.cornerType?.[0] ?? 'plastic')) as CornerType,
    handleType: (item?.handleType ?? (isNewFrame ? 'plastic' : ui.handleType?.[0] ?? 'plastic')) as HandleType,
    frameProfile: item?.frameProfile ?? '25',
    doorProfile: item?.doorProfile ?? '42',
    hingesCount: item?.hingesCount ?? 3,
    hasLatch: item?.hasLatch !== false,
    hasBolt: item?.hasBolt ?? false,
    subType: item?.subType === 'door' ? 'door' : 'window',
    opening: (item?.opening ?? ui.opening?.[0] ?? 'side') as PlisseOpening,
    threshold: (item?.threshold ?? ui.threshold?.[0] ?? 'standard') as PlisseThreshold,
    handles: item?.handles ?? 1,
    comment: item?.comment ?? '',
  };
}

let form: FormState = defaultForm(ProductType.FRAME);

function applyFormRules(type: ProductType, f: FormState): FormState {
  const next = { ...f };
  if (next.color === 'ral') {
    next.cornerType = 'aluminum';
    next.handleType = 'metal';
    if (next.mount === 'standard') next.mount = 'z_metal';
  }
  if ((type === ProductType.PLISSE_NET || type === ProductType.JALOUSIE_CLASSIC) && next.opening === 'counter') {
    next.handles = 4;
  }
  if (type === ProductType.JALOUSIE_COZY && next.opening === 'counter') {
    next.opening = 'side';
  }
  return next;
}

function buildDetails(f: FormState): string {
  const parts: string[] = [];
  if (f.width && f.height) parts.push(`${f.width}×${f.height} мм`);
  if (f.mesh) parts.push(label(f.mesh, MESH_LABELS));
  if (f.color) parts.push(label(f.color, COLOR_LABELS));
  return parts.join(' · ');
}

function formatItemDetails(item: WebCartItem): string {
  const L = (v: string | undefined, labels: Record<string, string>) => (v && labels[v]) ? labels[v] : null;
  const color = L(item.color, COLOR_LABELS);
  const mesh = L(item.mesh, MESH_LABELS);
  const mount = L(item.mount, MOUNT_LABELS);
  const cornerAdj = item.cornerType ? CORNER_ADJ[item.cornerType] : null;
  const handleAdj = item.handleType ? HANDLE_ADJ[item.handleType] : null;
  const opening = L(item.opening, OPENING_LABELS);
  const threshold = L(item.threshold, THRESHOLD_LABELS);
  const size = (item.width && item.height) ? `${item.width}×${item.height} мм` : null;
  const parts: string[] = [];

  switch (item.type) {
    case ProductType.FRAME:
      if (color && item.frameProfile) parts.push(`Профиль ${color} ${item.frameProfile} мм`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (item.height && item.height > 1000) parts.push('импост');
      if (cornerAdj) parts.push(`уголки ${cornerAdj}`);
      if (handleAdj) parts.push(`2 ручки ${handleAdj}`);
      if (mount) parts.push(`крепления ${mount}`);
      break;
    case ProductType.WING:
      if (color) parts.push(`Профиль ${color} 30 мм`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (item.height && item.height > 1000) parts.push('импост');
      if (cornerAdj) parts.push(`уголки ${cornerAdj}`);
      if (handleAdj) parts.push(`2 ручки ${handleAdj}`);
      if (mount) parts.push(`крепления ${mount}`);
      break;
    case ProductType.DOOR:
      if (color && item.doorProfile) parts.push(`Профиль ${color} ${item.doorProfile} мм`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (item.hingesCount) parts.push(`${item.hingesCount} петли`);
      if (item.hasLatch) parts.push('защелка');
      if (item.hasBolt) parts.push('шпингалет');
      break;
    case ProductType.INSIDE_INSERT:
      if (color) parts.push(`Профиль ${color} ВСН/ВСМ`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (handleAdj) parts.push(`ручки ${handleAdj}`);
      if (mount) parts.push(`крепления ${mount}`);
      break;
    case ProductType.ROLL:
      if (color) parts.push(`Профиль ${color}`);
      if (mesh) parts.push(`полотно ${mesh}`);
      break;
    case ProductType.PLISSE_NET:
      if (color) parts.push(`Профиль ${color}`);
      if (mesh) parts.push(`полотно ${mesh}`);
      if (opening) parts.push(`открывание ${opening}`);
      if (threshold && threshold !== 'Стандарт') parts.push(`порог ${threshold}`);
      if (item.handles) parts.push(`${item.handles} ручки`);
      break;
    case ProductType.JALOUSIE_CLASSIC:
    case ProductType.JALOUSIE_LIGHT:
    case ProductType.JALOUSIE_COZY:
      if (color) parts.push(`Профиль ${color}`);
      if (mesh) parts.push(`ткань ${mesh}`);
      if (opening && item.type !== ProductType.JALOUSIE_LIGHT) parts.push(`открывание ${opening}`);
      if (item.handles && item.type !== ProductType.JALOUSIE_LIGHT) parts.push(`${item.handles} ручки`);
      break;
    case ProductType.COMB:
      if (handleAdj) parts.push(`Гребенка ${handleAdj}`);
      break;
    case ProductType.ADJUSTMENT:
      if (item.subType) {
        const adjLabels: Record<string, string> = { door: 'Дверь ПВХ', pvc: 'Дверь ПВХ', window: 'Оконная створка', alu: 'Алюминиевая створка' };
        parts.push(adjLabels[item.subType] || item.subType);
      }
      break;
    case ProductType.SEAL:
      parts.push('Замена уплотнителя');
      break;
    case ProductType.CHILD_LOCK:
      parts.push('Установка детского замка');
      break;
    default:
      return item.details;
  }

  const main = parts.length ? parts.join(', ') : item.details;
  return size ? `${size}. ${main}` : main;
}

function handleUpdateQuantity(id: string, newQty: number): void {
  if (newQty < 1) return;
  state.cart = state.cart.map((item) => {
    if (item.id !== id) return item;
    const oldQty = item.quantity || 1;
    const unitPrice = item.price / oldQty;
    const unitInstallPrice = item.installPrice / oldQty;
    const price = roundToTens(unitPrice * newQty);
    const updated = enrichCartItemCosts({ ...item, quantity: newQty, price, installPrice: roundToTens(unitInstallPrice * newQty) }, PRICES);
    return updated;
  });
  persistState();
  render();
}

function setRetailMarkupPercent(percent: RetailMarkupPercent): void {
  state.retailMarkupPercent = percent;
  state.cart = state.cart.map((item) => refreshCartItemPricing(item, state.retailMarkupPercent, PRICES));
  persistState();
  render();
}

function calcFromForm(type: ProductType, f: FormState) {
  const maintenance = isMaintenance(type);
  if (!maintenance) {
    const w = Number(f.width);
    const h = Number(f.height);
    if (!w || !h || w <= 0 || h <= 0) return null;
  }
  const result = calculateWithCost(
    type,
    maintenance ? 0 : Number(f.width),
    maintenance ? 0 : Number(f.height),
    f.color,
    f.mesh,
    f.opening,
    f.threshold,
    f.handles,
    Math.max(1, f.quantity),
    f.subType,
    f.mount,
    f.cornerType,
    f.handleType,
    PRICES,
    f.doorProfile,
    f.hingesCount,
    f.hasLatch,
    f.hasBolt,
    f.frameProfile
  );
  return applyRetailMarkupToResult(result, state.retailMarkupPercent);
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;
  root.innerHTML = '';

  if (!isAuthenticated()) {
    root.appendChild(renderLoginScreen({
      onSuccess: () => bootstrapApp(),
      onRerender: () => render(),
    }));
    return;
  }

  if (state.screen === 'menu') {
    root.appendChild(renderMenuScreen({
      onMeasurements: () => navigateTo('measurements'),
      onOrders: () => navigateTo('orders'),
      onCalculator: () => navigateTo('products'),
      onNewOrder: startNewOrder,
      onThemeToggle: () => {
        toggleTheme();
        render();
      },
      onLogout: () => {
        logout();
        bootstrapApp();
      },
      profileName: getAuthUsername() ?? 'Менеджер',
      cartCount: state.cart.length,
    }));
    return;
  }

  const shell = el('div', 'app-shell');
  shell.appendChild(renderCrmHeader());
  const main = el('main', `app-main${state.screen === 'cart' || state.screen === 'products' || state.screen === 'calc' ? ' app-main--calc' : ''}`);
  if (state.screen === 'measurements') {
    main.appendChild(renderMeasurementsScreen({ prices: PRICES, onBack: () => navigateTo('menu') }));
  } else if (state.screen === 'orders') {
    main.appendChild(renderOrdersScreen({
      orders: getDisplayOrders(),
      filter: getOrdersFilter(),
      prices: PRICES,
      onFilterChange: (filter) => { setOrdersFilter(filter); render(); },
      onEdit: startArchiveEdit,
      onDelete: handleDeleteOrder,
      onSendToWork: handleSendOrderToWork,
      onRefresh: () => { void refreshOrders().then(() => render()); },
      sendingId: sendingToWorkId,
    }));
  } else if (state.screen === 'products') main.appendChild(renderProducts());
  else if (state.screen === 'calc' && state.productType) main.appendChild(renderCalcForm(state.productType));
  else if (state.screen === 'cart') main.appendChild(renderCart());
  shell.appendChild(main);
  root.appendChild(shell);
}

function navigateTo(screen: Screen): void {
  state.screen = screen;
  persistState();
  render();
}

function resetMeasurementSubmissionContext(): void {
  state.measurementSubmissionId = undefined;
  state.measurementSubmittedFingerprint = undefined;
  state.measurementSheetStatus = undefined;
  state.measurementSheetErrorCode = undefined;
  state.measurementApartment = '';
  state.measurementPreferredTime = '';
  state.measurementPayerType = 'CUSTOMER';
}

function startNewOrder(): void {
  if (hasDraftChanges() && !confirm('Начать новый заказ? Текущий черновик будет очищен.')) return;
  state.cart = [];
  state.customer = { name: '', phone: '', address: '' };
  state.comment = '';
  state.editingId = null;
  state.editingArchiveId = null;
  clearEditingArchiveContext();
  resetMeasurementSubmissionContext();
  state.screen = 'products';
  persistState();
  render();
}

function goToMenu(): void {
  navigateTo('menu');
}

function priceDateLabel(): string {
  return (pricesExport as PricesExport).exportedAt?.slice(0, 10) ?? 'локальный';
}

function goBack(): void {
  if (state.screen === 'calc') {
    state.screen = state.cart.length > 0 ? 'cart' : 'products';
    state.productType = null;
    state.editingId = null;
  } else if (state.screen === 'cart') {
    state.screen = 'products';
    state.productType = null;
  } else if (state.screen === 'products' || state.screen === 'measurements' || state.screen === 'orders') {
    state.screen = 'menu';
    state.productType = null;
  }
  persistState();
  render();
}

function goToCart(): void {
  state.screen = 'cart';
  persistState();
  render();
}

function saveOrder(): void {
  if (!state.cart.length) {
    alert('Добавьте позиции в корзину');
    return;
  }
  const order = buildOrder();
  const existing = state.editingArchiveId ? findOrderByArchiveId(state.editingArchiveId) : null;
  const result = saveToArchive(order, state.editingArchiveId, existing);
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }

  const wasEditing = Boolean(state.editingArchiveId);
  state.cart = [];
  state.customer = { name: '', phone: '', address: '' };
  state.comment = '';
  state.editingArchiveId = null;
  state.editingId = null;
  clearEditingArchiveContext();
  resetMeasurementSubmissionContext();
  persistState();
  showToast('Заказ сохранён в облако');
  state.screen = wasEditing ? 'orders' : 'menu';
  render();
}

function sendOrderFromCart(): void {
  if (!state.cart.length) {
    alert('Добавьте позиции в корзину');
    return;
  }
  const order = buildOrder();
  const existing = state.editingArchiveId ? findOrderByArchiveId(state.editingArchiveId) : null;
  const workStatus = existing?.workStatus ?? 'waiting';
  if (workStatus !== 'waiting') {
    alert('Отправить в работу можно только заказ в статусе «Ожидание»');
    return;
  }

  const saveResult = saveToArchive(order, state.editingArchiveId, existing);
  if (!saveResult.ok || !saveResult.archiveId) {
    if (saveResult.error) alert(saveResult.error);
    return;
  }

  const archiveId = saveResult.archiveId;
  const archivedOrder = findOrderByArchiveId(archiveId);
  if (!archivedOrder) {
    showToast('Заказ сохранён, отправка будет доступна после синхронизации');
    state.screen = 'orders';
    render();
    return;
  }

  void handleSendOrderToWork(archivedOrder, true);
}

function hasDraftChanges(): boolean {
  const hasCustomer = Boolean(
    state.customer.name?.trim() || state.customer.phone?.trim() || state.customer.address?.trim()
  );
  return state.cart.length > 0 || hasCustomer || Boolean(state.comment?.trim());
}

function startArchiveEdit(archivedOrder: ArchivedOrder): void {
  if (hasDraftChanges()) {
    alert('Сначала завершите или очистите текущий черновик в корзине.');
    return;
  }

  state.cart = (archivedOrder.items ?? []).map((item) => enrichCartItemCosts(item, PRICES));
  state.customer = archivedOrder.customer ?? { name: '', phone: '', address: '' };
  state.globalInstall = archivedOrder.globalInstall !== false;
  state.deliveryType = archivedOrder.deliveryType ?? 'city';
  state.deliveryKm = Number(archivedOrder.deliveryKm) || 0;
  state.orderDiscountPercent =
    archivedOrder.orderDiscountPercent === 5 || archivedOrder.orderDiscountPercent === 10
      ? archivedOrder.orderDiscountPercent
      : 0;
  state.paymentMethod = archivedOrder.paymentMethod === 'qr' ? 'qr' : 'cash';
  state.includeMeasurementFee = archivedOrder.includeMeasurementFee !== false;
  state.comment = archivedOrder.generalComment ?? '';
  state.editingArchiveId = archivedOrder.archiveId;
  state.editingId = null;
  state.productType = null;
  persistEditingArchiveContext(archivedOrder.archiveId, archivedOrder.date);
  persistState();
  state.screen = 'cart';
  render();
}

function handleDeleteOrder(order: ArchiveOrderView): void {
  deleteFromArchive(order);
  showToast('Заказ удалён');
  render();
}

async function handleSendOrderToWork(order: ArchiveOrderView, fromCart = false): Promise<void> {
  const docId = order.firestoreId || order.archiveId;
  if (sendingToWorkId) return;

  const hasMeasurementFee = order.includeMeasurementFee === true;
  let isMeasurementPaidCash = false;
  if (hasMeasurementFee && !fromCart) {
    isMeasurementPaidCash = window.confirm(
      'Замер уже оплачен наличными?\n\nДа — вычесть 1000 ₽ из суммы к оплате.\nНет — полная сумма.'
    );
  }

  sendingToWorkId = docId;
  render();
  try {
    await sendOrderToProduction(order, PRICES, isMeasurementPaidCash);
    applyArchiveWorkStatusUpdate(order.archiveId, WORK_STATUS_IN_PRODUCTION, WORK_STATUS_IN_PRODUCTION_LABEL);
    showToast('Заказ отправлен в работу');

    if (fromCart) {
      state.cart = [];
      state.customer = { name: '', phone: '', address: '' };
      state.comment = '';
      state.editingArchiveId = null;
      clearEditingArchiveContext();
      resetMeasurementSubmissionContext();
      persistState();
      state.screen = 'orders';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить заказ';
    alert(message);
  } finally {
    sendingToWorkId = null;
    render();
  }
}

function renderCrmHeader(): HTMLElement {
  const h = el('header', 'crm-header');
  const left = el('div', 'crm-header-left');
  left.appendChild(el('h1', 'crm-title', headerTitle()));
  if (state.screen === 'products' || state.screen === 'calc' || state.screen === 'cart') {
    left.appendChild(el('span', 'crm-price-badge', `Прайс от ${priceDateLabel()}`));
  }
  h.appendChild(left);

  const right = el('div', 'crm-header-actions');
  if (state.screen !== 'menu') {
    right.appendChild(btn('← Назад', goBack, 'btn-header'));
  }
  if (state.screen !== 'menu') {
    right.appendChild(btn('Главная', goToMenu, 'btn-header'));
  }
  const cartLabel = state.cart.length ? `Корзина (${state.cart.length})` : 'Корзина';
  if (state.screen === 'cart') {
    const markupWrap = el('div', 'header-markup-toggle');
    for (const pct of RETAIL_MARKUP_OPTIONS) {
      markupWrap.appendChild(
        btn(
          `${pct}%`,
          () => setRetailMarkupPercent(pct),
          state.retailMarkupPercent === pct ? 'btn-header-markup active' : 'btn-header-markup'
        )
      );
    }
    right.appendChild(markupWrap);
  }
  if (state.screen === 'products' || state.screen === 'calc' || state.screen === 'cart') {
    right.appendChild(btn(cartLabel, goToCart, state.cart.length ? 'btn-header btn-header-primary' : 'btn-header'));
  }
  h.appendChild(right);
  return h;
}

function headerTitle(): string {
  if (state.screen === 'menu') return 'СуперМоскитка';
  if (state.screen === 'measurements') return 'Замеры';
  if (state.screen === 'orders') return 'Заказы в работе';
  if (state.screen === 'products' || state.screen === 'calc' || state.screen === 'cart') return 'Калькулятор';
  return 'CRM';
}

function renderProducts(): HTMLElement {
  const section = el('section', 'products-page');
  if (state.cart.length > 0) {
    const backCart = el('div', 'cart-return-banner');
    backCart.appendChild(
      btn(`← К корзине (${state.cart.length} ${pluralPositions(state.cart.length)})`, goToCart, 'btn-primary btn-block')
    );
    section.appendChild(backCart);
  }
  const matrixTypes = new Set(MATRIX.entries.map((e) => e.productType));

  for (const group of PRODUCT_GROUPS) {
    const available = group.types.filter((t) => matrixTypes.has(t));
    if (!available.length) continue;

    const groupWrap = el('div', 'product-section');
    groupWrap.appendChild(el('h2', 'section-title', group.title));
    const grid = el('div', 'product-grid');

    for (const type of available) {
      const entry = MATRIX.entries.find((e) => e.productType === type);
      const card = el('button', 'product-card');
      card.type = 'button';
      card.appendChild(createProductIcon(type));
      const title = el('span', 'product-card-title', type);
      card.appendChild(title);
      card.appendChild(el('span', 'product-card-sub', PRODUCT_DESC[type] ?? entry?.engine ?? ''));
      card.onclick = () => {
        state.screen = 'calc';
        state.productType = type;
        state.editingId = null;
        form = defaultForm(type);
        render();
      };
      grid.appendChild(card);
    }
    groupWrap.appendChild(grid);
    section.appendChild(groupWrap);
  }
  return section;
}

function renderCalcForm(type: ProductType): HTMLElement {
  const entry = getMatrixEntry(MATRIX, type);
  if (!entry) return el('section', 'panel', 'Неизвестный тип');
  const vis = parseMatrixEntry(entry);
  const ui = UI_MATRIX[type] ?? {};
  form = applyFormRules(type, form);
  const maintenance = isMaintenance(type);
  const section = el('section', 'panel');
  section.appendChild(el('h2', 'calc-title', type));
  if (entry.notes && !/plastic_32mm|frameProfile=32/i.test(entry.notes)) {
    section.appendChild(el('p', 'hint', entry.notes));
  }

  const showWidth = isFieldVisible('width', vis);
  const showHeight = isFieldVisible('height', vis);
  if (showWidth && showHeight) {
    section.appendChild(
      fieldRowPair(
        fieldRow('Ширина, мм', input('number', form.width, (v) => { form.width = v; updatePreview(type); })),
        fieldRow('Высота, мм', input('number', form.height, (v) => { form.height = v; updatePreview(type); }))
      )
    );
  } else {
    if (showWidth) {
      section.appendChild(fieldRow('Ширина, мм', input('number', form.width, (v) => { form.width = v; updatePreview(type); })));
    }
    if (showHeight) {
      section.appendChild(fieldRow('Высота, мм', input('number', form.height, (v) => { form.height = v; updatePreview(type); })));
    }
  }

  const showColor = isFieldVisible('color', vis) && !!ui.color?.length;
  const showFrameProfile = isFieldVisible('frameProfile', vis) && !!ui.frameProfile?.length;
  const showDoorProfile = isFieldVisible('doorProfile', vis) && !!ui.doorProfile?.length;
  if (showColor && showFrameProfile) {
    section.appendChild(
      fieldRowPair(
        selectRow('Цвет профиля', ui.color!, form.color, COLOR_LABELS, (v) => {
          form.color = v as ColorType;
          form = applyFormRules(type, form);
          render();
        }),
        selectRow('Вид профиля', ui.frameProfile!, form.frameProfile, { '25': '25 мм', '32': '32 мм' }, (v) => {
          form.frameProfile = v as '25' | '32';
          form = applyFormRules(type, form);
          render();
        })
      )
    );
  } else if (showColor && showDoorProfile) {
    section.appendChild(
      fieldRowPair(
        selectRow('Цвет профиля', ui.color!, form.color, COLOR_LABELS, (v) => {
          form.color = v as ColorType;
          form = applyFormRules(type, form);
          render();
        }),
        selectRow('Профиль двери', ui.doorProfile!, form.doorProfile, { '32': '32 мм', '42': '42 мм' }, (v) => {
          form.doorProfile = v as '32' | '42';
          updatePreview(type);
        })
      )
    );
  } else if (showColor) {
    section.appendChild(selectRow('Цвет профиля', ui.color!, form.color, COLOR_LABELS, (v) => {
      form.color = v as ColorType;
      form = applyFormRules(type, form);
      render();
    }));
  } else if (showFrameProfile) {
    section.appendChild(selectRow('Вид профиля', ui.frameProfile!, form.frameProfile, { '25': '25 мм', '32': '32 мм' }, (v) => {
      form.frameProfile = v as '25' | '32';
      form = applyFormRules(type, form);
      render();
    }));
  } else if (showDoorProfile) {
    section.appendChild(selectRow('Профиль двери', ui.doorProfile!, form.doorProfile, { '32': '32 мм', '42': '42 мм' }, (v) => {
      form.doorProfile = v as '32' | '42';
      updatePreview(type);
    }));
  }

  const showMesh = isFieldVisible('mesh', vis) && !!ui.mesh?.length;
  const showMount = isFieldVisible('mount', vis) && !!ui.mount?.length;
  const meshLabel = type === ProductType.JALOUSIE_CLASSIC || type === ProductType.JALOUSIE_LIGHT || type === ProductType.JALOUSIE_COZY
    ? 'Ткань'
    : 'Полотно';
  if (showMesh && showMount) {
    section.appendChild(
      fieldRowPair(
        selectRow(meshLabel, ui.mesh!, form.mesh, MESH_LABELS, (v) => {
          form.mesh = v as MeshType;
          updatePreview(type);
        }),
        selectRow('Крепления', ui.mount!, form.mount, MOUNT_LABELS, (v) => {
          form.mount = v as MountType;
          updatePreview(type);
        })
      )
    );
  } else {
    if (showMesh) {
      section.appendChild(selectRow(meshLabel, ui.mesh!, form.mesh, MESH_LABELS, (v) => {
        form.mesh = v as MeshType;
        updatePreview(type);
      }));
    }
    if (showMount) {
      section.appendChild(selectRow('Крепления', ui.mount!, form.mount, MOUNT_LABELS, (v) => {
        form.mount = v as MountType;
        updatePreview(type);
      }));
    }
  }

  const showCorners = isFieldVisible('cornerType', vis) && !!ui.cornerType?.length;
  const showHandles = isFieldVisible('handleType', vis) && !!ui.handleType?.length;
  if (showCorners && showHandles) {
    section.appendChild(
      fieldRowPair(
        selectRow('Уголки', ui.cornerType!, form.cornerType, CORNER_LABELS, (v) => {
          form.cornerType = v as CornerType;
          updatePreview(type);
        }),
        selectRow('Ручки', ui.handleType!, form.handleType, HANDLE_LABELS, (v) => {
          form.handleType = v as HandleType;
          updatePreview(type);
        })
      )
    );
  } else {
    if (showCorners) {
      section.appendChild(selectRow('Уголки', ui.cornerType!, form.cornerType, CORNER_LABELS, (v) => {
        form.cornerType = v as CornerType;
        updatePreview(type);
      }));
    }
    if (showHandles) {
      section.appendChild(selectRow('Ручки', ui.handleType!, form.handleType, HANDLE_LABELS, (v) => {
        form.handleType = v as HandleType;
        updatePreview(type);
      }));
    }
  }

  if (isFieldVisible('opening', vis) && ui.opening?.length) {
    const opts = type === ProductType.JALOUSIE_COZY ? ui.opening.filter((o) => o !== 'counter') : ui.opening;
    section.appendChild(selectRow('Открывание', opts, form.opening, OPENING_LABELS, (v) => {
      form.opening = v as PlisseOpening;
      form = applyFormRules(type, form);
      render();
    }));
  }
  if (isFieldVisible('threshold', vis) && ui.threshold?.length) {
    section.appendChild(selectRow('Порог', ui.threshold, form.threshold, THRESHOLD_LABELS, (v) => {
      form.threshold = v as PlisseThreshold;
      updatePreview(type);
    }));
  }
  if (isFieldVisible('handles', vis) && ui.handles?.length) {
    const opts = (form.opening === 'counter' ? [4] : ui.handles).map(String);
    section.appendChild(selectRow('Кол-во ручек', opts, String(form.handles), {}, (v) => {
      form.handles = Number(v);
      updatePreview(type);
    }));
  }
  if (isFieldVisible('hingesCount', vis) && ui.hingesCount?.length) {
    section.appendChild(selectRow('Петли', ui.hingesCount.map(String), String(form.hingesCount), {}, (v) => {
      form.hingesCount = Number(v);
      updatePreview(type);
    }));
  }
  if (isFieldVisible('hasLatch', vis)) {
    section.appendChild(checkRow('Защёлка', form.hasLatch, (v) => { form.hasLatch = v; updatePreview(type); }));
  }
  if (isFieldVisible('hasBolt', vis)) {
    section.appendChild(checkRow('Шпингалет', form.hasBolt, (v) => { form.hasBolt = v; updatePreview(type); }));
  }
  if (isFieldVisible('subType', vis) && ui.subType?.length) {
    section.appendChild(
      selectRow('Тип', ui.subType, form.subType, { window: 'Окно', door: 'Дверь' }, (v) => {
        form.subType = v as 'window' | 'door';
        updatePreview(type);
      })
    );
  }

  const showQuantity = isFieldVisible('quantity', vis);
  if (showQuantity) {
    const unit = ui.quantity_unit === 'm' ? 'м.п.' : ui.quantity_unit === 'pcs' ? 'шт.' : 'шт.';
    section.appendChild(
      fieldRowPair(
        fieldRow(`Количество (${unit})`, input('number', String(form.quantity), (v) => {
          form.quantity = Math.max(1, Number(v) || 1);
          updatePreview(type);
        })),
        fieldRow('Примечание', input('text', form.comment, (v) => { form.comment = v; }))
      )
    );
  } else {
    section.appendChild(fieldRow('Примечание', input('text', form.comment, (v) => { form.comment = v; })));
  }

  const preview = el('div', 'price-preview');
  const result = calcFromForm(type, form);
  setPricePreview(preview, result);
  section.appendChild(preview);

  const actions = el('div', 'actions');
  actions.appendChild(
    btn(state.editingId ? 'Сохранить' : 'В корзину', () => {
      const r = calcFromForm(type, form);
      if (!r) {
        alert(maintenance ? 'Укажите количество' : 'Укажите корректные размеры');
        return;
      }
      const item: WebCartItem = {
        id: state.editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        width: maintenance ? undefined : Number(form.width),
        height: maintenance ? undefined : Number(form.height),
        quantity: form.quantity,
        color: form.color,
        mesh: form.mesh,
        mount: form.mount,
        cornerType: form.cornerType,
        handleType: form.handleType,
        frameProfile: form.frameProfile,
        doorProfile: form.doorProfile,
        hingesCount: form.hingesCount,
        hasLatch: form.hasLatch,
        hasBolt: form.hasBolt,
        subType: form.subType,
        opening: form.opening,
        threshold: form.threshold,
        handles: form.handles,
        price: r.total,
        installPrice: r.install,
        costMaterials: r.costMaterials,
        costAssembly: r.costAssembly,
        costTotal: r.costTotal,
        profit: r.profit,
        marginPercent: r.marginPercent,
        details: buildDetails(form),
        comment: form.comment || undefined,
      };
      if (state.editingId) {
        state.cart = state.cart.map((c) => (c.id === state.editingId ? item : c));
      } else {
        state.cart.push(item);
      }
      state.screen = 'cart';
      state.productType = null;
      state.editingId = null;
      persistState();
      render();
    }, 'btn-primary')
  );
  section.appendChild(actions);
  return section;
}

function setPricePreview(preview: HTMLElement, result: ReturnType<typeof calcFromForm>): void {
  if (result) {
    preview.style.display = '';
    preview.textContent = `Позиция: ${result.total.toLocaleString('ru-RU')} ₽ · монтаж (поз.): ${result.install.toLocaleString('ru-RU')} ₽`;
  } else {
    preview.style.display = 'none';
    preview.textContent = '';
  }
}

function updatePreview(type: ProductType): void {
  const preview = document.querySelector('.price-preview');
  if (!preview) return;
  setPricePreview(preview as HTMLElement, calcFromForm(type, form));
}

function renderCart(): HTMLElement {
  const layout = el('section', 'cart-layout');
  const totals = calculateOrderTotals(buildOrder(), PRICES);
  layout.appendChild(renderCartWorkspace());
  layout.appendChild(renderOrderSidebar(totals));
  return layout;
}

function renderCartWorkspace(): HTMLElement {
  const workspace = el('div', 'cart-workspace');
  const today = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const customerPanel = el('div', 'customer-panel');
  const custHeader = el('div', 'customer-panel-header');
  custHeader.appendChild(el('h3', 'customer-panel-title', '👤 Данные клиента'));
  custHeader.appendChild(el('span', 'customer-panel-date', today));
  customerPanel.appendChild(custHeader);
  customerPanel.appendChild(iconInput('👤', 'Имя клиента', state.customer.name, (v) => { state.customer.name = v; persistState(); }));
  customerPanel.appendChild(iconInput('📞', 'Телефон', state.customer.phone, (v) => { state.customer.phone = v; persistState(); }));
  customerPanel.appendChild(iconInput('📍', 'Адрес объекта', state.customer.address, (v) => { state.customer.address = v; persistState(); }));
  workspace.appendChild(customerPanel);

  workspace.appendChild(renderCartItemsCard());
  workspace.appendChild(renderInstallCard());
  workspace.appendChild(renderDeliveryCard());
  workspace.appendChild(renderCommentCard());

  return workspace;
}

function renderCartItemsCard(): HTMLElement {
  const itemsCard = el('div', 'card cart-items-card');
  const itemsHeader = el('div', 'card-header');
  itemsHeader.appendChild(el('h2', '', 'Позиции в заказе'));
  itemsCard.appendChild(itemsHeader);
  const itemsBody = el('div', 'card-body');

  if (state.cart.length === 0) {
    itemsBody.appendChild(el('p', 'empty-cart', 'Корзина пуста. Добавьте позиции.'));
  } else {
    const list = el('ul', 'cart-list');
    state.cart.forEach((item) => list.appendChild(renderCartItem(item)));
    itemsBody.appendChild(list);
  }

  itemsBody.appendChild(btn('+ Добавить позицию', () => { state.screen = 'products'; persistState(); render(); }, 'btn-primary btn-block'));
  itemsCard.appendChild(itemsBody);
  return itemsCard;
}

function renderCartItem(item: WebCartItem): HTMLElement {
  const li = el('li', 'cart-item');
  const top = el('div', 'cart-item-top');
  const info = el('div', '');
  info.appendChild(el('h4', 'cart-item-title', TYPE_DISPLAY_LABELS[item.type] ?? item.type));
  info.appendChild(el('p', 'cart-item-details', formatItemDetails(item)));
  top.appendChild(info);

  const btns = el('div', 'cart-item-actions');
  const editBtn = el('button', 'btn-icon', '✏️');
  editBtn.type = 'button';
  editBtn.title = 'Изменить';
  editBtn.onclick = () => {
    state.screen = 'calc';
    state.productType = item.type;
    state.editingId = item.id;
    form = defaultForm(item.type, item);
    render();
  };
  btns.appendChild(editBtn);
  const delBtn = el('button', 'btn-icon btn-icon-danger', '🗑');
  delBtn.type = 'button';
  delBtn.title = 'Удалить';
  delBtn.onclick = () => {
    state.cart = state.cart.filter((c) => c.id !== item.id);
    persistState();
    render();
  };
  btns.appendChild(delBtn);
  top.appendChild(btns);
  li.appendChild(top);

  const bottom = el('div', 'cart-item-bottom');
  const qty = el('div', 'qty-control');
  const minusBtn = el('button', 'qty-btn', '−');
  minusBtn.type = 'button';
  minusBtn.onclick = () => handleUpdateQuantity(item.id, (item.quantity || 1) - 1);
  qty.appendChild(minusBtn);
  qty.appendChild(el('span', 'qty-value', String(item.quantity || 1)));
  const plusBtn = el('button', 'qty-btn', '+');
  plusBtn.type = 'button';
  plusBtn.onclick = () => handleUpdateQuantity(item.id, (item.quantity || 1) + 1);
  qty.appendChild(plusBtn);
  bottom.appendChild(qty);
  bottom.appendChild(el('span', 'cart-item-price', `${item.price.toLocaleString('ru-RU')} ₽`));
  li.appendChild(bottom);
  return li;
}

function renderInstallCard(): HTMLElement {
  const installCard = el('div', 'card');
  const installHeader = el('div', 'card-header');
  installHeader.appendChild(el('h2', '', 'Монтажные работы'));
  installCard.appendChild(installHeader);
  const installBody = el('div', 'card-body');
  installBody.appendChild(
    segmentToggle(
      [{ value: 'yes', label: 'Нужны' }, { value: 'no', label: 'Не нужны' }],
      state.globalInstall ? 'yes' : 'no',
      (v) => {
        state.globalInstall = v === 'yes';
        persistState();
        render();
      }
    )
  );
  installCard.appendChild(installBody);
  return installCard;
}

function renderDeliveryCard(): HTMLElement {
  const deliveryCard = el('div', 'card');
  const deliveryHeader = el('div', 'card-header');
  deliveryHeader.appendChild(el('h2', '', 'Доставка'));
  deliveryCard.appendChild(deliveryHeader);
  const deliveryBody = el('div', 'card-body');
  deliveryBody.appendChild(
    radioGroup(
      [
        { value: 'city', label: 'По городу' },
        { value: 'out', label: 'За город' },
        { value: 'pickup', label: 'Самовывоз' },
      ],
      state.deliveryType,
      (v) => {
        state.deliveryType = v as AppState['deliveryType'];
        persistState();
        render();
      }
    )
  );
  if (state.deliveryType === 'out') {
    deliveryBody.appendChild(
      fieldRow('Расстояние, км', input('number', String(state.deliveryKm), (v) => {
        state.deliveryKm = Number(v) || 0;
        persistState();
        render();
      }))
    );
  }
  deliveryCard.appendChild(deliveryBody);
  return deliveryCard;
}

function renderCommentCard(): HTMLElement {
  const commentCard = el('div', 'card card-comment');
  const commentHeader = el('div', 'card-header');
  commentHeader.appendChild(el('h2', '', 'Комментарий к заказу'));
  commentCard.appendChild(commentHeader);
  const commentBody = el('div', 'card-body');
  const textarea = document.createElement('textarea');
  textarea.className = 'input';
  textarea.placeholder = 'Добавьте заметку для менеджера или производства...';
  textarea.value = state.comment;
  textarea.rows = 3;
  textarea.oninput = () => { state.comment = textarea.value; persistState(); };
  commentBody.appendChild(textarea);
  commentCard.appendChild(commentBody);
  return commentCard;
}

function exportCartTxt(): void {
  if (!state.cart.length) {
    alert('Добавьте позиции');
    return;
  }
  const order = buildOrder();
  const t = calculateOrderTotals(order, PRICES);
  const fileName = state.customer.name?.trim() || state.customer.address?.trim() || `Заказ_${new Date().toISOString().slice(0, 10)}`;
  saveTextFile(fileName, formatCartOrder(order, t));
}

function clearOrder(): void {
  if (!confirm('Очистить заказ?')) return;
  const wasEditing = Boolean(state.editingArchiveId);
  state.cart = [];
  state.customer = { name: '', phone: '', address: '' };
  state.comment = '';
  state.editingArchiveId = null;
  clearEditingArchiveContext();
  resetMeasurementSubmissionContext();
  persistState();
  if (wasEditing) {
    state.screen = 'orders';
  }
  render();
}

function getMeasurementInput(
  totals: ReturnType<typeof calculateOrderTotals>,
): MeasurementSubmissionInput {
  if (!state.measurementSubmissionId) {
    state.measurementSubmissionId = createMeasurementSubmissionId();
    persistState();
  }
  return {
    submissionId: state.measurementSubmissionId,
    name: state.customer.name,
    phone: state.customer.phone,
    address: state.customer.address,
    apartment: state.measurementApartment,
    comment: state.comment,
    preferredTime: state.measurementPreferredTime,
    preliminaryTotalRub: totals.grandTotal,
    payerType: state.measurementPayerType,
    items: state.cart,
  };
}

function currentMeasurementFingerprint(
  totals: ReturnType<typeof calculateOrderTotals>,
): string | null {
  if (!state.measurementSubmissionId) return null;
  try {
    return measurementFingerprint(buildMeasurementSubmission(getMeasurementInput(totals)));
  } catch {
    return null;
  }
}

async function executeMeasurementSubmission(
  inputData: MeasurementSubmissionInput,
  controls: HTMLButtonElement[] = [],
): Promise<void> {
  if (measurementRequestInProgress) return;
  measurementRequestInProgress = true;
  controls.forEach((control) => { control.disabled = true; });
  render();
  try {
    const result = await submitMeasurement(inputData, measurementIntakeGateway);
    const fingerprint = measurementFingerprint(buildMeasurementSubmission(inputData));
    state.measurementSubmittedFingerprint = fingerprint;
    state.measurementSheetStatus = result.sheet === 'SENT' ? 'sent' : 'error';
    state.measurementSheetErrorCode = result.status === 'PARTIAL' ? result.errorCode : undefined;
    persistState();
    if (result.status === 'SUBMITTED') {
      showToast('Заявка записана на замер');
    }
  } catch (error) {
    state.measurementSheetStatus = undefined;
    state.measurementSheetErrorCode =
      error instanceof Error && 'code' in error ? String(error.code) : 'MEASUREMENT_PERSISTENCE_FAILED';
    persistState();
    alert(error instanceof Error ? error.message : 'Не удалось записать на замер');
  } finally {
    measurementRequestInProgress = false;
    controls.forEach((control) => { control.disabled = false; });
    render();
  }
}

function openMeasurementConfirmation(totals: ReturnType<typeof calculateOrderTotals>): void {
  const draft = getMeasurementInput(totals);
  const dialog = document.createElement('dialog');
  dialog.className = 'measurement-dialog';
  const form = el('form', 'measurement-dialog-form');
  form.onsubmit = (event) => event.preventDefault();
  form.appendChild(el('h2', 'measurement-dialog-title', 'Запись на замер'));
  form.appendChild(
    el('p', 'measurement-dialog-summary', buildCompactItemSummary(state.cart) || 'Нет позиций'),
  );

  const makeField = (
    title: string,
    value: string,
    onInput: (value: string) => void,
    multiline = false,
  ): HTMLElement => {
    const labelNode = el('label', 'measurement-dialog-field');
    labelNode.appendChild(el('span', '', title));
    const control = multiline ? document.createElement('textarea') : document.createElement('input');
    control.className = 'input';
    control.value = value;
    if (control instanceof HTMLTextAreaElement) control.rows = 2;
    control.oninput = () => onInput(control.value);
    labelNode.appendChild(control);
    return labelNode;
  };

  form.appendChild(makeField('Имя', draft.name ?? '', (value) => { draft.name = value; }));
  form.appendChild(makeField('Телефон *', draft.phone, (value) => { draft.phone = value; }));
  form.appendChild(makeField('Адрес *', draft.address, (value) => { draft.address = value; }));
  form.appendChild(makeField('Квартира', draft.apartment ?? '', (value) => { draft.apartment = value; }));
  const total = el(
    'div',
    'measurement-dialog-total',
    `Предварительная сумма: ${draft.preliminaryTotalRub.toLocaleString('ru-RU')} ₽`,
  );
  form.appendChild(total);
  form.appendChild(makeField('Комментарий', draft.comment ?? '', (value) => { draft.comment = value; }, true));
  form.appendChild(
    makeField('Желаемое время', draft.preferredTime ?? '', (value) => { draft.preferredTime = value; }),
  );

  const payerLabel = el('label', 'measurement-dialog-field');
  payerLabel.appendChild(el('span', '', 'Замер оплачивает'));
  const payerSelect = document.createElement('select');
  payerSelect.className = 'input';
  payerSelect.appendChild(new Option('Клиент', 'CUSTOMER'));
  payerSelect.appendChild(new Option('Фирма', 'COMPANY'));
  payerSelect.value = draft.payerType;
  payerSelect.onchange = () => { draft.payerType = payerSelect.value as MeasurementPayerType; };
  payerLabel.appendChild(payerSelect);
  form.appendChild(payerLabel);

  const errorNode = el('p', 'measurement-dialog-error');
  form.appendChild(errorNode);
  const actions = el('div', 'measurement-dialog-actions');
  const cancelButton = btn('Отмена', () => dialog.close(), 'btn-secondary');
  const submitButton = btn(
    state.measurementSubmittedFingerprint ? 'Обновить заявку' : 'Записать на замер',
    () => {
      state.customer = {
        name: draft.name ?? '',
        phone: draft.phone,
        address: draft.address,
      };
      state.comment = draft.comment ?? '';
      state.measurementApartment = draft.apartment ?? '';
      state.measurementPreferredTime = draft.preferredTime ?? '';
      state.measurementPayerType = draft.payerType;
      persistState();
      void executeMeasurementSubmission(draft, [submitButton, cancelButton]).then(() => dialog.close());
    },
    'btn-primary',
  );
  actions.appendChild(cancelButton);
  actions.appendChild(submitButton);
  form.appendChild(actions);
  dialog.appendChild(form);
  dialog.onclose = () => dialog.remove();
  document.body.appendChild(dialog);
  dialog.showModal();
}

function retryMeasurementSubmission(totals: ReturnType<typeof calculateOrderTotals>): void {
  const draft = getMeasurementInput(totals);
  void executeMeasurementSubmission(draft);
}

function renderOrderSidebar(totals: ReturnType<typeof calculateOrderTotals>): HTMLElement {
  const panel = el('aside', 'order-panel');

  const head = el('div', 'order-panel-head');
  head.appendChild(el('h2', 'order-panel-title', 'Заказ'));
  head.appendChild(el('span', 'order-panel-count', `${state.cart.length} ${pluralPositions(state.cart.length)}`));
  panel.appendChild(head);

  const body = el('div', 'order-panel-body');
  body.appendChild(totalsRow('Позиции', `${totals.itemsBasePrice.toLocaleString('ru-RU')} ₽`));
  if (state.globalInstall && totals.installTotal > 0) {
    body.appendChild(totalsRow('Монтаж', `${totals.installTotal.toLocaleString('ru-RU')} ₽`));
  }
  if (totals.measurementFee > 0) {
    body.appendChild(totalsRow('Замер (депозит)', `${totals.measurementFee.toLocaleString('ru-RU')} ₽`));
  }
  if (state.deliveryType !== 'pickup' || totals.deliveryCost > 0) {
    body.appendChild(totalsRow('Доставка', `${totals.deliveryCost.toLocaleString('ru-RU')} ₽`));
  }
  if (totals.discountAmount > 0) {
    body.appendChild(totalsRow(`Скидка ${totals.discountPercent}%`, `−${totals.discountAmount.toLocaleString('ru-RU')} ₽`));
  }
  if (totals.paymentSurcharge > 0) {
    body.appendChild(totalsRow('QR +8%', `${totals.paymentSurcharge.toLocaleString('ru-RU')} ₽`));
  }

  body.appendChild(
    segmentToggle(
      [{ value: '0', label: 'Без скидки' }, { value: '5', label: '5%' }, { value: '10', label: '10%' }],
      String(state.orderDiscountPercent),
      (v) => {
        state.orderDiscountPercent = Number(v) as 0 | 5 | 10;
        persistState();
        render();
      }
    )
  );
  body.appendChild(
    segmentToggle(
      [{ value: 'cash', label: 'Наличными' }, { value: 'qr', label: 'Картой / QR' }],
      state.paymentMethod,
      (v) => {
        state.paymentMethod = v as 'cash' | 'qr';
        persistState();
        render();
      }
    )
  );

  body.appendChild(
    orderPanelCheckRow(
      measurementFeeLabel(),
      state.includeMeasurementFee,
      (v) => {
        state.includeMeasurementFee = v;
        persistState();
        render();
      }
    )
  );

  const orderCost = calculateOrderCostMetrics(
    state.cart,
    { grandTotal: totals.grandTotal, deliveryCost: totals.deliveryCost, measurementFee: totals.measurementFee },
    { globalInstall: state.globalInstall, deliveryType: state.deliveryType }
  );
  const rentBlock = el('div', 'order-panel-rentability');
  const rentRow = el('div', 'order-panel-rentability-row');
  rentRow.appendChild(el('span', 'label', 'Рентабельность заказа'));
  rentRow.appendChild(
    el('span', 'value', orderCost != null ? `${orderCost.orderMarginPercent.toLocaleString('ru-RU')}%` : '—')
  );
  rentBlock.appendChild(rentRow);
  const profitRow = el('div', 'order-panel-rentability-row order-panel-rentability-profit');
  profitRow.appendChild(el('span', 'label', 'Прибыль'));
  profitRow.appendChild(
    el('span', 'value', orderCost != null ? `${orderCost.orderProfit.toLocaleString('ru-RU')} ₽` : '—')
  );
  rentBlock.appendChild(profitRow);
  body.appendChild(rentBlock);

  const grand = el('div', 'order-panel-grand');
  grand.appendChild(el('span', 'label', 'Итого к оплате'));
  grand.appendChild(el('span', 'value', `${totals.grandTotal.toLocaleString('ru-RU')} ₽`));
  body.appendChild(grand);
  panel.appendChild(body);

  const actions = el('div', 'order-panel-actions');
  const currentFingerprint = currentMeasurementFingerprint(totals);
  const alreadySubmitted =
    state.measurementSheetStatus === 'sent'
    && currentFingerprint != null
    && currentFingerprint === state.measurementSubmittedFingerprint;
  const measurementLabel = alreadySubmitted
    ? 'Заявка уже записана'
    : state.measurementSubmittedFingerprint
      ? 'Обновить заявку на замер'
      : 'Записать на замер';
  actions.appendChild(
    btn(
      measurementLabel,
      () => openMeasurementConfirmation(totals),
      'btn-measurement btn-block',
      measurementRequestInProgress || alreadySubmitted,
    ),
  );
  if (state.measurementSheetStatus === 'sent' && alreadySubmitted) {
    actions.appendChild(el('p', 'measurement-submit-status status-success', '✅ Записан на замер'));
  } else if (state.measurementSheetStatus === 'sent') {
    actions.appendChild(
      el(
        'p',
        'measurement-submit-status status-warning',
        'Данные расчёта изменены — обновите заявку на замер',
      ),
    );
  } else if (state.measurementSheetStatus === 'error') {
    actions.appendChild(
      el(
        'p',
        'measurement-submit-status status-warning',
        '⚠ Заявка у замерщика создана, таблица не синхронизирована',
      ),
    );
    if (currentFingerprint === state.measurementSubmittedFingerprint) {
      actions.appendChild(
        btn(
          'Повторить отправку в таблицу',
          () => retryMeasurementSubmission(totals),
          'btn-secondary btn-block',
          measurementRequestInProgress,
        ),
      );
    }
  } else if (state.measurementSheetErrorCode) {
    actions.appendChild(
      el('p', 'measurement-submit-status status-error', '❌ Не удалось записать на замер'),
    );
  }
  actions.appendChild(btn('Сохранить заказ', saveOrder, 'btn-primary btn-block'));
  const existingOrder = state.editingArchiveId ? findOrderByArchiveId(state.editingArchiveId) : null;
  const canSendToWork = (existingOrder?.workStatus ?? 'waiting') === 'waiting' || !state.editingArchiveId;
  if (canSendToWork && state.cart.length > 0) {
    actions.appendChild(btn('Отправить в работу', sendOrderFromCart, 'btn-primary btn-block btn-send-work'));
  }
  actions.appendChild(btn('Экспорт корзины (.txt)', exportCartTxt, 'btn-export-cart btn-block'));
  actions.appendChild(btn('Очистить корзину', clearOrder, 'btn-danger btn-block'));
  panel.appendChild(actions);

  return panel;
}

function pluralPositions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'позиций';
  if (mod10 === 1) return 'позиция';
  if (mod10 >= 2 && mod10 <= 4) return 'позиции';
  return 'позиций';
}

function totalsRow(labelText: string, valueText: string): HTMLElement {
  const row = el('div', 'order-panel-row');
  row.appendChild(el('span', 'label', labelText));
  row.appendChild(el('span', 'value', valueText));
  return row;
}

function iconInput(icon: string, placeholder: string, value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = el('div', 'icon-input-wrap');
  wrap.appendChild(el('span', 'icon-input-icon', icon));
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'icon-input';
  inp.placeholder = placeholder;
  inp.value = value;
  inp.oninput = () => onChange(inp.value);
  wrap.appendChild(inp);
  return wrap;
}

function orderPanelCheckRow(labelText: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = el('label', 'order-panel-check');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.onchange = () => onChange(cb.checked);
  wrap.appendChild(cb);
  wrap.appendChild(document.createTextNode(` ${labelText}`));
  return wrap;
}

function radioGroup(
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const wrap = el('div', 'radio-group');
  for (const opt of options) {
    const b = el('button', `radio-option${opt.value === value ? ' active' : ''}`);
    b.type = 'button';
    b.appendChild(el('span', 'radio-dot', ''));
    b.appendChild(el('span', 'radio-label', opt.label));
    b.onclick = () => onChange(opt.value);
    wrap.appendChild(b);
  }
  return wrap;
}

function selectRow(
  labelText: string,
  options: string[],
  value: string,
  labels: Record<string, string>,
  onChange: (v: string) => void,
  disabledValues: string[] = []
): HTMLElement {
  const sel = document.createElement('select');
  sel.className = 'input';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = labels[opt] ?? opt;
    o.disabled = disabledValues.includes(opt);
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => onChange(sel.value);
  return fieldRow(labelText, sel);
}

function checkRow(labelText: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = el('label', 'check-row');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.onchange = () => onChange(cb.checked);
  wrap.appendChild(cb);
  wrap.appendChild(document.createTextNode(` ${labelText}`));
  return fieldRow('', wrap);
}

initTheme();

let crmSubscriptionsStarted = false;

function startCrmSubscriptions(): void {
  if (crmSubscriptionsStarted) return;
  crmSubscriptionsStarted = true;
  startOrdersSubscription();
  startMeasurementsSubscription();
  subscribeOrders(() => {
    if (state.screen === 'orders') render();
  });
  subscribeMeasurements(() => {
    if (state.screen === 'measurements') render();
  });
}

function bootstrapApp(): void {
  if (!isAuthenticated()) {
    crmSubscriptionsStarted = false;
    render();
    return;
  }
  startCrmSubscriptions();
  render();
}

bootstrapApp();
