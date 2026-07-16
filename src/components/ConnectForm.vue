<template>
  <Card class="mx-auto mt-8 w-full max-w-md sm:mt-16">
    <template #title>
      <h2 class="text-center text-xl">{{ setupRequired ? t('auth.setupTitle') : t('auth.loginTitle') }}</h2>
    </template>
    <template #subtitle>
      <div class="text-center">{{ setupRequired ? t('auth.setupSubtitle') : t('auth.loginSubtitle') }}</div>
    </template>
    <template #content>
      <form class="space-y-5" @submit.prevent="$emit('save')">
        <div class="space-y-2">
          <label for="admin-password" class="settings-label">{{ t('auth.password') }}</label>
          <Password
            id="admin-password"
            :model-value="setupData.adminPassword"
            :feedback="false"
            toggle-mask
            fluid
            autocomplete="current-password"
            :placeholder="t('auth.password')"
            @update:model-value="update('adminPassword', $event)"
          />
        </div>

        <Button type="submit" :loading="loading" class="w-full">
          {{ setupRequired ? t('auth.setupAction') : t('auth.loginAction') }}
        </Button>
      </form>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Password from 'primevue/password';
import type { SetupData } from '../types';

const props = defineProps<{
  setupData: SetupData;
  loading: boolean;
  setupRequired: boolean;
}>();

const emit = defineEmits<{
  save: [];
  'update:setupData': [value: SetupData];
}>();

const { t } = useI18n();

function update(key: keyof SetupData, value: string | undefined) {
  emit('update:setupData', { ...props.setupData, [key]: value || '' });
}
</script>
