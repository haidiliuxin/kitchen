import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kitchenassistant.xiaobaixiachuu',
  appName: '小白下厨',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    allowNavigation: ['10.130.69.221'],
  },
};

export default config;
