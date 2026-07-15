<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-2">
      <ArrowDown class="w-4 h-4 text-brand-pink" />
      <h3 class="font-bold text-text-primary">{{ t('profiles.inbounds') }}</h3>
    </div>

    <div
      class="bg-bg-elevated/40 border border-border-base rounded-xl p-4 transition-colors"
    >
      <div class="flex flex-wrap md:flex-nowrap items-center justify-between md:justify-start gap-y-3 gap-x-4">
        <!-- Left: Tag -->
        <div class="w-auto md:w-32 shrink-0 font-medium text-text-primary truncate order-1">
          {{ t('profiles.inbounds') }}
        </div>

          <!-- Edit Mode -->
          <template v-if="isEditing">
            <div class="order-3 md:order-2 w-full md:w-auto md:flex-1 flex items-center gap-2">
              <PrimeSelect
                v-model="tempFilter.action"
                :options="filterOptions"
                option-label="label"
                option-value="value"
                :aria-label="`${t('profiles.inbounds')} ${t('profiles.filterMode')}`"
                class="w-28 shrink-0"
              />
              <InputText v-model="tempFilter.keyword" :placeholder="t('profiles.keyword')" class="flex-1" fluid />
            </div>
            
            <Button
              @click="confirmEdit"
              outlined
              :aria-label="t('common.confirm')"
              :disabled="!tempFilter.keyword.trim()"
              class="order-2 ml-auto shrink-0 md:order-3 md:ml-0"
            >
              <Check :size="18" aria-hidden="true" />
              <span class="hidden md:inline">{{ t('common.confirm') }}</span>
            </Button>
          </template>

          <!-- Confirmed Mode -->
          <template v-else-if="hasRule">
            <!-- Micro Cards -->
            <div class="order-3 md:order-2 w-full md:w-auto md:flex-1 flex flex-wrap md:flex-nowrap items-center gap-1.5 md:overflow-x-auto no-scrollbar py-1">
              <template v-if="matchedNodes.length > 0">
                <NodeMicroCard
                  v-for="(node, idx) in matchedNodes.slice(0, 10)"
                  :key="idx"
                  :node="{ type: node.type || '', tag: node.tag }"
                />
                <span v-if="matchedNodes.length > 10" class="px-2 py-0.5 rounded-full bg-border-base text-text-muted text-xs font-medium whitespace-nowrap">
                  +{{ matchedNodes.length - 10 }}
                </span>
              </template>
              <span v-else class="text-sm text-text-muted italic">{{ t('profiles.noMatches') }}</span>
            </div>

            <!-- Actions -->
            <Button
              @click="clearRule"
              severity="danger"
              text
              :aria-label="t('common.delete')"
              class="order-2 ml-auto shrink-0 md:order-3 md:ml-0"
            >
              <Trash2 :size="18" aria-hidden="true" />
              <span class="hidden md:inline">{{ t('common.delete') }}</span>
            </Button>
          </template>

          <!-- Empty Mode -->
          <template v-else>
            <!-- Insert Button -->
            <Button
              @click="startEdit"
              severity="secondary"
              text
              :aria-label="t('profiles.insertNodes')"
              class="order-2 ml-auto shrink-0 md:order-3 md:ml-0"
            >
              <Plus :size="18" aria-hidden="true" />
              <span class="hidden md:inline">{{ t('profiles.insertNodes') }}</span>
            </Button>
          </template>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDown, Plus, Trash2, Check } from 'lucide-vue-next';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import PrimeSelect from 'primevue/select';
import NodeMicroCard from '../ui/NodeMicroCard.vue';
import type { Profile, FilterAction } from '../../types';

const { t } = useI18n();
const filterOptions = computed(() => [
  { label: t('profiles.filterInclude'), value: 'include' },
  { label: t('profiles.filterExclude'), value: 'exclude' },
]);

const profile = defineModel<Profile>('profile', { required: true });
const props = defineProps<{
  templateData: any;
  nodesData: any;
}>();

// Editing state
const isEditing = ref(false);
const tempFilter = ref<FilterAction>({ action: 'include', keyword: '' });

// Initialize empty rules array if missing
if (!profile.value.inboundRules) {
  profile.value.inboundRules = [];
}

const rule = computed(() => {
  return profile.value.inboundRules && profile.value.inboundRules.length > 0
    ? profile.value.inboundRules[0]
    : null;
});

const hasRule = computed(() => !!rule.value);

function startEdit() {
  isEditing.value = true;
  if (rule.value && rule.value.filters.length > 0) {
    tempFilter.value = JSON.parse(JSON.stringify(rule.value.filters[0]));
  } else {
    tempFilter.value = { action: 'include', keyword: '' };
  }
}

function confirmEdit() {
  if (!tempFilter.value.keyword.trim()) return;
  
  if (!profile.value.inboundRules) profile.value.inboundRules = [];
  
  if (profile.value.inboundRules.length === 0) {
    profile.value.inboundRules.push({ tag: 'global-inbounds', filters: [tempFilter.value] });
  } else {
    profile.value.inboundRules[0].filters = [tempFilter.value];
  }
  
  isEditing.value = false;
}

function clearRule() {
  if (profile.value.inboundRules) {
    profile.value.inboundRules = [];
  }
  isEditing.value = false;
  tempFilter.value = { action: 'include', keyword: '' };
}

// Local filtering simulation for Micro-cards
const matchedNodes = computed(() => {
  const currentRule = rule.value;
  if (!currentRule || !props.nodesData || !Array.isArray(props.nodesData.inbounds)) return [];
  
  const inbounds = props.nodesData.inbounds.filter((i: any) => i.tag);
  
  let result: any[] = [];
  let isFirstInclude = true;
  
  for (const filter of currentRule.filters) {
    if (!filter.keyword) continue;
    const keywords = filter.keyword.split(',').map(k => k.trim()).filter(Boolean);
    
    if (filter.action === 'include') {
      const currentMatches = inbounds.filter((t: any) => keywords.some(k => t.tag.includes(k)));
      if (isFirstInclude) {
        result = currentMatches;
        isFirstInclude = false;
      } else {
        const newMatches = currentMatches.filter((t: any) => !result.find(r => r.tag === t.tag));
        result.push(...newMatches);
      }
    } else if (filter.action === 'exclude') {
      if (isFirstInclude) {
        result = inbounds.filter((t: any) => !keywords.some(k => t.tag.includes(k)));
        isFirstInclude = false;
      } else {
        result = result.filter(t => !keywords.some(k => t.tag.includes(k)));
      }
    }
  }
  
  return result;
});

</script>
<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
