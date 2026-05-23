<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-2">
      <ArrowUpFromLine class="w-4 h-4 text-[#F596AA]" />
      <h3 class="font-bold text-[#f5f5f7]">出站节点 (Outbounds)</h3>
    </div>

    <div v-if="!templateData" class="text-sm text-[#86868b] bg-[#2c2c2e]/40 border border-[#38383a] rounded-xl p-4 text-center">
      请先选择配置模板
    </div>
    
    <div v-else-if="selectorGroups.length === 0" class="text-sm text-[#86868b] bg-[#2c2c2e]/40 border border-[#38383a] rounded-xl p-4 text-center">
      该模板中没有 type 为 selector 的出站分组
    </div>

    <div
      v-for="group in selectorGroups"
      :key="group.tag"
      class="bg-[#2c2c2e]/40 border border-[#38383a] rounded-xl p-4 transition-all"
    >
      <div class="flex items-center gap-4">
        <!-- Left: Tag -->
        <div class="w-32 shrink-0 font-medium text-[#f5f5f7] truncate" :title="group.tag">
          {{ group.tag }}
        </div>

        <!-- Right: Content -->
        <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
          
          <!-- Edit Mode -->
          <template v-if="isEditing(group.tag)">
            <div class="flex-1 flex items-center gap-2">
              <AppleSelect
                v-model="getTempFilters(group.tag)[0].action"
                :options="[{label:'包含', value:'include'}, {label:'排除', value:'exclude'}]"
                class="w-28 shrink-0"
              />
              <AppleInput v-model="getTempFilters(group.tag)[0].keyword" placeholder="关键词，多个用逗号隔开" class="flex-1" />
            </div>
            
            <button
              @click="confirmEdit(group.tag)"
              :disabled="!getTempFilters(group.tag)[0].keyword.trim()"
              :class="[
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 self-center flex items-center gap-1.5',
                getTempFilters(group.tag)[0].keyword.trim() 
                  ? 'bg-[#F596AA]/10 text-[#F596AA] hover:bg-[#F596AA]/20 cursor-pointer' 
                  : 'bg-[#2c2c2e] text-[#86868b] border border-[#38383a] cursor-not-allowed'
              ]"
            >
              <Check class="w-4 h-4 md:hidden" />
              <span class="hidden md:inline">确认</span>
            </button>
          </template>

          <!-- Confirmed Mode -->
          <template v-else-if="getRule(group.tag)">
            <!-- Micro Cards -->
            <div class="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <template v-if="getMatchedNodes(group.tag).length > 0">
                <span
                  v-for="(node, idx) in getMatchedNodes(group.tag).slice(0, 5)"
                  :key="idx"
                  class="inline-flex items-center rounded-full whitespace-nowrap border border-[#F596AA]/20 overflow-hidden"
                >
                  <span class="px-1.5 py-1 bg-[#38383a] text-[#86868b] text-[10px] font-bold uppercase leading-none">{{ node.type }}</span>
                  <span class="px-2 py-1 bg-[#F596AA]/10 text-[#F596AA] text-xs font-medium leading-none">{{ node.tag }}</span>
                </span>
                <span v-if="getMatchedNodes(group.tag).length > 5" class="px-2 py-0.5 rounded-full bg-[#38383a] text-[#86868b] text-xs font-medium whitespace-nowrap">
                  +{{ getMatchedNodes(group.tag).length - 5 }}
                </span>
              </template>
              <span v-else-if="getRule(group.tag)" class="text-sm text-[#86868b] italic">无匹配节点</span>
              <span v-else class="text-sm text-[#86868b] italic">未配置规则</span>
            </div>

            <!-- Actions -->
            <button
              @click="clearRule(group.tag)"
              class="px-4 py-2 bg-[#2c2c2e] hover:bg-[#ff6961]/10 border border-[#38383a] hover:border-[#ff6961]/30 text-[#86868b] hover:text-[#ff6961] rounded-xl text-sm transition-colors flex items-center gap-1.5 shrink-0 ml-2"
            >
              <Trash2 class="w-4 h-4" />
              <span class="hidden md:inline">删除</span>
            </button>
          </template>

          <template v-else>
            <!-- Insert Button -->
            <button
              @click="startEdit(group.tag)"
              class="px-4 py-2 bg-[#2c2c2e] hover:bg-[#38383a] border border-[#38383a] text-[#f5f5f7] rounded-xl text-sm transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Plus class="w-4 h-4" />
              <span class="hidden md:inline">插入节点</span>
            </button>
          </template>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArrowUpFromLine, Plus, Trash2, Check } from 'lucide-vue-next';
import AppleInput from '../ui/AppleInput.vue';
import AppleSelect from '../ui/AppleSelect.vue';
import type { Profile } from '../../types';

const props = defineProps<{
  profile: Profile;
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
if (!props.profile.rules) {
  props.profile.rules = [];
}

// Helper to get rule from profile
function getRule(tag: string) {
  return props.profile.rules?.find(r => r.group === tag);
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
  
  if (!props.profile.rules) props.profile.rules = [];
  
  const existingIndex = props.profile.rules.findIndex(r => r.group === tag);
  
  if (filters.length > 0) {
    if (existingIndex >= 0) {
      props.profile.rules[existingIndex].filters = filters;
    } else {
      props.profile.rules.push({ group: tag, filters });
    }
  } else {
    // If empty filters, clear the rule
    if (existingIndex >= 0) {
      props.profile.rules.splice(existingIndex, 1);
    }
  }
  
  editingState.value[tag] = false;
}

function clearRule(tag: string) {
  if (!props.profile.rules) return;
  const existingIndex = props.profile.rules.findIndex(r => r.group === tag);
  if (existingIndex >= 0) {
    props.profile.rules.splice(existingIndex, 1);
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
