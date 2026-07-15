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

        <Accordion v-if="setupRequired" value="">
          <AccordionPanel value="github-import">
            <AccordionHeader>{{ t('auth.optionalImport') }}</AccordionHeader>
            <AccordionContent>
              <div class="space-y-4 pt-2">
                <InputText
                  :model-value="ownerRepo"
                  :placeholder="t('auth.repository')"
                  autocomplete="off"
                  class="w-full"
                  @update:model-value="onOwnerRepoChange"
                />
                <Password
                  :model-value="setupData.pat || ''"
                  :feedback="false"
                  toggle-mask
                  fluid
                  autocomplete="new-password"
                  :placeholder="t('auth.pat')"
                  @update:model-value="update('pat', $event)"
                />
                <Message severity="info" size="small" :closable="false">{{ t('auth.importHint') }}</Message>
              </div>
            </AccordionContent>
          </AccordionPanel>
        </Accordion>

        <Button type="submit" :loading="loading" class="w-full">
          {{ setupRequired ? t('auth.setupAction') : t('auth.loginAction') }}
        </Button>
      </form>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Accordion from 'primevue/accordion';
import AccordionContent from 'primevue/accordioncontent';
import AccordionHeader from 'primevue/accordionheader';
import AccordionPanel from 'primevue/accordionpanel';
import Button from 'primevue/button';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
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
const ownerRepo = ref('');

watch(() => [props.setupData.owner || '', props.setupData.repo || ''], ([owner, repo]) => {
  const combined = owner && repo ? `${owner}/${repo}` : owner || repo;
  if (combined !== ownerRepo.value) ownerRepo.value = combined;
}, { immediate: true });

function onOwnerRepoChange(value: string | undefined) {
  ownerRepo.value = value || '';
  const slash = ownerRepo.value.indexOf('/');
  const owner = slash >= 0 ? ownerRepo.value.slice(0, slash) : ownerRepo.value;
  const repo = slash >= 0 ? ownerRepo.value.slice(slash + 1) : '';
  emit('update:setupData', { ...props.setupData, owner, repo });
}

function update(key: keyof SetupData, value: string | undefined) {
  emit('update:setupData', { ...props.setupData, [key]: value || '' });
}
</script>
