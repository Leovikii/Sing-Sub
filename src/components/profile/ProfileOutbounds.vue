<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-2">
      <ArrowUp class="w-4 h-4 text-brand-pink" />
      <h3 class="font-bold text-text-primary">{{ t('profiles.outbounds') }}</h3>
    </div>

    <div v-if="!templateData" class="text-sm text-text-muted bg-bg-elevated/40 border border-border-base rounded-xl p-4 text-center">
      {{ t('profiles.chooseTemplateFirst') }}
    </div>

    <div v-else-if="selectorGroups.length === 0" class="text-sm text-text-muted bg-bg-elevated/40 border border-border-base rounded-xl p-4 text-center">
      {{ t('profiles.noSelector') }}
    </div>

    <div
      v-for="group in selectorGroups"
      :key="group.tag"
      class="bg-bg-elevated/40 border border-border-base rounded-xl p-4 transition-colors"
    >
      <div class="flex flex-wrap md:flex-nowrap items-center justify-between md:justify-start gap-y-3 gap-x-4">
        <!-- Left: Tag -->
        <div class="w-auto md:w-32 shrink-0 font-medium text-text-primary truncate order-1" :title="group.tag">
          {{ group.tag }}
        </div>
          
          <!-- Edit Mode -->
          <template v-if="isEditing(group.tag)">
            <div class="order-3 md:order-2 w-full md:w-auto md:flex-1 flex items-center gap-2">
              <PrimeSelect
                v-model="getTempFilters(group.tag)[0].action"
                :options="filterOptions"
                option-label="label"
                option-value="value"
                :aria-label="`${group.tag} ${t('profiles.filterMode')}`"
                class="w-28 shrink-0"
              />
              <InputText v-model="getTempFilters(group.tag)[0].keyword" :placeholder="t('profiles.keyword')" class="flex-1" fluid />
            </div>
            
            <Button
              @click="confirmEdit(group.tag)"
              outlined
              :aria-label="t('common.confirm')"
              :disabled="!getTempFilters(group.tag)[0].keyword.trim()"
              class="order-2 ml-auto shrink-0 md:order-3 md:ml-0"
            >
              <Check :size="18" aria-hidden="true" />
              <span class="hidden md:inline">{{ t('common.confirm') }}</span>
            </Button>
          </template>

          <!-- Confirmed Mode -->
          <template v-else-if="getRule(group.tag)">
            <!-- Micro Cards -->
            <div class="order-3 md:order-2 w-full md:w-auto md:flex-1 flex flex-wrap md:flex-nowrap items-center gap-1.5 md:overflow-x-auto no-scrollbar py-1">
              <template v-if="matchedNodesByTag[group.tag]?.length">
                <NodeMicroCard
                  v-for="(node, idx) in matchedNodesByTag[group.tag].slice(0, 10)"
                  :key="idx"
                  :node="{ type: node.type || '', tag: node.tag }"
                />
                <span v-if="matchedNodesByTag[group.tag].length > 10" class="px-2 py-0.5 rounded-full bg-border-base text-text-muted text-xs font-medium whitespace-nowrap">
                  +{{ matchedNodesByTag[group.tag].length - 10 }}
                </span>
              </template>
              <span v-else-if="getRule(group.tag)" class="text-sm text-text-muted italic">{{ t('profiles.noMatches') }}</span>
              <span v-else class="text-sm text-text-muted italic">{{ t('profiles.noRule') }}</span>
            </div>

            <!-- Actions -->
            <Button
              @click="clearRule(group.tag)"
              severity="danger"
              text
              :aria-label="t('common.delete')"
              class="order-2 ml-auto shrink-0 md:order-3 md:ml-0"
            >
              <Trash2 :size="18" aria-hidden="true" />
              <span class="hidden md:inline">{{ t('common.delete') }}</span>
            </Button>
          </template>

          <template v-else>
            <!-- Insert Button -->
            <Button
              @click="startEdit(group.tag)"
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
import { ArrowUp, Plus, Trash2, Check } from 'lucide-vue-next';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import PrimeSelect from 'primevue/select';
import NodeMicroCard from '../ui/NodeMicroCard.vue';
import type { Profile } from '../../types';

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

// Extracted selector outbounds from template
const selectorGroups = computed(() => {
  if (!props.templateData || !Array.isArray(props.templateData.outbounds)) return [];
  return props.templateData.outbounds.filter((o: any) => o.type === 'selector' && o.tag);
});

// Editing state map
const editingState = ref<Record<string, boolean>>({});
const tempFilters = ref<Record<string, any[]>>({});

// Initialize empty rules array if missing
if (!profile.value.rules) {
  profile.value.rules = [];
}

// Helper to get rule from profile
function getRule(tag: string) {
  return profile.value.rules?.find(r => r.group === tag);
}

// Check if a group is currently in edit mode
function isEditing(tag: string) {
  return !!editingState.value[tag];
}

// Temp filters for editing (always 1 rule now)
function getTempFilters(tag: string) {
  if (!tempFilters.value[tag]) {
    const existing = getRule(tag);
    tempFilters.value[tag] = existing && existing.filters.length > 0 
      ? [JSON.parse(JSON.stringify(existing.filters[0]))] 
      : [{ action: 'include', keyword: '' }];
  }
  return tempFilters.value[tag];
}

function startEdit(tag: string) {
  editingState.value[tag] = true;
  const existing = getRule(tag);
  tempFilters.value[tag] = existing ? JSON.parse(JSON.stringify(existing.filters)) : [{ action: 'include', keyword: '' }];
}

function confirmEdit(tag: string) {
  const filters = getTempFilters(tag).filter(f => f.keyword.trim() !== '');
  
  if (!profile.value.rules) profile.value.rules = [];
  
  const existingIndex = profile.value.rules.findIndex(r => r.group === tag);
  
  if (filters.length > 0) {
    if (existingIndex >= 0) {
      profile.value.rules[existingIndex].filters = filters;
    } else {
      profile.value.rules.push({ group: tag, filters });
    }
  } else {
    // If empty filters, clear the rule
    if (existingIndex >= 0) {
      profile.value.rules.splice(existingIndex, 1);
    }
  }
  
  editingState.value[tag] = false;
}

function clearRule(tag: string) {
  if (!profile.value.rules) return;
  const existingIndex = profile.value.rules.findIndex(r => r.group === tag);
  if (existingIndex >= 0) {
    profile.value.rules.splice(existingIndex, 1);
  }
  editingState.value[tag] = false; // Collapse
  tempFilters.value[tag] = [{ action: 'include', keyword: '' }]; // Reset temp
}

// Local filtering simulation for Micro-cards
function getMatchedNodes(tag: string): { tag: string; type: string }[] {
  const rule = getRule(tag);
  if (!rule || !props.nodesData || !Array.isArray(props.nodesData.outbounds)) return [];

  const nodes = props.nodesData.outbounds.filter((o: any) => o.tag) as { tag: string; type?: string }[];

  let result: { tag: string; type: string }[] = [];
  let isFirstInclude = true;

  for (const filter of rule.filters) {
    if (!filter.keyword) continue;
    const keywords = filter.keyword.split(',').map(k => k.trim()).filter(Boolean);

    if (filter.action === 'include') {
      const currentMatches = nodes
        .filter(n => keywords.some(k => n.tag.includes(k)))
        .map(n => ({ tag: n.tag, type: n.type || '' }));
      if (isFirstInclude) {
        result = currentMatches;
        isFirstInclude = false;
      } else {
        const newMatches = currentMatches.filter(n => !result.find(r => r.tag === n.tag));
        result.push(...newMatches);
      }
    } else if (filter.action === 'exclude') {
      if (isFirstInclude) {
        result = nodes
          .filter(n => !keywords.some(k => n.tag.includes(k)))
          .map(n => ({ tag: n.tag, type: n.type || '' }));
        isFirstInclude = false;
      } else {
        result = result.filter(n => !keywords.some(k => n.tag.includes(k)));
      }
    }
  }

  return result;
}

// Cache matched nodes per group tag so the template doesn't re-run the filter
// pipeline up to 4x per render for the same group.
const matchedNodesByTag = computed(() => {
  const map: Record<string, { tag: string; type: string }[]> = {};
  for (const group of selectorGroups.value) {
    map[group.tag] = getMatchedNodes(group.tag);
  }
  return map;
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
