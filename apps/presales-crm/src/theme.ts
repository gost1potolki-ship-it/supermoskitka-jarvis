export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'calc_pc_theme';

export const getTheme = (): ThemeMode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'light';
};

export const applyTheme = (theme: ThemeMode): void => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
};

export const setTheme = (theme: ThemeMode): void => {
  applyTheme(theme);
};

export const toggleTheme = (): ThemeMode => {
  const next: ThemeMode = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
};

export const initTheme = (): void => {
  applyTheme(getTheme());
};
