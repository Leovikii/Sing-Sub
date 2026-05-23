<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-2">
      <ArrowDownToLine class="w-4 h-4 text-[#F596AA]" />
      <h3 class="font-bold text-[#f5f5f7]">入站节点 (Inbounds)</h3>
    </div>

    <div
      class="bg-[#2c2c2e]/40 border border-[#38383a] rounded-xl p-4 transition-all"
    >
      <div class="flex items-center gap-4">
        <!-- Left: Tag -->
        <div class="w-32 shrink-0 font-medium text-[#f5f5f7] truncate">
          入站节点
        </div>

        <!-- Right: Content -->
        <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
          
          <!-- Edit Mode -->
          <template v-if="isEditing">
            <div class="flex-1 flex items-center gap-2">
              <AppleSelect
                v-model="tempFilter.action"
                :options="[{label:'包含', value:'include'}, {label:'排除', value:'exclude'}]"
                class="w-28 shrink-0"
              />
              <AppleInput v-model="tempFilter.keyword" placeholder="关键词，多个用逗号隔开" class="flex-1" />
            </div>
            
            <button
              @click="confirmEdit"
              :disabled="!tempFilter.keyword.trim()"
              :class="[
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 self-center flex items-center gap-1.5',
                tempFilter.keyword.trim() 
                  ? 'bg-[#F596AA]/10 text-[#F596AA] hover:bg-[#F596AA]/20 cursor-pointer' 
                  : 'bg-[#2c2c2e] text-[#86868b] border border-[#38383a] cursor-not-allowed'
              ]"
            >
              <Check class="w-4 h-4 md:hidden" />
              <span class="hidden md:inline">确认</span>
            </button>
          </template>

          <!-- Confirmed Mode -->
          <template v-else-if="hasRule">
            <!-- Micro Cards -->
            <div class="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <template v-if="matchedNodes.length > 0">
                <span
                  v-for="(node, idx) in matchedNodes.slice(0, 5)"
                  :key="idx"
                  class="inline-flex items-center rounded-full whitespace-nowrap border border-[#F596AA]/20 overflow-hidden"
                >
                  <span class="px-1.5 py-1 bg-[#38383a] text-[#86868b] text-[10px] font-bold uppercase leading-none">{{ node.type }}</span>
                  <span class="px-2 py-1 bg-[#F596AA]/10 text-[#F596AA] text-xs font-medium leading-none">{{ node.tag }}</span>
                </span>
                <span v-if="matchedNodes.length > 5" class="px-2 py-0.5 rounded-full bg-[#38383a] text-[#86868b] text-xs font-medium whitespace-nowrap">
                  +{{ matchedNodes.length - 5 }}
                </span>
              </template>
              <span v-else class="text-sm text-[#86868b] italic">无匹配节点</span>
            </div>

            <!-- Actions -->
            <button
              @click="clearRule"
              class="px-4 py-2 bg-[#2c2c2e] hover:bg-[#ff6961]/10 border border-[#38383a] hover:border-[#ff6961]/30 text-[#86868b] hover:text-[#ff6961] rounded-xl text-sm transition-colors flex items-center gap-1.5 shrink-0 ml-2"
            >
              <Trash2 class="w-4 h-4" />
              <span class="hidden md:inline">删除</span>
            </button>
          </template>

          <!-- Empty Mode -->
          <template v-else>
            <button
              @click="startEdit"
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
import { ArrowDownToLine, Plus, Trash2, Check } from 'lucide-vue-next';
import AppleInput from '../ui/AppleInput.vue';
import AppleSelect from '../ui/AppleSelect.vue';
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
