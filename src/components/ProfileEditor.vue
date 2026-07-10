<template>
  <div>
    <FileCard
    :title="profile.name"
    :note="profile.note"
    :inboundCount="inboundCount"
    :outboundCount="outboundCount"
    :updatedAt="profile.updated_at"
    :menuItems="cardMenuItems"
    @click="openModal('preview')"
    @edit="openModal('edit')"
    @action="handleCardAction"
  >
    <template #actions>
      <button
        @click.stop="$emit('copyLink', profile.name || '', index)"
        :class="['flex-1 md:flex-none flex items-center justify-center gap-1.5 h-10 md:w-auto md:h-auto md:px-3 md:py-2 rounded-xl md:rounded-full text-[13px] md:text-xs font-medium transition-colors cursor-pointer border', copyStatus ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border-[#38383a] hover:border-[#F596AA]']"
        :title="copyStatus ? '已复制' : '订阅'"
      >
        <component :is="copyStatus ? Check : Link2" :size="14" />
        <span class="ml-1">{{ copyStatus ? '已复制' : '订阅' }}</span>
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
    :showSave="true"
    saveText="保存"
    :showViewToggle="true"
    v-model:viewMode="viewMode"
    @save="handleLocalSave"
    @reset="handleLocalReset"
    @close="isOpen = false"
  >
    <template #default>
      <!-- Visual Editor -->
      <div v-show="viewMode === 'edit'" class="flex-1 overflow-auto flex flex-col min-h-0">
        <div class="p-5 sm:p-6 space-y-6 flex-1 min-h-0">
          <ProfileTemplateConfig :profile="localProfile" :availableNodes="availableNodes" :availableTemplates="availableTemplates" :availablePatches="availablePatches" />
          <ProfileInbounds :profile="localProfile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
          <ProfileOutbounds :profile="localProfile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
        </div>
      </div>

      <!-- Preview Mode: Raw JSON from KV -->
      <div v-if="viewMode === 'preview'" class="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
        <CodeEditor
          :modelValue="previewContent"
          readonly
          :loading="previewLoading"
          loadingText="读取中..."
          class="flex-1 min-h-0"
        />
      </div>
    </template>
  </EditorModal>
  </div>
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


const props = defineProps<{
  profile: Profile;
  index: number;
  availableNodes?: string[];
  availableTemplates?: string[];
  availablePatches?: string[];
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
  status: [type: 'success' | 'warning' | 'error', message: string, duration?: number];
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

const { getFile, postPreview } = useApi();
const fetchedTemplateData = ref<any>(null);
const fetchedNodesData = ref<any>(null);

const viewMode = ref<'preview' | 'edit'>('edit');

const previewContent = ref('');
const previewLoading = ref(false);

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

function openModal(mode?: 'preview' | 'edit') {
  viewMode.value = mode || 'edit';
  isOpen.value = true;
}

async function fetchPreview() {
  previewLoading.value = true;
  previewContent.value = '';
  try {
    const data = await postPreview(localProfile.value);
    previewContent.value = data.content;
  } catch (e: any) {
    previewContent.value = `// 获取预览失败\n// ${e.message || '未知错误'}`;
  } finally {
    previewLoading.value = false;
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    initialProfileState = JSON.stringify(props.profile);
    localProfile.value = JSON.parse(initialProfileState);
    localProfileName.value = props.profile.name || 'untitled';
    localProfileNote.value = props.profile.note || '';
    if (viewMode.value === 'preview') {
      fetchPreview();
    }
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
  if (mode === 'preview') {
    fetchPreview();
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
  } catch (e: any) {
    console.error('Failed to fetch template', e);
    emit('status', 'error', '获取模板失败: ' + e.message);
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
  } catch (e: any) {
    console.error('Failed to fetch nodes', e);
    emit('status', 'error', '获取节点文件失败: ' + e.message);
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
  // Apply name and note change
  localProfile.value.name = localProfileName.value;
  localProfile.value.note = localProfileNote.value;
  
  // Prune stale rules that no longer exist in the template
  if (fetchedTemplateData.value && Array.isArray(fetchedTemplateData.value.outbounds)) {
    const validTags = fetchedTemplateData.value.outbounds
      .filter((o: any) => o.type === 'selector' && o.tag)
      .map((o: any) => o.tag);
    if (localProfile.value.rules) {
      localProfile.value.rules = localProfile.value.rules.filter(r => validTags.includes(r.group));
    }
  }
  
  // Mutate parent profile
  for (const key in props.profile) {
    if (Object.prototype.hasOwnProperty.call(props.profile, key)) {
      delete (props.profile as any)[key];
    }
  }
  Object.assign(props.profile, localProfile.value);
  
  initialProfileState = JSON.stringify(props.profile);
  
  emit('save', props.profile.name || '');
  isOpen.value = false;
}

function handleLocalReset() {
  if (!initialProfileState) return;
  localProfile.value = JSON.parse(initialProfileState);
  
  localProfileName.value = localProfile.value.name || 'untitled';
  localProfileNote.value = localProfile.value.note || '';
}
</script>
