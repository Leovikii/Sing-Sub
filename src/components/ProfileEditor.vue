<template>
  <FileCard
    :title="profile.name"
    :note="profile.note"
    :inboundCount="inboundCount"
    :outboundCount="outboundCount"
    :menuItems="cardMenuItems"
    @click="$emit('preview', profile.name || '')"
    @edit="openModal"
    @action="handleCardAction"
  >
    <template #actions>
      <button
        @click.stop="$emit('copyLink', profile.name || '', index)"
        :class="['flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border', copyStatus ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border-[#38383a] hover:border-[#F596AA]']"
        :title="copyStatus ? '已复制' : '订阅'"
      >
        <component :is="copyStatus ? Check : Link2" :size="14" />
        <span class="hidden md:inline">{{ copyStatus ? '已复制' : '订阅' }}</span>
      </button>
    </template>
  </FileCard>

  <EditorModal
    :isOpen="isOpen"
    @update:isOpen="isOpen = $event"
    :title="localProfileName"
    @update:title="localProfileName = $event"
    :note="localProfileNote"
    @update:note="localProfileNote = $event"
    :editableTitle="true"
    :editableNote="true"
    extension=".json"
    :isDirty="isDirty"
    :isSaving="false"
    :showSave="isDirty"
    saveText="保存"
    :showViewToggle="true"
    v-model:viewMode="viewMode"
    @save="handleLocalSave"
    @reset="handleLocalReset"
    @close="isOpen = false"
  >
    <template #default>
      <!-- Visual Editor -->
      <div v-show="viewMode === 'ui'" class="flex-1 overflow-auto flex flex-col min-h-0">
        <div class="p-5 sm:p-6 space-y-6 flex-1 min-h-0">
          <ProfileTemplateConfig :profile="localProfile" :availableNodes="availableNodes" :availableTemplates="availableTemplates" />
          <ProfileInbounds :profile="localProfile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
          <ProfileOutbounds :profile="localProfile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
        </div>
      </div>

      <!-- Raw JSON Editor -->
      <div v-if="viewMode === 'code'" class="absolute inset-0 bg-[#0a0a0a] z-10">
        <CodeEditor
          :key="initialCodeState || 'no-base'"
          v-model="editorContent"
          :baseContent="initialCodeState"
          class="absolute inset-0"
        />
      </div>
    </template>
  </EditorModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { Trash2, Copy, Link2, Check } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import EditorModal from './ui/EditorModal.vue';
import CodeEditor from './ui/CodeEditor.vue';
import ProfileTemplateConfig from './profile/ProfileTemplateConfig.vue';
import ProfileInbounds from './profile/ProfileInbounds.vue';
import ProfileOutbounds from './profile/ProfileOutbounds.vue';
import type { Profile } from '../types';
import { useApi } from '../composables/useApi';
import { deepDiff, deepMerge } from '../utils/object';

const props = defineProps<{
  profile: Profile;
  index: number;
  availableNodes?: string[];
  availableTemplates?: string[];
  copyStatus: boolean;
  expanded?: boolean;
}>();

const emit = defineEmits<{
  preview: [name: string];
  copyLink: [name: string, index: number];
  remove: [index: number];
  duplicate: [profile: Profile];
  save: [name: string];
  'update:expanded': [value: boolean];
}>();

const isOpen = computed({
  get: () => props.expanded ?? false,
  set: (v) => emit('update:expanded', v),
});

const inboundCount = computed(() => props.profile.inboundRules?.length || 0);
const outboundCount = computed(() => props.profile.rules?.length || 0);

const cardMenuItems = [
  { label: '复制配置', action: 'duplicate', icon: Copy },
  { label: '删除配置', action: 'remove', icon: Trash2, danger: true },
];

function handleCardAction(action: string) {
  if (action === 'duplicate') emit('duplicate', props.profile);
  if (action === 'remove') emit('remove', props.index);
}

const { getFile } = useApi();
const fetchedTemplateData = ref<any>(null);
const fetchedNodesData = ref<any>(null);

const viewMode = ref<'ui' | 'code'>('ui');

const localProfile = ref<Profile>(JSON.parse(JSON.stringify(props.profile)));
let initialProfileState = '';
const localProfileName = ref('');
const localProfileNote = ref('');

const isDirty = computed(() => {
  const current = {
    ...localProfile.value,
    name: localProfileName.value,
    note: localProfileNote.value
  };
  return JSON.stringify(current) !== initialProfileState;
});

const editorContent = ref('');
const initialCodeState = ref('');

function openModal() {
  isOpen.value = true;
}

function populateCodeEditor() {
  const base = fetchedTemplateData.value || {};
  const current = deepMerge(base, localProfile.value.overrides || {});
  const formatted = JSON.stringify(current, null, 2);
  editorContent.value = formatted;
  initialCodeState.value = formatted;
}

watch(isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    initialProfileState = JSON.stringify(props.profile);
    localProfile.value = JSON.parse(initialProfileState);
    localProfileName.value = props.profile.name || 'untitled';
    localProfileNote.value = props.profile.note || '';
    if (viewMode.value === 'code') populateCodeEditor();
  } else {
    document.body.style.overflow = '';
  }
}, { immediate: true });

onUnmounted(() => {
  if (isOpen.value) {
    document.body.style.overflow = '';
  }
});

watch(viewMode, (mode) => {
  if (mode === 'code') {
    populateCodeEditor();
  }
});

watch(fetchedTemplateData, () => {
  if (isOpen.value && viewMode.value === 'code') {
    populateCodeEditor();
  }
});

// Watch is no longer needed since we compute isDirty reactively based on localProfile

watch(editorContent, (newVal) => {
  if (viewMode.value === 'code') {
    try {
      const parsed = JSON.parse(newVal);
      const base = fetchedTemplateData.value || {};
      const diff = deepDiff(base, parsed);
      
      if (diff === undefined) {
        delete localProfile.value.overrides;
      } else {
        localProfile.value.overrides = diff;
      }
    } catch {}
  }
});

async function fetchTemplateData(url: string) {
  if (!url) {
    fetchedTemplateData.value = null;
    return;
  }
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url);
      fetchedTemplateData.value = await res.json();
    } else {
      const res = await getFile(url);
      fetchedTemplateData.value = JSON.parse(res.content);
    }
  } catch (e) {
    console.error('Failed to fetch template', e);
    fetchedTemplateData.value = null;
  }
}

async function fetchNodesData(path: string) {
  if (!path) {
    fetchedNodesData.value = null;
    return;
  }
  try {
    const res = await getFile(path);
    fetchedNodesData.value = JSON.parse(res.content);
  } catch (e) {
    console.error('Failed to fetch nodes', e);
    fetchedNodesData.value = null;
  }
}

watch(() => localProfile.value.templateUrl, (url) => { if(isOpen.value) fetchTemplateData(url || '') }, { immediate: true });
watch(() => localProfile.value.nodesPath, (path) => { if(isOpen.value) fetchNodesData(path || '') }, { immediate: true });

watch(isOpen, (open) => {
  if (open) {
    fetchTemplateData(localProfile.value.templateUrl || '');
    fetchNodesData(localProfile.value.nodesPath || '');
  }
});

function handleLocalSave() {
  if (viewMode.value === 'code') {
    try {
      JSON.parse(editorContent.value);
    } catch (e) {
      alert("JSON 格式错误，请检查！");
      return;
    }
  }
  
  // Apply name and note change
  localProfile.value.name = localProfileName.value;
  localProfile.value.note = localProfileNote.value;
  
  // Mutate parent profile
  for (const key in props.profile) {
    if (Object.prototype.hasOwnProperty.call(props.profile, key)) {
      delete (props.profile as any)[key];
    }
  }
  Object.assign(props.profile, localProfile.value);
  
  initialProfileState = JSON.stringify(props.profile);
  if (viewMode.value === 'code') {
    populateCodeEditor();
  } else {
    editorContent.value = JSON.stringify(props.profile, null, 2);
  }
  
  emit('save', props.profile.name || '');
}

function handleLocalReset() {
  if (!initialProfileState) return;
  localProfile.value = JSON.parse(initialProfileState);
  
  localProfileName.value = localProfile.value.name || 'untitled';
  localProfileNote.value = localProfile.value.note || '';
  
  if (viewMode.value === 'code') {
    populateCodeEditor();
  }
}
</script>
