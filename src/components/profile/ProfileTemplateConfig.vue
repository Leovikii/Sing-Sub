<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <label class="w-32 shrink-0 font-medium text-text-primary">{{ t('profiles.template') }}</label>
      <div class="flex-1 min-w-0">
        <PrimeSelect
          :modelValue="profile.templateUrl || ''"
          @update:modelValue="profile.templateUrl = $event"
          :options="templateOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('profiles.chooseTemplate')"
          :ariaLabel="t('profiles.template')"
        />
      </div>
    </div>
    
    <div class="flex items-center gap-4">
      <label class="w-32 shrink-0 font-medium text-text-primary">{{ t('profiles.adapter') }} <span class="text-text-muted font-normal text-xs">({{ t('profiles.optional') }})</span></label>
      <div class="flex-1 min-w-0">
        <PrimeSelect
          :modelValue="profile.adapterUrl || ''"
          @update:modelValue="profile.adapterUrl = $event"
          :options="adapterOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('profiles.none')"
          :ariaLabel="t('profiles.adapter')"
        />
      </div>
    </div>
    <div class="flex items-center gap-4">
      <label class="w-32 shrink-0 font-medium text-text-primary">{{ t('profiles.nodeSet') }}</label>
      <div class="flex-1 min-w-0">
        <PrimeSelect
          :modelValue="profile.nodesPath || ''"
          @update:modelValue="profile.nodesPath = $event"
          :options="nodeOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('profiles.chooseNodeSet')"
          :ariaLabel="t('profiles.nodeSet')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PrimeSelect from 'primevue/select';
import type { Profile } from '../../types';

const { t } = useI18n();

const profile = defineModel<Profile>('profile', { required: true });
const props = defineProps<{
  availableNodes?: string[];
  availableTemplates?: string[];
  availableAdapters?: string[];
}>();

const nodeOptions = computed(() => {
  return (props.availableNodes || []).map(n => {
    const path = typeof n === 'string' ? n : (n as any).path || '';
    return {
      label: path.replace('sing-sub/nodes/', ''),
      value: path,
    };
  });
});

const adapterOptions = computed(() => {
  const opts = (props.availableAdapters || []).map(p => {
    const path = typeof p === 'string' ? p : (p as any).path || '';
    return {
      label: path.replace('sing-sub/adapters/', ''),
      value: path,
    };
  });
  opts.unshift({ label: t('profiles.none'), value: '' });
  return opts;
});

const templateOptions = computed(() => {
  const opts = (props.availableTemplates || []).map(t => {
    const path = typeof t === 'string' ? t : (t as any).path || '';
    return {
      label: path.replace('sing-sub/templates/', ''),
      value: path,
    };
  });
  return opts;
});
</script>
