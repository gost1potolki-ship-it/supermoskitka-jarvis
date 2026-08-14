import { btn, el } from '../dom';
import {
  renderJarvisDialoguesPanel,
  type JarvisDialoguesPanelHandle,
  type JarvisLabSnapshot,
} from './jarvis-lab';
import { renderCrmSidebarLayout, type MenuScreenDeps } from './menu';

export type JarvisScreenDeps = MenuScreenDeps;

type JarvisTab = 'dialogues' | 'management' | 'settings';

const TAB_LABELS: Record<JarvisTab, string> = {
  dialogues: 'Диалоги',
  management: 'Управление',
  settings: 'Настройки',
};

const measurementActionLabel = (kind: JarvisLabSnapshot['measurementAction']): string => {
  if (!kind) return '—';
  if (kind.kind === 'AUTO_ALLOWED') return 'ГОТОВО К ЗАМЕРУ';
  if (kind.kind === 'AWAITING_OWNER_APPROVAL') return 'Ручная проверка владельца';
  return 'NOT_READY';
};

function renderSettingsPanel(): HTMLElement {
  const panel = el('div', 'jarvis-settings');
  const blocks = [
    { title: 'Состояние подключения', note: 'Будет доступно после подключения' },
    { title: 'Каналы', note: 'Будет доступно после подключения' },
    { title: 'База знаний', note: 'Будет доступно после подключения' },
    { title: 'Автоматизация', note: 'Будет доступно после подключения' },
  ];
  for (const block of blocks) {
    const section = el('section', 'jarvis-settings-block');
    section.appendChild(el('h3', 'jarvis-settings-block-title', block.title));
    section.appendChild(el('p', 'jarvis-settings-block-note', block.note));
    panel.appendChild(section);
  }
  return panel;
}

function renderManagementPanel(
  snapshot: JarvisLabSnapshot | null,
  handle: JarvisDialoguesPanelHandle | null,
): HTMLElement {
  const panel = el('div', 'jarvis-management');

  if (!import.meta.env.DEV) {
    panel.appendChild(
      el('p', 'jarvis-placeholder', 'Управление Jarvis будет доступно после подключения рабочего API.'),
    );
    return panel;
  }

  if (!snapshot?.conversation) {
    panel.appendChild(el('p', 'jarvis-placeholder', 'Выберите или создайте диалог во вкладке «Диалоги».'));
    return panel;
  }

  const modeBlock = el('div', 'jarvis-management-block');
  modeBlock.appendChild(el('h3', 'jarvis-management-block-title', 'Режим'));
  modeBlock.appendChild(el('p', '', `Текущий режим: ${snapshot.conversation.mode === 'HUMAN' ? 'HUMAN' : 'AI'}`));
  modeBlock.appendChild(el('p', '', `conversationId: ${snapshot.conversation.conversationId}`));
  const actions = el('div', 'jarvis-management-actions');
  const toHuman = btn('Передать человеку', () => void handle?.switchMode('HUMAN'), 'btn-secondary');
  const toAi = btn('Вернуть Jarvis', () => void handle?.switchMode('AI'), 'btn-primary');
  toHuman.disabled = snapshot.loading || snapshot.conversation.mode === 'HUMAN';
  toAi.disabled = snapshot.loading || snapshot.conversation.mode === 'AI';
  actions.appendChild(toHuman);
  actions.appendChild(toAi);
  modeBlock.appendChild(actions);
  panel.appendChild(modeBlock);

  const readinessBlock = el('div', 'jarvis-management-block');
  readinessBlock.appendChild(el('h3', 'jarvis-management-block-title', 'Readiness'));
  if (snapshot.orderState) {
    readinessBlock.appendChild(el('p', '', `Статус: ${snapshot.orderState.readiness.status}`));
    if (snapshot.orderState.readiness.missingCodes.length) {
      readinessBlock.appendChild(
        el('p', '', `Не хватает: ${snapshot.orderState.readiness.missingCodes.join(', ')}`),
      );
    }
  } else {
    readinessBlock.appendChild(el('p', 'jarvis-placeholder', '—'));
  }
  panel.appendChild(readinessBlock);

  const actionBlock = el('div', 'jarvis-management-block');
  actionBlock.appendChild(el('h3', 'jarvis-management-block-title', 'Measurement action'));
  actionBlock.appendChild(el('p', '', `Решение: ${measurementActionLabel(snapshot.measurementAction)}`));
  if (snapshot.measurementAction?.kind === 'AUTO_ALLOWED') {
    actionBlock.appendChild(el('p', 'jarvis-lab-test-banner', 'ТЕСТОВЫЙ РЕЖИМ — заявка не отправлена'));
  }
  panel.appendChild(actionBlock);

  return panel;
}

export function renderJarvisScreen(deps: JarvisScreenDeps): HTMLElement {
  let activeTab: JarvisTab = 'dialogues';
  let snapshot: JarvisLabSnapshot | null = null;
  let handle: JarvisDialoguesPanelHandle | null = null;

  const page = el('div', 'crm-dashboard-content jarvis-page');
  const header = el('div', 'jarvis-page-header');
  const titleWrap = el('div', 'jarvis-page-header-text');
  titleWrap.appendChild(el('h1', 'jarvis-page-title', 'Jarvis'));
  titleWrap.appendChild(el('p', 'jarvis-page-subtitle', 'ИИ-менеджер SuperMoskitka'));
  header.appendChild(titleWrap);
  const status = el('span', 'jarvis-page-status', 'Статус: ожидание подключения');
  header.appendChild(status);
  page.appendChild(header);

  const tabsBar = el('div', 'jarvis-tabs');
  const tabButtons: Partial<Record<JarvisTab, HTMLButtonElement>> = {};
  const tabPanels: Record<JarvisTab, HTMLElement> = {
    dialogues: el('div', 'jarvis-tab-panel'),
    management: el('div', 'jarvis-tab-panel jarvis-tab-panel--hidden'),
    settings: el('div', 'jarvis-tab-panel jarvis-tab-panel--hidden'),
  };

  const updateStatus = (): void => {
    if (!import.meta.env.DEV) {
      status.textContent = 'Статус: каналы не подключены';
      return;
    }
    if (!snapshot?.configured) {
      status.textContent = 'Статус: dev Lab не настроен';
      return;
    }
    if (snapshot.loading) {
      status.textContent = `Статус: ${snapshot.loadingLabel || 'загрузка…'}`;
      return;
    }
    if (snapshot.conversation) {
      status.textContent = `Статус: ${snapshot.conversation.mode === 'HUMAN' ? 'HUMAN' : 'AI'}`;
      return;
    }
    status.textContent = 'Статус: нет активного диалога';
  };

  const paintManagement = (): void => {
    tabPanels.management.replaceChildren(renderManagementPanel(snapshot, handle));
    updateStatus();
  };

  const switchTab = (tab: JarvisTab): void => {
    activeTab = tab;
    for (const [id, button] of Object.entries(tabButtons) as [JarvisTab, HTMLButtonElement][]) {
      button.classList.toggle('jarvis-tab-btn--active', id === tab);
    }
    for (const [id, panel] of Object.entries(tabPanels) as [JarvisTab, HTMLElement][]) {
      panel.classList.toggle('jarvis-tab-panel--hidden', id !== tab);
    }
    if (tab === 'management') paintManagement();
  };

  for (const tab of Object.keys(TAB_LABELS) as JarvisTab[]) {
    const button = btn(TAB_LABELS[tab], () => switchTab(tab), 'jarvis-tab-btn');
    button.type = 'button';
    if (tab === activeTab) button.classList.add('jarvis-tab-btn--active');
    tabButtons[tab] = button;
    tabsBar.appendChild(button);
  }
  page.appendChild(tabsBar);

  if (import.meta.env.DEV) {
    const panel = renderJarvisDialoguesPanel({
      onSnapshot: (next) => {
        snapshot = next;
        updateStatus();
        if (activeTab === 'management') paintManagement();
      },
    });
    handle = panel.handle;
    tabPanels.dialogues.appendChild(panel.element);
  } else {
    tabPanels.dialogues.appendChild(
      el('p', 'jarvis-placeholder', 'Подключение рабочих каналов Jarvis ещё не выполнено.'),
    );
  }

  tabPanels.settings.appendChild(renderSettingsPanel());

  const tabContainer = el('div', 'jarvis-tab-container');
  tabContainer.appendChild(tabPanels.dialogues);
  tabContainer.appendChild(tabPanels.management);
  tabContainer.appendChild(tabPanels.settings);
  page.appendChild(tabContainer);

  updateStatus();
  paintManagement();

  return renderCrmSidebarLayout({ ...deps, activeScreen: 'jarvis' }, page);
}
