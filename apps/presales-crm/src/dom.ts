export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function btn(
  labelText: string,
  onClick: () => void,
  extraClass = '',
  disabled = false
): HTMLButtonElement {
  const b = el('button', `btn ${extraClass}`.trim(), labelText);
  b.type = 'button';
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

export function fieldRow(labelText: string, control: HTMLElement): HTMLElement {
  const row = el('div', 'field-row');
  row.appendChild(el('label', '', labelText));
  row.appendChild(control);
  return row;
}

export function fieldRowPair(left: HTMLElement, right: HTMLElement): HTMLElement {
  const wrap = el('div', 'field-row-pair');
  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

export function input(type: string, value: string, onChange: (v: string) => void): HTMLInputElement {
  const i = document.createElement('input');
  i.type = type;
  i.value = value;
  i.className = 'input';
  i.oninput = () => onChange(i.value);
  return i;
}

export function segmentToggle(
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void,
  extraClass = ''
): HTMLElement {
  const wrap = el('div', `segment-toggle ${extraClass}`.trim());
  for (const opt of options) {
    const b = el('button', `seg-btn${opt.value === value ? ' active' : ''}`, opt.label);
    b.type = 'button';
    b.onclick = () => onChange(opt.value);
    wrap.appendChild(b);
  }
  return wrap;
}

export function showToast(message: string): void {
  const existing = document.querySelector('.save-toast');
  existing?.remove();
  const toast = el('div', 'save-toast', message);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('save-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('save-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}
