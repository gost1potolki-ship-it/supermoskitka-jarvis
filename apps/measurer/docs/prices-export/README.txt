Экспорт прайса для офлайн ПК-калькулятора
Сгенерировано: 2026-06-01T10:38:37.691Z
Команда: npm run export:desktop-prices

prices-flat.csv       — все числовые листья PRICES (path + value)
prices-structured.csv — профили/полотна/монтаж по цветам
prices-full.json      — полный price_settings (для импорта в ПК)
product-fields-matrix.csv / .json — какие поля для какого ProductType

После изменения constants.ts перезапустите экспорт.