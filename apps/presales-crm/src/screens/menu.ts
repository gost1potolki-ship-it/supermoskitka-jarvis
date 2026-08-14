import { el } from '../dom';
import { createBrandBlock } from '../brand-logo';
import { getTheme } from '../theme';

export interface MenuScreenDeps {
  onMeasurements: () => void;
  onOrders: () => void;
  onCalculator: () => void;
  onNewOrder: () => void;
  onThemeToggle: () => void;
  onLogout: () => void;
  profileName: string;
  cartCount: number;
}

type NavItem = {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

const ICONS: Record<string, string> = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  measurements: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>`,
  orders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><circle cx="12" cy="14" r="3"/><path d="M12 12v2l1 1"/></svg>`,
  calculator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/></svg>`,
  clients: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M14 19c0-2.2 1.8-4 4-4"/></svg>`,
  support: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 014.5 1.5c0 2-2.5 2-2.5 4M12 17h.01"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3M16 17l5-5-5-5M21 12H9"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 17H9l-1-2H6a4 4 0 008 0h-1l-1 2zM12 3a3 3 0 013 3v1"/><path d="M10 19a2 2 0 004 0"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  cardMeasurements: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 11h16M8 15h4"/></svg>`,
  cardOrders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  cardCalculator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l9 16H3L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 14.5A8.5 8.5 0 019.5 4 7 7 0 1020 14.5z"/></svg>`,
};

function icon(name: string, className = 'crm-icon'): HTMLElement {
  const span = el('span', className);
  span.innerHTML = ICONS[name] ?? '';
  return span;
}

function navButton(item: NavItem): HTMLButtonElement {
  const b = el('button', `crm-nav-item${item.active ? ' crm-nav-item--active' : ''}${item.disabled ? ' crm-nav-item--disabled' : ''}`);
  b.type = 'button';
  b.appendChild(icon(item.icon, 'crm-nav-icon'));
  b.appendChild(el('span', 'crm-nav-label', item.label));
  if (!item.disabled && item.onClick) b.onclick = item.onClick;
  return b;
}

function renderSidebar(deps: MenuScreenDeps): HTMLElement {
  const sidebar = el('aside', 'crm-sidebar');

  const brand = el('div', 'crm-brand');
  brand.appendChild(createBrandBlock());
  sidebar.appendChild(brand);

  const nav = el('nav', 'crm-nav');
  const items: NavItem[] = [
    { id: 'dashboard', label: 'Дашборд', icon: 'dashboard', active: true },
    { id: 'measurements', label: 'Замеры', icon: 'measurements', onClick: deps.onMeasurements },
    { id: 'orders', label: 'Заказы в работе', icon: 'orders', onClick: deps.onOrders },
    { id: 'calculator', label: 'Калькулятор', icon: 'calculator', onClick: deps.onCalculator },
    { id: 'clients', label: 'Клиенты', icon: 'clients', disabled: true },
  ];
  for (const item of items) nav.appendChild(navButton(item));
  sidebar.appendChild(nav);

  const newOrderBtn = el('button', 'crm-new-order-btn', 'Новый заказ');
  newOrderBtn.type = 'button';
  newOrderBtn.onclick = deps.onNewOrder;
  sidebar.appendChild(newOrderBtn);

  const footer = el('div', 'crm-sidebar-footer');
  const supportBtn = navButton({ id: 'support', label: 'Поддержка', icon: 'support', disabled: true });
  const logoutBtn = navButton({ id: 'logout', label: 'Выход', icon: 'logout', onClick: deps.onLogout });
  footer.appendChild(supportBtn);
  footer.appendChild(logoutBtn);
  sidebar.appendChild(footer);

  return sidebar;
}

function renderTopbar(deps: MenuScreenDeps): HTMLElement {
  const topbar = el('header', 'crm-topbar');

  const searchWrap = el('div', 'crm-search');
  searchWrap.appendChild(icon('search', 'crm-search-icon'));
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'crm-search-input';
  searchInput.placeholder = 'Поиск заказов...';
  searchWrap.appendChild(searchInput);
  topbar.appendChild(searchWrap);

  const utilities = el('div', 'crm-topbar-utils');
  const iconBtn = (name: string) => {
    const b = el('button', 'crm-icon-btn');
    b.type = 'button';
    b.appendChild(icon(name));
    return b;
  };
  utilities.appendChild(iconBtn('bell'));
  utilities.appendChild(iconBtn('settings'));

  const divider = el('span', 'crm-topbar-divider');
  utilities.appendChild(divider);

  const isDark = getTheme() === 'dark';
  const themeBtn = el('button', 'crm-icon-btn crm-theme-toggle');
  themeBtn.type = 'button';
  themeBtn.title = isDark ? 'Светлая тема' : 'Тёмная тема';
  themeBtn.setAttribute('aria-label', themeBtn.title);
  themeBtn.appendChild(icon(isDark ? 'sun' : 'moon'));
  themeBtn.onclick = deps.onThemeToggle;
  utilities.appendChild(themeBtn);

  const profile = el('div', 'crm-profile');
  const profileText = el('div', 'crm-profile-text');
  profileText.appendChild(el('span', 'crm-profile-label', 'Профиль'));
  profileText.appendChild(el('span', 'crm-profile-role', deps.profileName));
  profile.appendChild(profileText);
  const avatar = el('div', 'crm-profile-avatar', 'А');
  profile.appendChild(avatar);
  utilities.appendChild(profile);

  topbar.appendChild(utilities);
  return topbar;
}

type DashboardCard = {
  title: string;
  desc: string;
  actionLabel: string;
  icon: string;
  badge?: string;
  onClick: () => void;
};

function renderDashboardCard(card: DashboardCard): HTMLElement {
  const article = el('article', 'crm-dash-card');
  const head = el('div', 'crm-dash-card-head');
  head.appendChild(icon(card.icon, 'crm-dash-card-icon'));
  const titleRow = el('div', 'crm-dash-card-title-row');
  titleRow.appendChild(el('h3', 'crm-dash-card-title', card.title));
  if (card.badge) titleRow.appendChild(el('span', 'crm-dash-card-badge', card.badge));
  head.appendChild(titleRow);
  article.appendChild(head);
  article.appendChild(el('p', 'crm-dash-card-desc', card.desc));
  const action = el('button', 'crm-dash-card-action', card.actionLabel);
  action.type = 'button';
  action.onclick = card.onClick;
  article.appendChild(action);
  return article;
}

function renderNotifications(): HTMLElement {
  const section = el('section', 'crm-notifications');
  const head = el('div', 'crm-notifications-head');
  head.appendChild(el('h3', 'crm-notifications-title', 'Последние уведомления'));
  head.appendChild(el('button', 'crm-notifications-all', 'ВСЕ УВЕДОМЛЕНИЯ'));
  section.appendChild(head);

  const list = el('div', 'crm-notifications-list');
  const items = [
    {
      type: 'info' as const,
      text: 'Новый замер: ул. Ленина 45, кв 12',
      time: 'СЕГОДНЯ В 10:30',
    },
    {
      type: 'warning' as const,
      text: 'Срок заказа #1244 истекает завтра',
      time: 'ВЧЕРА В 18:15',
    },
  ];

  for (const item of items) {
    const row = el('div', 'crm-notification-item');
    row.appendChild(icon(item.type, `crm-notification-icon crm-notification-icon--${item.type}`));
    const body = el('div', 'crm-notification-body');
    body.appendChild(el('p', 'crm-notification-text', item.text));
    body.appendChild(el('span', 'crm-notification-time', item.time));
    row.appendChild(body);
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

export function renderMenuScreen(deps: MenuScreenDeps): HTMLElement {
  const layout = el('div', 'crm-dashboard');

  layout.appendChild(renderSidebar(deps));

  const main = el('div', 'crm-dashboard-main');
  main.appendChild(renderTopbar(deps));

  const content = el('div', 'crm-dashboard-content');
  content.appendChild(el('h1', 'crm-dashboard-title', 'Менеджер CRM'));
  content.appendChild(el('p', 'crm-dashboard-subtitle', 'Выберите раздел для продолжения работы'));

  const cards = el('div', 'crm-dash-cards');
  const cartBadge = deps.cartCount > 0 ? `${deps.cartCount} поз.` : undefined;
  const calcDesc = deps.cartCount > 0
    ? `Корзина: ${deps.cartCount} поз. Быстрый расчёт стоимости москитных сеток.`
    : 'Быстрый расчёт стоимости москитных сеток и штор.';

  cards.appendChild(renderDashboardCard({
    title: 'Замеры',
    desc: 'Активные заявки на замер, назначение мастеров и отчёты.',
    actionLabel: 'ПЕРЕЙТИ →',
    icon: 'cardMeasurements',
    onClick: deps.onMeasurements,
  }));
  cards.appendChild(renderDashboardCard({
    title: 'Заказы в работе',
    desc: 'Сохранённые и производственные заказы, отслеживание статусов.',
    actionLabel: 'ПЕРЕЙТИ →',
    icon: 'cardOrders',
    onClick: deps.onOrders,
  }));
  cards.appendChild(renderDashboardCard({
    title: 'Калькулятор',
    desc: calcDesc,
    actionLabel: 'ОТКРЫТЬ →',
    icon: 'cardCalculator',
    badge: cartBadge,
    onClick: deps.onCalculator,
  }));
  content.appendChild(cards);
  content.appendChild(renderNotifications());

  main.appendChild(content);
  layout.appendChild(main);
  return layout;
}
