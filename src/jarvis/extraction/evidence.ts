/** Normalize text for evidence containment checks. */
export function normalizeEvidenceText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .toLowerCase();
}

/** True when evidenceText appears inside the current customer message. */
export function evidenceMatchesMessage(messageText: string, evidenceText: string): boolean {
  const message = normalizeEvidenceText(messageText);
  const evidence = normalizeEvidenceText(evidenceText);
  if (evidence === '') {
    return false;
  }
  return message.includes(evidence);
}
