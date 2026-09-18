import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Neetcode Spaced Repetition',
  version: '1.0.0',
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApQl7yRak+klCSi5Sg629DrYjOk0+WaVo3Ti5XpGHdkYHnl2+C3A0Ff6GbqxKYl3kHn0UzbDbo8Y2VipuWAQ2XDWAl4kF6uFKxgBUJUjGoNLhyJZ3na/QCkm8CahWnKIG+l0HwRGmwjM04QxZzqPurKINQAF06b7ThK7dJG1uwNpXNcQYu9lNtuMU79k6aRgfUWT0Eu745u80RnTA+hQdbkImZLotns0u/cnMOEWNRg2SSOFRvF7ed3EuY5NYQQ7rLp1/cMTxJBq/y+2CaoIZzxPc6VAPLh/WV71DZJj2GQDZUT3xA34L5UQ2EKHu8DoewFDviJg3ODEmhFhH08PZawIDAQAB',
  description: 'Automates spaced repetition for neetcode.io',
  icons: {
    '16': 'icon_16.png',
    '48': 'icon_48.png',
    '128': 'icon_128.png',
  },
  action: {
    default_popup: 'index.html',
    default_icon: {
      '16': 'icon_16.png',
      '48': 'icon_48.png',
      '128': 'icon_128.png',
    }
  },
  permissions: ['storage'],
  host_permissions: ['*://*.neetcode.io/*', 'http://localhost:11434/*'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['*://*.neetcode.io/*'],
      js: ['src/content/neetcode-detector.ts', 'src/content/neetcode-hints.tsx'],
    }
  ],
});
