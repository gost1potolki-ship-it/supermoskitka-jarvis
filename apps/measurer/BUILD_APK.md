# Сборка APK (Калькулятор Замерщика)

Проект настроен для сборки Android-приложения через Capacitor. Ниже — пошаговая инструкция.

## Требования

- **Node.js** 18+
- **npm** (или yarn/pnpm)
- **Android Studio** (для сборки подписанного APK и настройки подписей)
- **JDK 17** (обычно ставится вместе с Android Studio)

## Шаг 1. Установка зависимостей

```bash
npm install
```

## Шаг 2. Добавление платформы Android (один раз)

Если папки `android` в корне проекта ещё нет:

```bash
npx cap add android
```

После этого появится каталог `android/` с нативным проектом.

## Шаг 3. Сборка веб-приложения и синхронизация с Android

Соберите проект и скопируйте результат в Android-проект:

```bash
npm run build:android
```

Или по шагам:

```bash
npm run build
npx cap sync android
```

## Шаг 4. Сборка APK

### Вариант A: через Android Studio (рекомендуется)

1. Откройте Android-проект в Android Studio:
   ```bash
   npm run cap:android
   ```
   или вручную: **File → Open** → выберите папку `android`.

2. Дождитесь синхронизации Gradle.

3. Сборка отладочного APK (для тестов):
   - **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
   - Готовый APK: `android/app/build/outputs/apk/debug/app-debug.apk`

4. Сборка релизного APK (для установки вне разработки):
   - **Build → Generate Signed Bundle / APK** → выберите **APK**.
   - Создайте или выберите keystore, задайте пароли и алиасы.
   - Выберите вариант **release**.
   - Релизный APK будет в `android/app/build/outputs/apk/release/`.

### Вариант B: из командной строки (Gradle)

Из корня проекта:

```bash
cd android
./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

Релиз (нужен настроенный keystore):

```bash
./gradlew assembleRelease
```

## Полезные команды

| Команда | Описание |
|--------|----------|
| `npm run build` | Сборка веб-приложения в `dist/` |
| `npm run build:android` | Сборка + синхронизация с `android` |
| `npm run cap:sync` | Синхронизация всех платформ |
| `npm run cap:android` | Открыть проект в Android Studio |

## Конфигурация

- **Capacitor:** `capacitor.config.ts` — `appId`, `appName`, `webDir: 'dist'`.
- **Vite:** в сборке используется `base: './'`, чтобы приложение корректно работало внутри WebView.

После изменения кода снова выполните `npm run build:android`, затем при необходимости пересоберите APK в Android Studio или через Gradle.
