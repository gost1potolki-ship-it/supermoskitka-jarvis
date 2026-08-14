import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('Jarvis Lab security boundary', () => {
  it('does not expose internal API key patterns in browser source', () => {
    const sources = [
      read('../lib/jarvis-dev-api.ts'),
      read('../screens/jarvis-lab.ts'),
      read('../main.ts'),
      read('../screens/menu.ts'),
    ].join('\n');

    expect(sources).not.toContain('VITE_JARVIS_INTERNAL_API_KEY');
    expect(sources).not.toContain('window.JARVIS_INTERNAL_API_KEY');
    expect(sources).not.toMatch(/Authorization:\s*Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(sources).not.toContain('JARVIS_DEV_INTERNAL_API_KEY=');
  });

  it('keeps Jarvis Lab navigation behind import.meta.env.DEV', () => {
    const mainSource = read('../main.ts');
    const menuSource = read('../screens/menu.ts');

    expect(mainSource).toContain("import.meta.env.DEV ? () => navigateTo('jarvis-lab')");
    expect(mainSource).toContain("state.screen === 'jarvis-lab' && import.meta.env.DEV");
    expect(menuSource).toContain('if (deps.onJarvisLab)');
  });

  it('keeps dev proxy env names server-side in vite config only', () => {
    const viteConfig = read('../../vite.config.ts');
    expect(viteConfig).toContain('JARVIS_DEV_API_BASE_URL');
    expect(viteConfig).toContain('JARVIS_DEV_INTERNAL_API_KEY');
    expect(viteConfig).toContain("mode === 'development' ? [jarvisDevProxy(env)] : []");
    expect(read('../lib/jarvis-dev-api.ts')).not.toContain('JARVIS_DEV_INTERNAL_API_KEY');
  });
});

describe('Jarvis Lab production invisibility', () => {
  it('does not expose Jarvis Lab route in built HTML shell', async () => {
    const distHtml = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
    expect(distHtml).not.toContain('Jarvis Lab');
    expect(distHtml).not.toContain('/jarvis-dev');
  });
});
