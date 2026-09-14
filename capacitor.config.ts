import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kaytin808.leafreader.enginebeta',
  appName: 'Kayla’s Library Engine Beta',
  webDir: 'www',
  backgroundColor: '#fbfcfe',
  loggingBehavior: 'debug',
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
  // All application assets ship inside the IPA. Do not add a development URL.
  server: { hostname: 'localhost', iosScheme: 'capacitor' },
  plugins: { StatusBar: { style: 'LIGHT', overlaysWebView: true } },
};

export default config;
