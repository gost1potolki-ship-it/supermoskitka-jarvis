import { btn, el } from '../dom';
import {
  createJarvisDevApi,
  createLabMessageId,
  type ConversationDto,
  type ConversationOrderStateDto,
  type HandleCustomerMessageResultDto,
  type JarvisDevApi,
  JarvisDevApiError,
  type MeasurementActionDto,
  type MessageDto,
} from '../lib/jarvis-dev-api';
import {
  loadActiveConversationId,
  loadRecentConversations,
  rememberConversation,
  removeConversation,
  saveActiveConversationId,
  type JarvisLabRecentConversation,
} from '../lib/jarvis-lab-storage';

export interface JarvisLabSnapshot {
  configured: boolean;
  loading: boolean;
  loadingLabel: string;
  error: string | null;
  conversation: ConversationDto | null;
  orderState: ConversationOrderStateDto | null;
  measurementAction: MeasurementActionDto | null;
}

export interface JarvisDialoguesPanelHandle {
  switchMode: (mode: 'AI' | 'HUMAN') => Promise<void>;
  createConversation: () => Promise<void>;
}

export interface JarvisDialoguesPanelDeps {
  api?: JarvisDevApi;
  onSnapshot?: (snapshot: JarvisLabSnapshot) => void;
}

export interface JarvisLabDeps {
  onBack: () => void;
  api?: JarvisDevApi;
}

interface PendingMessage {
  messageId: string;
  text: string;
}

interface LabState {
  configured: boolean;
  loading: boolean;
  loadingLabel: string;
  error: string | null;
  conversation: ConversationDto | null;
  messages: MessageDto[];
  orderState: ConversationOrderStateDto | null;
  measurementAction: MeasurementActionDto | null;
  recent: JarvisLabRecentConversation[];
  pendingMessage: PendingMessage | null;
  inputText: string;
}

const CONFIG_MESSAGE =
  'Jarvis Lab не настроен. Проверьте локальные переменные JARVIS_DEV_API_BASE_URL и JARVIS_DEV_INTERNAL_API_KEY.';

const formatMoney = (value?: number): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ru-RU')} ₽` : '—';

const formatTime = (value?: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

const senderLabel = (sender: MessageDto['sender']): string => {
  if (sender === 'AI') return 'Jarvis';
  if (sender === 'HUMAN') return 'Оператор';
  return 'Клиент';
};

const measurementActionLabel = (kind: MeasurementActionDto['kind']): string => {
  if (kind === 'AUTO_ALLOWED') return 'ГОТОВО К ЗАМЕРУ';
  if (kind === 'AWAITING_OWNER_APPROVAL') return 'Ручная проверка владельца';
  return 'NOT_READY';
};

export function renderJarvisDialoguesPanel(deps: JarvisDialoguesPanelDeps): {
  element: HTMLElement;
  handle: JarvisDialoguesPanelHandle;
} {
  const api = deps.api ?? createJarvisDevApi();
  const root = el('div', 'jarvis-lab jarvis-lab-panel');

  const state: LabState = {
    configured: true,
    loading: false,
    loadingLabel: '',
    error: null,
    conversation: null,
    messages: [],
    orderState: null,
    measurementAction: null,
    recent: loadRecentConversations(),
    pendingMessage: null,
    inputText: '',
  };

  let sendInput: HTMLTextAreaElement | null = null;
  let sendButton: HTMLButtonElement | null = null;
  let retryButton: HTMLButtonElement | null = null;

  const setLoading = (label: string): void => {
    state.loading = true;
    state.loadingLabel = label;
    paint();
  };

  const clearLoading = (): void => {
    state.loading = false;
    state.loadingLabel = '';
  };

  const setError = (error: unknown): void => {
    if (error instanceof JarvisDevApiError) {
      if (error.status === 503 && error.code !== 'NETWORK_ERROR') {
        state.configured = false;
        state.error = CONFIG_MESSAGE;
        return;
      }
      state.error = error.message;
      console.warn('[Jarvis Lab]', error.code, error.status);
      return;
    }
    state.error = error instanceof Error ? error.message : 'Не удалось выполнить запрос.';
    console.warn('[Jarvis Lab]', state.error);
  };

  const refreshPanels = async (conversationId: string): Promise<void> => {
    const [messages, orderState, measurementAction, conversation] = await Promise.all([
      api.getMessages(conversationId),
      api.getOrderState(conversationId),
      api.getMeasurementAction(conversationId),
      api.getConversation(conversationId),
    ]);
    state.conversation = conversation;
    state.messages = messages.messages;
    state.orderState = orderState;
    state.measurementAction = measurementAction;
    state.recent = rememberConversation(conversationId, {
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      label: orderState.customer.phone || orderState.customer.address || conversationId.slice(0, 8),
    });
    saveActiveConversationId(conversationId);
  };

  const openConversation = async (conversationId: string): Promise<void> => {
    setLoading('Обновляем состояние...');
    state.error = null;
    try {
      await refreshPanels(conversationId);
    } catch (error) {
      if (error instanceof JarvisDevApiError && error.status === 404) {
        removeConversation(conversationId);
        state.recent = loadRecentConversations();
        if (loadActiveConversationId() === conversationId) {
          saveActiveConversationId(null);
        }
        state.conversation = null;
        state.messages = [];
        state.orderState = null;
        state.measurementAction = null;
        state.error = 'Диалог не найден.';
      } else {
        setError(error);
      }
    } finally {
      clearLoading();
      paint();
    }
  };

  const createConversation = async (): Promise<void> => {
    setLoading('Создание диалога...');
    state.error = null;
    try {
      const conversation = await api.createConversation();
      await refreshPanels(conversation.conversationId);
      state.pendingMessage = null;
      state.inputText = '';
    } catch (error) {
      setError(error);
    } finally {
      clearLoading();
      paint();
      sendInput?.focus();
    }
  };

  const sendPendingMessage = async (): Promise<void> => {
    if (!state.conversation || !state.pendingMessage || state.loading) return;
    setLoading('Jarvis думает...');
    state.error = null;
    try {
      const result: HandleCustomerMessageResultDto = await api.sendCustomerMessage(
        state.conversation.conversationId,
        state.pendingMessage.messageId,
        state.pendingMessage.text,
      );
      state.conversation = {
        ...state.conversation,
        mode: result.conversationMode,
        updatedAt: new Date().toISOString(),
      };
      await refreshPanels(state.conversation.conversationId);
      state.pendingMessage = null;
      state.inputText = '';
    } catch (error) {
      setError(error);
    } finally {
      clearLoading();
      paint();
    }
  };

  const queueCustomerMessage = (): void => {
    if (!state.conversation || state.loading) return;
    const text = state.inputText.trim();
    if (!text) return;
    if (!state.pendingMessage) {
      state.pendingMessage = { messageId: createLabMessageId(), text };
    } else {
      state.pendingMessage = { ...state.pendingMessage, text };
    }
    void sendPendingMessage();
  };

  const switchMode = async (mode: 'AI' | 'HUMAN'): Promise<void> => {
    if (!state.conversation || state.loading || state.conversation.mode === mode) return;
    setLoading('Обновляем состояние...');
    state.error = null;
    try {
      state.conversation = await api.setConversationMode(state.conversation.conversationId, mode);
      await refreshPanels(state.conversation.conversationId);
    } catch (error) {
      setError(error);
    } finally {
      clearLoading();
      paint();
    }
  };

  const handle: JarvisDialoguesPanelHandle = {
    switchMode,
    createConversation,
  };

  const emitSnapshot = (): void => {
    deps.onSnapshot?.({
      configured: state.configured,
      loading: state.loading,
      loadingLabel: state.loadingLabel,
      error: state.error,
      conversation: state.conversation,
      orderState: state.orderState,
      measurementAction: state.measurementAction,
    });
  };

  const renderToolbar = (): HTMLElement => {
    const toolbar = el('div', 'jarvis-lab-toolbar');
    const newBtn = btn('Новый диалог', () => void createConversation(), 'btn-primary');
    newBtn.disabled = state.loading;
    toolbar.appendChild(newBtn);
    return toolbar;
  };

  const renderRecent = (): HTMLElement => {
    const panel = el('aside', 'jarvis-lab-sidebar');
    panel.appendChild(el('h2', 'jarvis-lab-panel-title', 'Тестовые диалоги'));
    const list = el('div', 'jarvis-lab-recent-list');
    if (!state.recent.length) {
      list.appendChild(el('p', 'jarvis-lab-empty', 'Пока нет сохранённых диалогов.'));
    }
    for (const entry of state.recent) {
      const item = btn(
        entry.label || entry.conversationId.slice(0, 12),
        () => void openConversation(entry.conversationId),
        entry.conversationId === state.conversation?.conversationId
          ? 'jarvis-lab-recent-item jarvis-lab-recent-item--active'
          : 'jarvis-lab-recent-item',
      );
      item.type = 'button';
      item.title = entry.conversationId;
      list.appendChild(item);
    }
    panel.appendChild(list);
    return panel;
  };

  const renderTranscript = (): HTMLElement => {
    const panel = el('section', 'jarvis-lab-transcript');
    panel.appendChild(el('h2', 'jarvis-lab-panel-title', 'Диалог'));
    if (state.conversation?.mode === 'HUMAN') {
      panel.appendChild(el('p', 'jarvis-lab-human-banner', 'HUMAN — Jarvis не отвечает'));
    }
    const list = el('div', 'jarvis-lab-messages');
    if (!state.messages.length) {
      list.appendChild(el('p', 'jarvis-lab-empty', 'Диалог пуст. Введите первое сообщение клиента.'));
    }
    for (const message of state.messages) {
      const row = el('article', `jarvis-lab-message jarvis-lab-message--${message.sender.toLowerCase()}`);
      const meta = el('div', 'jarvis-lab-message-meta');
      meta.appendChild(el('span', 'jarvis-lab-message-author', senderLabel(message.sender)));
      const time = formatTime(message.createdAt);
      if (time) meta.appendChild(el('span', 'jarvis-lab-message-time', time));
      row.appendChild(meta);
      row.appendChild(el('p', 'jarvis-lab-message-text', message.text));
      list.appendChild(row);
    }
    panel.appendChild(list);
    return panel;
  };

  const renderOrderState = (): HTMLElement => {
    const panel = el('aside', 'jarvis-lab-insights');
    panel.appendChild(el('h2', 'jarvis-lab-panel-title', 'Что понял Jarvis'));

    if (!state.orderState) {
      panel.appendChild(el('p', 'jarvis-lab-empty', 'Состояние заказа появится после создания диалога.'));
      return panel;
    }

    const order = state.orderState;
    const customer = el('div', 'jarvis-lab-block');
    customer.appendChild(el('h3', 'jarvis-lab-block-title', 'Клиент'));
    customer.appendChild(el('p', '', `Имя: ${order.customer.name?.trim() || '—'}`));
    customer.appendChild(el('p', '', `Телефон: ${order.customer.phone?.trim() || '—'}`));
    customer.appendChild(el('p', '', `Адрес: ${order.customer.address?.trim() || '—'}`));
    panel.appendChild(customer);

    const itemsBlock = el('div', 'jarvis-lab-block');
    itemsBlock.appendChild(el('h3', 'jarvis-lab-block-title', 'Изделия'));
    if (!order.items.length) {
      itemsBlock.appendChild(el('p', 'jarvis-lab-empty', 'Пока нет позиций.'));
    }
    for (const item of order.items) {
      const parts = [
        item.productType,
        item.quantity ? `× ${item.quantity}` : undefined,
        item.profileColor,
        item.mesh,
        item.widthMm && item.heightMm ? `${item.widthMm}×${item.heightMm}` : undefined,
        item.measurementBasis,
      ].filter(Boolean);
      itemsBlock.appendChild(el('p', '', parts.join(' · ') || item.localItemId));
    }
    panel.appendChild(itemsBlock);

    const quoteBlock = el('div', 'jarvis-lab-block');
    quoteBlock.appendChild(el('h3', 'jarvis-lab-block-title', 'Предварительная цена'));
    quoteBlock.appendChild(
      el('p', '', `Сумма: ${formatMoney(order.preliminaryQuote?.publicTotalRub)}`),
    );
    quoteBlock.appendChild(
      el('p', '', `Цена актуальна: ${order.preliminaryQuote?.current ? 'да' : 'нет'}`),
    );
    quoteBlock.appendChild(
      el('p', '', `Цена принята: ${order.preliminaryQuote?.accepted ? 'да' : 'нет'}`),
    );
    quoteBlock.appendChild(
      el('p', '', `Замер согласован: ${order.measurementAgreed ? 'да' : 'нет'}`),
    );
    panel.appendChild(quoteBlock);

    const readinessBlock = el('div', 'jarvis-lab-block');
    readinessBlock.appendChild(el('h3', 'jarvis-lab-block-title', 'Readiness'));
    readinessBlock.appendChild(el('p', '', `Статус: ${order.readiness.status}`));
    if (order.readiness.missingCodes.length) {
      readinessBlock.appendChild(
        el('p', '', `Не хватает: ${order.readiness.missingCodes.join(', ')}`),
      );
    }
    panel.appendChild(readinessBlock);

    if (state.measurementAction) {
      const actionBlock = el('div', 'jarvis-lab-block');
      actionBlock.appendChild(el('h3', 'jarvis-lab-block-title', 'Measurement action'));
      actionBlock.appendChild(
        el('p', '', `Решение: ${measurementActionLabel(state.measurementAction.kind)}`),
      );
      if (state.measurementAction.kind === 'AUTO_ALLOWED') {
        actionBlock.appendChild(el('p', 'jarvis-lab-test-banner', 'ТЕСТОВЫЙ РЕЖИМ — заявка не отправлена'));
      }
      panel.appendChild(actionBlock);
    }

    if (order.profitability) {
      const profitBlock = el('div', 'jarvis-lab-block');
      profitBlock.appendChild(el('h3', 'jarvis-lab-block-title', 'Рентабельность'));
      profitBlock.appendChild(el('p', '', `Basis: ${order.profitability.costBasisStatus}`));
      profitBlock.appendChild(el('p', '', `Band: ${order.profitability.profitabilityBand}`));
      if (order.profitability.grossMarginPercent !== undefined) {
        profitBlock.appendChild(
          el('p', '', `Маржа: ${order.profitability.grossMarginPercent.toFixed(1)}%`),
        );
      }
      if (order.profitability.markupPercent !== undefined) {
        profitBlock.appendChild(
          el('p', '', `Markup: ${order.profitability.markupPercent.toFixed(1)}%`),
        );
      }
      panel.appendChild(profitBlock);
    }

    return panel;
  };

  const renderComposer = (): HTMLElement => {
    const composer = el('div', 'jarvis-lab-composer');
    sendInput = document.createElement('textarea');
    sendInput.className = 'input jarvis-lab-input';
    sendInput.rows = 2;
    sendInput.placeholder = 'Введите сообщение клиента...';
    sendInput.value = state.inputText;
    sendInput.disabled = !state.conversation || state.loading || Boolean(state.pendingMessage);
    sendInput.oninput = () => {
      state.inputText = sendInput?.value ?? '';
    };
    sendInput.onkeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        queueCustomerMessage();
      }
    };
    composer.appendChild(sendInput);

    const actions = el('div', 'jarvis-lab-composer-actions');
    sendButton = btn('Отправить', queueCustomerMessage, 'btn-primary');
    sendButton.disabled = !state.conversation || state.loading || Boolean(state.pendingMessage);
    actions.appendChild(sendButton);

    if (state.pendingMessage) {
      retryButton = btn('Повторить', () => void sendPendingMessage(), 'btn-secondary');
      retryButton.disabled = state.loading;
      actions.appendChild(retryButton);
    }
    composer.appendChild(actions);
    return composer;
  };

  const paint = (): void => {
    root.replaceChildren();

    if (!state.configured) {
      root.appendChild(renderToolbar());
      root.appendChild(el('p', 'jarvis-lab-error', CONFIG_MESSAGE));
      emitSnapshot();
      return;
    }

    root.appendChild(renderToolbar());
    if (state.loading) {
      root.appendChild(el('p', 'jarvis-lab-loading', state.loadingLabel || 'Загрузка...'));
    }
    if (state.error) {
      root.appendChild(el('p', 'jarvis-lab-error', state.error));
    }

    const grid = el('div', 'jarvis-lab-grid');
    grid.appendChild(renderRecent());
    grid.appendChild(renderTranscript());
    grid.appendChild(renderOrderState());
    root.appendChild(grid);
    root.appendChild(renderComposer());
    emitSnapshot();
  };

  paint();

  void (async () => {
    const activeId = loadActiveConversationId();
    if (activeId) {
      await openConversation(activeId);
      return;
    }
    if (state.recent[0]?.conversationId) {
      await openConversation(state.recent[0].conversationId);
    }
  })();

  return { element: root, handle };
}

export function renderJarvisLabScreen(deps: JarvisLabDeps): HTMLElement {
  const panel = renderJarvisDialoguesPanel({ api: deps.api });
  const wrap = el('div', 'jarvis-lab-page');
  const header = el('div', 'jarvis-lab-header');
  header.appendChild(btn('← Назад', deps.onBack, 'btn-secondary'));
  wrap.appendChild(header);
  wrap.appendChild(panel.element);
  return wrap;
}
