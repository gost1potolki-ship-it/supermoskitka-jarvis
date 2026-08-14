const AUTH_STORAGE_KEY = 'calc_pc_auth_session';

const VALID_LOGIN = String(import.meta.env.VITE_PRESALES_LOGIN ?? '').trim();
const VALID_PASSWORD = String(import.meta.env.VITE_PRESALES_PASSWORD ?? '');

interface AuthSession {
  username: string;
  loggedInAt: number;
}

const readSession = (): AuthSession | null => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (VALID_LOGIN && parsed?.username === VALID_LOGIN) return parsed;
  } catch {
    /* ignore */
  }
  return null;
};

export const isAuthenticated = (): boolean => readSession() != null;

export const getAuthUsername = (): string | null => readSession()?.username ?? null;

export const login = (username: string, password: string): { ok: boolean; error?: string } => {
  if (!VALID_LOGIN || !VALID_PASSWORD) {
    return {
      ok: false,
      error: 'Локальная авторизация не настроена (VITE_PRESALES_LOGIN / VITE_PRESALES_PASSWORD)',
    };
  }
  const normalized = username.trim();
  if (normalized === VALID_LOGIN && password === VALID_PASSWORD) {
    const session: AuthSession = { username: normalized, loggedInAt: Date.now() };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    return { ok: true };
  }
  return { ok: false, error: 'Неверный логин или пароль' };
};

export const logout = (): void => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};
