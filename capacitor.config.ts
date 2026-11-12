import type { CapacitorConfig } from '@capacitor/cli';

// appId: identificador único en App Store / Google Play. Cámbialo antes de publicar si quieres otro.
const config: CapacitorConfig = {
  appId: 'io.github.alonsodelomask.voces',
  appName: 'Voces',
  webDir: 'dist',
  backgroundColor: '#14041a',
  ios: {
    contentInset: 'never',
    backgroundColor: '#14041a',
  },
  android: {
    backgroundColor: '#14041a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#14041a',
      showSpinner: false,
    },
  },
};

export default config;
