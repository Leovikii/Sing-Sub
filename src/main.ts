import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import './style.css';
import App from './App.vue';
import { router } from './app/routes';
import { i18n } from './i18n';
import { primeVueLocales } from './i18n/primevue';
import { primeVueOptions } from './theme/primevue-preset';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(PrimeVue, {
  ...primeVueOptions,
  locale: primeVueLocales[i18n.global.locale.value as 'zh-CN' | 'en-US'],
});
app.use(ConfirmationService);
app.use(ToastService);
app.directive('tooltip', Tooltip);
app.mount('#app');
