<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-2">
      <ArrowDown class="w-4 h-4 text-brand-pink" />
      <h3 class="font-bold text-text-primary">入站节点 (Inbounds)</h3>
    </div>

    <div
      class="bg-bg-elevated/40 border border-border-base rounded-xl p-4 transition-colors"
    >
      <div class="flex flex-wrap md:flex-nowrap items-center justify-between md:justify-start gap-y-3 gap-x-4">
        <!-- Left: Tag -->
        <div class="w-auto md:w-32 shrink-0 font-medium text-text-primary truncate order-1">
          入站节点
        </div>

          <!-- Edit Mode -->
          <template v-if="isEditing">
            <div class="order-3 md:order-2 w-full md:w-auto md:flex-1 flex items-center gap-2">
              <Select
                v-model="tempFilter.action"
                :options="[{label:'包含', value:'include'}, {label:'排除', value:'exclude'}]"
                ariaLabel="入站节点筛选方式"
                class="w-28 shrink-0"
              />
              <Input v-model="tempFilter.keyword" placeholder="关键词，多个用逗号隔开" class="flex-1" />
            </div>
            
            <button
              @click="confirmEdit"
              :disabled="!tempFilter.keyword.trim()"
              :class="[
                'order-2 md:order-3 ml-auto md:ml-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 flex items-center gap-1.5',
                tempFilter.keyword.trim()
                  ? 'bg-brand-pink/10 text-brand-pink hover:bg-brand-pink/20 cursor-pointer'
                  : 'bg-bg-elevated text-text-muted border border-border-base cursor-not-allowed'
              ]"
            >
              <Check class="w-4 h-4 md:hidden" />
              <span class="hidden md:inline">确认</span>
            </button>
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
              <span v-else class="text-sm text-text-muted italic">无匹配节点</span>
            </div>

            <!-- Actions -->
            <button
              @click="clearRule"
              class="order-2 md:order-3 ml-auto md:ml-0 px-3 py-1.5 bg-bg-elevated hover:bg-danger/10 border border-border-base hover:border-danger/30 text-text-muted hover:text-danger rounded-xl text-sm transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Trash2 class="w-4 h-4" />
              <span class="hidden md:inline">删除</span>
            </button>
          </template>

          <!-- Empty Mode -->
          <template v-else>
            <!-- Insert Button -->
            <button
              @click="startEdit"
              class="order-2 md:order-3 ml-auto md:ml-0 px-4 py-2 bg-bg-elevated hover:bg-border-base border border-border-base text-text-primary rounded-xl text-sm transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Plus class="w-4 h-4" />
              <span class="hidden md:inline">插入节点</span>
            </button>
          </template>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArrowDown, Plus, Trash2, Check } from 'lucide-vue-next';
import Input from '../ui/Input.vue';
import Select from '../ui/Select.vue';
import NodeMicroCard from '../ui/NodeMicroCard.vue';
import type { Profile, FilterAction } from '../../types';

const props = defineProps<{
  profile: Profile;
  templateData: any;
  nodesData: any;
}>();

// Editing state
const isEditing = ref(false);
const tempFilter = ref<FilterAction>({ action: 'include', keyword: '' });

// Initialize empty rules array if missing
if (!props.profile.inboundRules) {
  props.profile.inboundRules = [];
}

const rule = computed(() => {
  return props.profile.inboundRules && props.profile.inboundRules.length > 0 
    ? props.profile.inboundRules[0] 
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
  
  if (!props.profile.inboundRules) props.profile.inboundRules = [];
  
  if (props.profile.inboundRules.length === 0) {
    props.profile.inboundRules.push({ tag: 'global-inbounds', filters: [tempFilter.value] });
  } else {
    props.profile.inboundRules[0].filters = [tempFilter.value];
  }
  
  isEditing.value = false;
}

function clearRule() {
  if (props.profile.inboundRules) {
    props.profile.inboundRules = [];
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
