/**
 * Fail-safe activity timestamp: never move conversation.updatedAt backwards
 * when an older/out-of-order message is appended.
 */
export function maxIsoTimestamp(a: string, b: string): string {
  return a.localeCompare(b) >= 0 ? a : b;
}
