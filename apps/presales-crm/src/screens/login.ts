import { createBrandBlock } from '../brand-logo';
import { login } from '../auth';
import { btn, el, fieldRow } from '../dom';
import { getTheme, toggleTheme } from '../theme';

export interface LoginScreenDeps {
  onSuccess: () => void;
  onRerender: () => void;
}

export function renderLoginScreen(deps: LoginScreenDeps): HTMLElement {
  const page = el('div', 'login-page');

  const card = el('div', 'login-card');
  const brandWrap = el('div', 'login-brand');
  brandWrap.appendChild(createBrandBlock({ showSubtitle: false }));
  card.appendChild(brandWrap);
  card.appendChild(el('p', 'login-subtitle', 'Вход в CRM систему'));

  let errorText = '';

  const form = el('form', 'login-form');
  form.noValidate = true;

  const loginInput = document.createElement('input');
  loginInput.type = 'text';
  loginInput.className = 'input login-input';
  loginInput.placeholder = 'Логин';
  loginInput.autocomplete = 'username';
  loginInput.required = true;

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.className = 'input login-input';
  passInput.placeholder = 'Пароль';
  passInput.autocomplete = 'current-password';
  passInput.required = true;

  const errorEl = el('p', 'login-error login-error--hidden', '');

  const submit = (event?: Event): void => {
    event?.preventDefault();
    const result = login(loginInput.value, passInput.value);
    if (result.ok) {
      deps.onSuccess();
      return;
    }
    errorText = result.error ?? 'Ошибка входа';
    errorEl.textContent = errorText;
    errorEl.classList.remove('login-error--hidden');
    passInput.focus();
    passInput.select();
  };

  form.appendChild(fieldRow('Логин', loginInput));
  form.appendChild(fieldRow('Пароль', passInput));
  form.appendChild(errorEl);
  form.appendChild(btn('Войти', () => submit(), 'btn-primary login-submit'));
  form.addEventListener('submit', submit);
  card.appendChild(form);

  const footer = el('div', 'login-footer');
  const isDark = getTheme() === 'dark';
  const themeBtn = btn(isDark ? 'Светлая тема' : 'Тёмная тема', () => {
    toggleTheme();
    deps.onRerender();
  }, 'btn-header login-theme-btn');
  footer.appendChild(themeBtn);
  card.appendChild(footer);

  page.appendChild(card);
  requestAnimationFrame(() => loginInput.focus());
  return page;
}
