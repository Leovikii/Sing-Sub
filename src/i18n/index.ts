import { createI18n } from 'vue-i18n';
import enUS from './messages/en-US';
import zhCN from './messages/zh-CN';

export type AppLocale = 'zh-CN' | 'en-US';

function initialLocale(): AppLocale {
  const saved = localStorage.getItem('sing-sub.locale');
  if (saved === 'zh-CN' || saved === 'en-US') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});
