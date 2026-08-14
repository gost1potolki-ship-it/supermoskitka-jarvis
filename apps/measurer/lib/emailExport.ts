import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

/**
 * Экспорт структурированного текста замера на e-mail менеджера.
 * Использует Firebase Callable `sendOrderToManager` (отправка почты на сервере).
 */
export async function exportMeasurementToEmail(text: string): Promise<void> {
  const fn = httpsCallable(getFunctions(app), 'sendOrderToManager');
  await fn({ text });
}

