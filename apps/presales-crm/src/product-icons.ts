import { ProductType } from '@calc/types';

const SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

const PRODUCT_ICON_SVG: Partial<Record<ProductType, string>> = {
  [ProductType.FRAME]: `<svg ${SVG_ATTRS}>
    <rect x="6" y="8" width="20" height="16" rx="2"/>
    <path d="M11 8v16M21 8v16M6 14h20M6 18h20"/>
  </svg>`,

  [ProductType.WING]: `<svg ${SVG_ATTRS}>
    <rect x="6" y="7" width="20" height="18" rx="2"/>
    <path d="M16 7v18"/>
    <path d="M16 16h10"/>
    <circle cx="8.5" cy="16" r="1" fill="currentColor" stroke="none"/>
  </svg>`,

  [ProductType.DOOR]: `<svg ${SVG_ATTRS}>
    <rect x="9" y="5" width="14" height="22" rx="2"/>
    <path d="M9 11h14M9 17h14"/>
    <circle cx="20" cy="16" r="1.25" fill="currentColor" stroke="none"/>
    <path d="M7 8v16"/>
    <circle cx="7" cy="11" r="1" fill="currentColor" stroke="none"/>
    <circle cx="7" cy="21" r="1" fill="currentColor" stroke="none"/>
  </svg>`,

  [ProductType.PLISSE_NET]: `<svg ${SVG_ATTRS}>
    <path d="M8 8h16v16H8z" opacity="0"/>
    <path d="M9 8v16M13 8v16M17 8v16M21 8v16M25 8v16"/>
    <path d="M8 12h16M8 16h16M8 20h16"/>
  </svg>`,

  [ProductType.JALOUSIE_CLASSIC]: `<svg ${SVG_ATTRS}>
    <rect x="7" y="6" width="18" height="20" rx="2"/>
    <path d="M10 10h12M10 14h12M10 18h12M10 22h12"/>
    <path d="M16 6v20"/>
  </svg>`,

  [ProductType.JALOUSIE_LIGHT]: `<svg ${SVG_ATTRS}>
    <rect x="8" y="7" width="16" height="18" rx="2"/>
    <path d="M11 11h10M11 16h10M11 21h10"/>
  </svg>`,

  [ProductType.JALOUSIE_COZY]: `<svg ${SVG_ATTRS}>
    <rect x="6" y="9" width="20" height="15" rx="2"/>
    <path d="M10 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/>
    <path d="M11 14h10M11 18h10"/>
  </svg>`,

  [ProductType.SEAL]: `<svg ${SVG_ATTRS}>
    <circle cx="16" cy="16" r="9"/>
    <ellipse cx="16" cy="16" rx="5" ry="3"/>
    <path d="M11 16h10"/>
  </svg>`,

  [ProductType.COMB]: `<svg ${SVG_ATTRS}>
    <rect x="7" y="10" width="18" height="12" rx="2"/>
    <path d="M11 10V8M16 10V7M21 10V8"/>
    <path d="M10 15h12M10 19h12"/>
  </svg>`,

  [ProductType.CHILD_LOCK]: `<svg ${SVG_ATTRS}>
    <rect x="8" y="14" width="16" height="12" rx="2"/>
    <path d="M12 14v-3a4 4 0 0 1 8 0v3"/>
    <circle cx="16" cy="20" r="1.5" fill="currentColor" stroke="none"/>
    <path d="M16 21.5v2"/>
  </svg>`,

  [ProductType.ADJUSTMENT]: `<svg ${SVG_ATTRS}>
    <path d="M18.5 8.5l-10 10"/>
    <path d="M14 7h5v5M10 25h5v-5"/>
    <circle cx="21" cy="7" r="2"/>
    <circle cx="11" cy="25" r="2"/>
  </svg>`,
};

const FALLBACK_SVG = `<svg ${SVG_ATTRS}><rect x="8" y="8" width="16" height="16" rx="3"/></svg>`;

export function createProductIcon(type: ProductType): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'product-card-icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = PRODUCT_ICON_SVG[type] ?? FALLBACK_SVG;
  return wrap;
}
