/**
 * Сохраняет структурированный текст замера в .txt на устройстве.
 * В поддерживаемых браузерах/вебвью сначала пробует системный share с файлом.
 */
export async function saveTextAsTxtFile(fileBaseName: string, text: string): Promise<void> {
  const safeName = fileBaseName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'measurement';
  const filename = `${safeName}.txt`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const file = new File([blob], filename, { type: 'text/plain;charset=utf-8' });

  if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
    try {
      const canShareFiles = (navigator as Navigator & { canShare?: (data: ShareData) => boolean })
        .canShare?.({ files: [file] }) === true;
      if (canShareFiles) {
        await navigator.share({ files: [file], title: 'Экспорт замера' });
        return;
      }
    } catch {
      // fallback to direct download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

