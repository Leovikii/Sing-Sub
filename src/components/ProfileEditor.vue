<template>
  <div>
    <FileCard
    :title="profile.name"
    :note="profile.note"
    :updatedAt="profile.updated_at"
    :menuItems="cardMenuItems"
    @click="openModal('preview')"
    @edit="openModal('edit')"
    @action="handleCardAction"
  >
    <template #actions>
      <ToolbarButton
        @click.stop="$emit('copyLink', profile.name || '', index)"
        :icon="copyStatus ? Check : Link2"
        :label="copyStatus ? '已复制订阅链接' : '订阅'"
        variant="emphasis"
        size="card"
        mobileLabel
      />
    </template>
  </FileCard>

  <EditorModal
    :isOpen="isOpen"
    @update:isOpen="isOpen = $event"
    :title="localProfileName"
    @update:title="localProfileName = $event"
    titlePlaceholder="输入配置名称"
    :note="localProfileNote"
    @update:note="localProfileNote = $event"
    :editableTitle="true"
    :editableNote="true"
    extension=".json"
    :isDirty="isDirty"
    :isSaving="isSaving || globalBusy"
    :showSave="true"
    :saveDisabled="!isValidProfileName"
    saveText="保存"
    :showViewToggle="true"
    v-model:viewMode="viewMode"
    @save="handleLocalSave"
    @close="handleClose"
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
import { ref, computed, watch, onUnmounted, defineAsyncComponent } from 'vue';
import { Trash2, Copy, Link2, Check } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import ToolbarButton from './ui/ToolbarButton.vue';
import EditorModal from './ui/EditorModal.vue';
import ProfileTemplateConfig from './profile/ProfileTemplateConfig.vue';
import ProfileInbounds from './profile/ProfileInbounds.vue';
import ProfileOutbounds from './profile/ProfileOutbounds.vue';
import type { Profile } from '../types';
import { useApi } from '../composables/useApi';

const CodeEditor = defineAsyncComponent(() => import('./ui/CodeEditor.vue'));


const props = defineProps<{
  profile: Profile;
  index: number;
  availableNodes?: string[];
  availableTemplates?: string[];
  availablePatches?: string[];
  copyStatus: boolean;
  expanded?: boolean;
  isDraft?: boolean;
  globalBusy?: boolean;
  isSaving?: boolean;
  saveFailed?: boolean;
}>();

const emit = defineEmits<{
  preview: [name: string];
  copyLink: [name: string, index: number];
  remove: [index: number];
  duplicate: [profile: Profile];
  discard: [profile: Profile];
  save: [name: string];
  'update:expanded': [value: boolean];
  status: [type: 'success' | 'warning' | 'error', message: string, duration?: number];
}>();

const isOpen = computed({
  get: () => props.expanded ?? false,
  set: (v) => emit('update:expanded', v),
});


const cardMenuItems = [
  { label: '复制配置', action: 'duplicate', icon: Copy },
  { label: '删除配置', action: 'remove', icon: Trash2, danger: true },
];

function handleCardAction(action: string) {
  if (action === 'duplicate') emit('duplicate', props.profile);
  if (action === 'remove') emit('remove', props.index);
}

function handleClose() {
  if (props.isDraft) emit('discard', props.profile);
  isOpen.value = false;
}

const { getFile, getTemplate, postPreview } = useApi();
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

const isValidProfileName = computed(() => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(localProfileName.value));

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

let fetchTemplateSeq = 0;
let fetchNodesSeq = 0;

async function fetchTemplateData(url: string) {
  const seq = ++fetchTemplateSeq;
  if (!url) {
    fetchedTemplateData.value = null;
    return;
  }
  try {
    const res = await getTemplate(url);
    if (seq !== fetchTemplateSeq) return;
    fetchedTemplateData.value = res.content;
  } catch (e: any) {
    if (seq !== fetchTemplateSeq) return;
    console.error('Failed to fetch template', e);
    emit('status', 'error', '获取模板失败: ' + e.message);
    fetchedTemplateData.value = null;
  }
}

async function fetchNodesData(path: string) {
  const seq = ++fetchNodesSeq;
  if (!path) {
    fetchedNodesData.value = null;
    return;
  }
  try {
    const res = await getFile(path);
    if (seq !== fetchNodesSeq) return;
    fetchedNodesData.value = JSON.parse(res.content);
  } catch (e: any) {
    if (seq !== fetchNodesSeq) return;
    console.error('Failed to fetch nodes', e);
    emit('status', 'error', '获取节点文件失败: ' + e.message);
    fetchedNodesData.value = null;
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    initialProfileState = JSON.stringify(props.profile);
    localProfile.value = JSON.parse(initialProfileState);
    localProfileName.value = props.profile.name || '';
    localProfileNote.value = props.profile.note || '';
    fetchTemplateData(localProfile.value.templateUrl || '');
    fetchNodesData(localProfile.value.nodesPath || '');
    if (viewMode.value === 'preview') {
      fetchPreview();
    }
  } else {
    document.body.style.overflow = '';
  }
}, { immediate: true });

watch(() => localProfile.value.templateUrl, (url) => { if (isOpen.value) fetchTemplateData(url || ''); });
watch(() => localProfile.value.nodesPath, (path) => { if (isOpen.value) fetchNodesData(path || ''); });

// Watch for save completion
watch(() => props.isSaving, (saving, wasSaving) => {
  if (wasSaving && !saving) {
    if (!props.saveFailed) {
      // Save succeeded: clear dirty and close modal
      initialProfileState = JSON.stringify(props.profile);
      isOpen.value = false;
    }
    // If saveFailed, keep modal open so user can see error and retry
  }
});

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

function handleLocalSave() {
  if (!isValidProfileName.value) {
    emit('status', 'error', '请输入有效的配置名称');
    return;
  }

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
</script>
