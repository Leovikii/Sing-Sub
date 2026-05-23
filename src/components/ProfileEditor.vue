<template>
  <FileCard
    :title="profile.name"
    :note="profile.note"
    :inboundCount="inboundCount"
    :outboundCount="outboundCount"
    :menuItems="cardMenuItems"
    @click="openModal"
    @edit="openModal"
    @action="handleCardAction"
  >
    <template #actions>
      <button
        @click.stop="$emit('copyLink', profile.name || '', index)"
        :class="['hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border', copyStatus ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border-[#38383a] hover:border-[#F596AA]']"
        title="复制配置订阅链接"
      >
        <component :is="copyStatus ? Check : Link2" :size="14" />
        {{ copyStatus ? '已复制' : '订阅' }}
      </button>
    </template>
  </FileCard>

  <EditorModal
    :isOpen="isOpen"
    @update:isOpen="isOpen = $event"
    :title="profile.name || 'untitled'"
    :editableTitle="false"
    extension=".json"
    :isDirty="isLocalDirty"
    :isSaving="false"
    :showSave="isLocalDirty"
    saveText="保存"
    @save="handleLocalSave"
    @reset="handleLocalReset"
    @close="isOpen = false"
  >
    <template #header-actions>
      <!-- Mode Toggle -->
      <div class="flex items-center bg-[#2c2c2e] rounded-full p-1 border border-[#38383a]">
        <button
          @click="isCodeMode = false"
          :class="['px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer', !isCodeMode ? 'bg-[#38383a] text-[#f5f5f7] shadow-sm' : 'text-[#86868b] hover:text-[#f5f5f7]']"
        >UI</button>
        <button
          @click="isCodeMode = true"
          :class="['px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer flex items-center gap-1', isCodeMode ? 'bg-[#38383a] text-[#F596AA] shadow-sm' : 'text-[#86868b] hover:text-[#f5f5f7]']"
        ><Code :size="12" /> Live Preview</button>
      </div>

    </template>

    <template #default>
      <!-- Visual Editor -->
      <div v-show="!isCodeMode" class="flex-1 overflow-auto flex flex-col min-h-0">
        <div class="p-5 sm:p-6 space-y-6 flex-1 min-h-0">
          <ProfileBasicInfo :profile="profile" />
          <ProfileTemplateConfig :profile="profile" :availableNodes="availableNodes" :availableTemplates="availableTemplates" />
          <ProfileInbounds :profile="profile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
          <ProfileOutbounds :profile="profile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
        </div>
      </div>

      <!-- Code Preview -->
      <ProfileCodePreview
        v-show="isCodeMode"
        :profile="profile"
        :isActive="isCodeMode"
      />
    </template>
  </EditorModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { Trash2, Copy, Link2, Check, Code } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import EditorModal from './ui/EditorModal.vue';
import ProfileBasicInfo from './profile/ProfileBasicInfo.vue';
import ProfileTemplateConfig from './profile/ProfileTemplateConfig.vue';
import ProfileInbounds from './profile/ProfileInbounds.vue';
import ProfileOutbounds from './profile/ProfileOutbounds.vue';
import ProfileCodePreview from './profile/ProfileCodePreview.vue';
import type { Profile } from '../types';
import { useApi } from '../composables/useApi';

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

const isCodeMode = ref(false);
const isLocalDirty = ref(false);
let initialProfileState = '';

function openModal() {
  isOpen.value = true;
}

watch(isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    initialProfileState = JSON.stringify(props.profile);
    isLocalDirty.value = false;
  } else {
    document.body.style.overflow = '';
  }
}, { immediate: true });

onUnmounted(() => {
  if (isOpen.value) {
    document.body.style.overflow = '';
  }
});

watch(() => props.profile, () => {
  if (isOpen.value) {
    isLocalDirty.value = JSON.stringify(props.profile) !== initialProfileState;
  }
}, { deep: true });

const { getFile } = useApi();
const fetchedTemplateData = ref<any>(null);
const fetchedNodesData = ref<any>(null);

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

watch(() => props.profile.templateUrl, (url) => { if(isOpen.value) fetchTemplateData(url || '') }, { immediate: true });
watch(() => props.profile.nodesPath, (path) => { if(isOpen.value) fetchNodesData(path || '') }, { immediate: true });

watch(isOpen, (open) => {
  if (open) {
    fetchTemplateData(props.profile.templateUrl || '');
    fetchNodesData(props.profile.nodesPath || '');
  }
});

function handleLocalSave() {
  initialProfileState = JSON.stringify(props.profile);
  isLocalDirty.value = false;
  emit('save', props.profile.name || '');
}

function handleLocalReset() {
  if (!initialProfileState) return;
  const original = JSON.parse(initialProfileState);
  // Clear existing arrays before assign to avoid merging arrays instead of replacing
  for (const key in props.profile) {
    if (Object.prototype.hasOwnProperty.call(props.profile, key)) {
      delete (props.profile as any)[key];
    }
  }
  Object.assign(props.profile, original);
  isLocalDirty.value = false;
}

</script>
