/**
 * Отправка замерного листа менеджеру только через Firebase Callable `sendVkOrderReport`.
 * Секреты VK (токен, peer_id) хранятся на сервере в Cloud Functions.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

/**
 * Передаёт полный текст замера на сервер; разбиение на части и вызов VK API выполняет функция.
 */
export async function sendVkOrderReport(text: string): Promise<void> {
  const fn = httpsCallable(getFunctions(app), 'sendVkOrderReport');
  await fn({ text });
}

/** @deprecated Используйте sendVkOrderReport; оставлено для совместимости импортов. */
export async function sendOrderToManager(message: string): Promise<void> {
  await sendVkOrderReport(message);
}
