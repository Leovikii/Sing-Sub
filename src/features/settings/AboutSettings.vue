<template>
  <div class="settings-list">
    <div class="settings-row">
      <span class="settings-label">{{ t('about.version') }}</span>
      <code class="text-sm">{{ version }}</code>
    </div>
    <div class="settings-row">
      <span class="settings-label">{{ t('about.runtime') }}</span>
      <span class="text-sm text-text-muted">Cloudflare Workers + R2</span>
    </div>
    <div class="settings-row">
      <span class="settings-label">{{ t('about.license') }}</span>
      <span class="text-sm text-text-muted">GPL-3.0</span>
    </div>
    <div class="settings-row">
      <span class="settings-label">{{ t('about.source') }}</span>
      <Button as="a" href="https://github.com/Leovikii/Sing-Sub" target="_blank" rel="noopener noreferrer" severity="secondary" outlined>
        <Github :size="17" aria-hidden="true" />
        <span>GitHub</span>
        <ExternalLink :size="14" aria-hidden="true" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { ExternalLink, Github } from 'lucide-vue-next';

defineProps<{ version: string }>();
const { t } = useI18n();
</script>
