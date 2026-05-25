<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <label class="w-32 shrink-0 font-medium text-[#f5f5f7]">配置模板</label>
      <div class="flex-1 min-w-0">
        <AppleSelect
          v-if="!isCustomTemplate"
          :modelValue="profile.templateUrl || ''"
          @update:modelValue="onTemplateSelect"
          :options="templateOptions"
          placeholder="选择一个模板..."
        />
        <div v-else class="flex gap-2 items-center">
          <AppleInput v-model="profile.templateUrl" placeholder="https://..." class="flex-1" />
          <button @click="cancelCustomTemplate" title="删除自定义模板并返回选择" class="w-10 h-10 flex items-center justify-center rounded-xl bg-[#ff6961]/10 text-[#ff6961] hover:bg-[#ff6961]/20 transition shrink-0 cursor-pointer">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    
    <div class="flex items-center gap-4">
      <label class="w-32 shrink-0 font-medium text-[#f5f5f7]">配置补丁 <span class="text-[#86868b] font-normal text-xs">(可选)</span></label>
      <div class="flex-1 min-w-0">
        <AppleSelect
          :modelValue="profile.patchUrl || ''"
          @update:modelValue="profile.patchUrl = $event"
          :options="patchOptions"
          placeholder="无"
        />
      </div>
    </div>
    <div class="flex items-center gap-4">
      <label class="w-32 shrink-0 font-medium text-[#f5f5f7]">节点配置</label>
      <div class="flex-1 min-w-0">
        <AppleSelect
          :modelValue="profile.nodesPath || ''"
          @update:modelValue="profile.nodesPath = $event"
          :options="nodeOptions"
          placeholder="选择一个节点文件..."
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import AppleInput from '../ui/AppleInput.vue';
import AppleSelect from '../ui/AppleSelect.vue';
import type { Profile } from '../../types';

const props = defineProps<{
  profile: Profile;
  availableNodes?: string[];
  availableTemplates?: string[];
  availablePatches?: string[];
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

const patchOptions = computed(() => {
  const opts = (props.availablePatches || []).map(p => {
    const path = typeof p === 'string' ? p : (p as any).path || '';
    return {
      label: path.replace('sing-sub/patches/', ''),
      value: path,
    };
  });
  opts.unshift({ label: '无', value: '' });
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
  opts.push({ label: '使用自定义直链...', value: 'custom' });
  return opts;
});

const isCustomTemplate = computed(() => {
  if (!props.profile.templateUrl) return false;
  return !templateOptions.value.some(o => o.value === props.profile.templateUrl) && props.profile.templateUrl !== 'custom';
});

function onTemplateSelect(val: string) {
  if (val === 'custom') {
    props.profile.templateUrl = 'https://';
  } else {
    props.profile.templateUrl = val;
  }
}

function cancelCustomTemplate() {
  props.profile.templateUrl = '';
}
</script>
