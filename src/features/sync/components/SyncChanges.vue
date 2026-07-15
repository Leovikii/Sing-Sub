<template>
  <section class="settings-list min-w-0">
    <div class="border-b border-border-base px-5 py-4 font-semibold">{{ title }}</div>
    <div v-if="total === 0" class="px-5 py-8 text-center text-sm text-text-muted">{{ t('sync.noChanges') }}</div>
    <div v-else class="divide-y divide-border-base">
      <div v-for="group in groups" :key="group.key" class="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 px-5 py-3 text-sm">
        <span :class="group.className">{{ t(`sync.${group.key}`) }}</span>
        <div class="min-w-0 space-y-1 font-mono text-xs">
          <div v-for="path in group.paths" :key="path" class="truncate" :title="path">{{ path }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SyncFileChanges } from '../../../../shared/contracts/sync';

const props = defineProps<{
  title: string;
  changes?: SyncFileChanges;
}>();
const { t } = useI18n();
const groups = computed(() => [
  { key: 'added', paths: props.changes?.added || [], className: 'text-emerald-600' },
  { key: 'modified', paths: props.changes?.modified || [], className: 'text-amber-600' },
  { key: 'deleted', paths: props.changes?.deleted || [], className: 'text-red-600' },
].filter(group => group.paths.length > 0));
const total = computed(() => groups.value.reduce((sum, group) => sum + group.paths.length, 0));
</script>
