export const BRAND_ORANGE = '#f39200';
export const BRAND_GRAY = '#4b5563';

const LOGO_POSITIONS = [
  { x: 28, y: 15 }, { x: 56, y: 15 },
  { x: 14, y: 38 }, { x: 42, y: 38 }, { x: 70, y: 38 },
  { x: 28, y: 61 }, { x: 56, y: 61 },
];

export function createBrandLogoIcon(className = 'brand-logo-icon'): HTMLElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);

  for (const pos of LOGO_POSITIONS) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      `M${pos.x} ${pos.y} L${pos.x + 16} ${pos.y + 12} L${pos.x} ${pos.y + 24} L${pos.x + 6} ${pos.y + 12} Z`
    );
    path.setAttribute('fill', BRAND_ORANGE);
    svg.appendChild(path);
  }

  return svg as unknown as HTMLElement;
}

export interface BrandBlockOptions {
  showSubtitle?: boolean;
  compact?: boolean;
}

export function createBrandBlock(options: BrandBlockOptions = {}): HTMLElement {
  const { showSubtitle = true, compact = false } = options;
  const wrap = document.createElement('div');
  wrap.className = compact ? 'brand-block brand-block--compact' : 'brand-block';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'brand-block-icon';
  iconWrap.appendChild(createBrandLogoIcon());
  wrap.appendChild(iconWrap);

  const text = document.createElement('div');
  text.className = 'brand-block-text';

  const superLine = document.createElement('span');
  superLine.className = 'brand-block-super';
  superLine.textContent = 'СУПЕР';
  text.appendChild(superLine);

  const nameLine = document.createElement('span');
  nameLine.className = 'brand-block-name';
  nameLine.textContent = 'МОСКИТКА';
  text.appendChild(nameLine);

  if (showSubtitle) {
    const subtitle = document.createElement('span');
    subtitle.className = 'brand-block-subtitle';
    subtitle.textContent = 'CRM Система';
    text.appendChild(subtitle);
  }

  wrap.appendChild(text);
  return wrap;
}
