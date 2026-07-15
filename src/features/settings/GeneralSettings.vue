<template>
  <div class="settings-list">
    <div class="settings-row">
      <div>
        <div class="settings-label">{{ t('general.language') }}</div>
        <div class="settings-hint">{{ t('general.languageHint') }}</div>
      </div>
      <Select
        v-model="locale"
        :options="localeOptions"
        option-label="label"
        option-value="value"
        :aria-label="t('general.language')"
        class="w-44"
      />
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-label">{{ t('general.appearance') }}</div>
        <div class="settings-hint">{{ t('general.appearanceHint') }}</div>
      </div>
      <SelectButton
        v-model="appearance"
        :options="appearanceOptions"
        option-label="label"
        option-value="value"
        :aria-label="t('general.appearance')"
        :allow-empty="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import { usePreferencesStore } from '../../stores/preferences';

const { t } = useI18n();
const preferences = usePreferencesStore();
const { locale, appearance } = storeToRefs(preferences);
const localeOptions = computed(() => [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]);
const appearanceOptions = computed(() => [
  { label: t('general.themeSystem'), value: 'system' },
  { label: t('general.themeLight'), value: 'light' },
  { label: t('general.themeDark'), value: 'dark' },
]);
</script>
