
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.supermoskitka.app',
  appName: 'Супермоскитка',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // Здесь можно настроить плагины Capacitor, если потребуется (например, SplashScreen)
  }
};

export default config;
