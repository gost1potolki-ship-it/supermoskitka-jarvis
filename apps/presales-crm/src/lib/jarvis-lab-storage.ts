export const JARVIS_LAB_RECENT_KEY = 'presales_jarvis_lab_recent_conversations_v1';
export const JARVIS_LAB_ACTIVE_KEY = 'presales_jarvis_lab_active_conversation_v1';
export const JARVIS_LAB_MAX_RECENT = 20;

export interface JarvisLabRecentConversation {
  conversationId: string;
  createdAt?: string;
  updatedAt?: string;
  label?: string;
}

const readJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const loadRecentConversations = (): JarvisLabRecentConversation[] => {
  const parsed = readJson<JarvisLabRecentConversation[]>(localStorage.getItem(JARVIS_LAB_RECENT_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => typeof entry?.conversationId === 'string' && entry.conversationId);
};

export const saveRecentConversations = (entries: JarvisLabRecentConversation[]): void => {
  localStorage.setItem(JARVIS_LAB_RECENT_KEY, JSON.stringify(entries.slice(0, JARVIS_LAB_MAX_RECENT)));
};

export const rememberConversation = (
  conversationId: string,
  patch: Partial<Omit<JarvisLabRecentConversation, 'conversationId'>> = {},
): JarvisLabRecentConversation[] => {
  const now = new Date().toISOString();
  const existing = loadRecentConversations().filter((entry) => entry.conversationId !== conversationId);
  const current: JarvisLabRecentConversation = {
    conversationId,
    createdAt: patch.createdAt ?? now,
    updatedAt: patch.updatedAt ?? now,
    label: patch.label,
  };
  const next = [current, ...existing].slice(0, JARVIS_LAB_MAX_RECENT);
  saveRecentConversations(next);
  return next;
};

export const removeConversation = (conversationId: string): JarvisLabRecentConversation[] => {
  const next = loadRecentConversations().filter((entry) => entry.conversationId !== conversationId);
  saveRecentConversations(next);
  return next;
};

export const loadActiveConversationId = (): string | null => {
  const value = localStorage.getItem(JARVIS_LAB_ACTIVE_KEY);
  return value?.trim() || null;
};

export const saveActiveConversationId = (conversationId: string | null): void => {
  if (!conversationId) {
    localStorage.removeItem(JARVIS_LAB_ACTIVE_KEY);
    return;
  }
  localStorage.setItem(JARVIS_LAB_ACTIVE_KEY, conversationId);
};
