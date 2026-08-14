import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildSidebarNavItems } from './menu';

const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const menuDeps = {
  onDashboard: vi.fn(),
  onMeasurements: vi.fn(),
  onOrders: vi.fn(),
  onCalculator: vi.fn(),
  onJarvis: vi.fn(),
  onNewOrder: vi.fn(),
  onThemeToggle: vi.fn(),
  onLogout: vi.fn(),
  profileName: 'Тест',
  cartCount: 0,
};

describe('Jarvis sidebar navigation', () => {
  it('sidebar contains Jarvis between Calculator and Clients', () => {
    const items = buildSidebarNavItems(menuDeps);
    const labels = items.map((item) => item.label);
    expect(labels).toContain('Jarvis');
    expect(labels.indexOf('Jarvis')).toBe(labels.indexOf('Калькулятор') + 1);
    expect(labels.indexOf('Клиенты')).toBe(labels.indexOf('Jarvis') + 1);
  });

  it('click Jarvis invokes navigation callback and active highlight works', () => {
    const items = buildSidebarNavItems(menuDeps);
    const jarvisItem = items.find((item) => item.id === 'jarvis');
    jarvisItem?.onClick?.();
    expect(menuDeps.onJarvis).toHaveBeenCalledTimes(1);

    const activeItems = buildSidebarNavItems(menuDeps, 'jarvis');
    expect(activeItems.find((item) => item.id === 'jarvis')?.active).toBe(true);
  });

  it('dashboard item has onClick and invokes onDashboard', () => {
    const items = buildSidebarNavItems(menuDeps, 'jarvis');
    const dashboardItem = items.find((item) => item.id === 'dashboard');
    expect(dashboardItem?.onClick).toBeTypeOf('function');
    dashboardItem?.onClick?.();
    expect(menuDeps.onDashboard).toHaveBeenCalledTimes(1);

    const activeOnMenu = buildSidebarNavItems(menuDeps, 'menu');
    expect(activeOnMenu.find((item) => item.id === 'dashboard')?.active).toBe(true);
  });

  it('dashboard does not contain Task15 Jarvis Lab card', () => {
    const menuSource = read('./menu.ts');
    expect(menuSource).not.toContain('Jarvis Lab');
    expect(menuSource).not.toContain('onJarvisLab');
    expect(menuSource).not.toContain('cardJarvis');
  });
});

describe('Jarvis page tabs', () => {
  it('defines Диалоги / Управление / Настройки with default Диалоги', () => {
    const jarvisSource = read('./jarvis.ts');
    expect(jarvisSource).toContain("dialogues: 'Диалоги'");
    expect(jarvisSource).toContain("management: 'Управление'");
    expect(jarvisSource).toContain("settings: 'Настройки'");
    expect(jarvisSource).toContain("let activeTab: JarvisTab = 'dialogues'");
    expect(jarvisSource).toContain('switchTab');
    expect(jarvisSource).toContain('jarvis-tab-panel--hidden');
  });

  it('uses production placeholders outside dev Lab bridge', () => {
    const jarvisSource = read('./jarvis.ts');
    expect(jarvisSource).toContain('import.meta.env.DEV');
    expect(jarvisSource).toContain('Подключение рабочих каналов Jarvis ещё не выполнено.');
    expect(jarvisSource).toContain('Управление Jarvis будет доступно после подключения рабочего API.');
    expect(jarvisSource).toContain('Будет доступно после подключения');
  });

  it('wires Jarvis page dashboard navigation to menu route', () => {
    const mainSource = read('../main.ts');
    expect(mainSource).toMatch(/renderJarvisScreen\(\{[\s\S]*?onDashboard:\s*\(\)\s*=>\s*navigateTo\('menu'\)/);
  });
});
