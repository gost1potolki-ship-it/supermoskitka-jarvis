import React, { useState } from 'react';
import { Loader2, Lock, LogIn, Mail } from 'lucide-react';
import { signInEmail } from '../lib/auth';

interface LoginScreenProps {
  onSuccess?: () => void;
}

const LAST_EMAIL_KEY = 'measurer_last_email';

const readLastEmail = (): string => {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
};

function mapFirebaseAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Неверный email или пароль';
    case 'auth/user-disabled':
      return 'Пользователь отключен';
    case 'auth/too-many-requests':
      return 'Слишком много попыток. Попробуйте позже';
    default:
      return 'Неизвестная ошибка. Попробуйте ещё раз';
  }
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState(() => readLastEmail());
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Введите email и пароль');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signInEmail(trimmedEmail, password);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, trimmedEmail);
      } catch {
        // ignore storage errors — login already succeeded
      }
      onSuccess?.();
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
          ? err.code
          : '';
      setError(mapFirebaseAuthError(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-xs">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-orange-50 p-2.5 rounded-xl text-[#f39200]">
              <LogIn size={22} />
            </div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tight">
              Вход замерщика
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="sr-only">
                Email
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  id="login-email"
                  name="username"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  autoFocus={!email.trim()}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Email"
                  disabled={loading}
                  className={`w-full pl-11 pr-4 py-3.5 bg-gray-50 border rounded-2xl text-sm font-bold outline-none transition-colors ${
                    error ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-[#f39200]'
                  }`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="sr-only">
                Пароль
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus={Boolean(email.trim())}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Пароль"
                  disabled={loading}
                  className={`w-full pl-11 pr-4 py-3.5 bg-gray-50 border rounded-2xl text-sm font-bold outline-none transition-colors ${
                    error ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-[#f39200]'
                  }`}
                />
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-xs font-bold text-center leading-snug">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f39200] text-white py-4 rounded-2xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-orange-100 active:scale-95 transition-transform disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Вход...
                </>
              ) : (
                'Войти'
              )}
            </button>
          </form>

          <p className="mt-4 text-[10px] text-gray-400 text-center leading-relaxed font-medium">
            Email будет запомнен на этом устройстве. Пароль можно сохранить в браузере или телефоне.
          </p>

          <p className="mt-3 text-[11px] text-gray-400 text-center leading-relaxed font-medium">
            Если у вас нет доступа, обратитесь к администратору
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
