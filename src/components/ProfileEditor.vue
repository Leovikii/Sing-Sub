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
      <Button
        @click.stop="$emit('copyLink', profile.name || '', index)"
        outlined
        class="!min-h-11 md:!min-h-9"
        :aria-label="copyStatus ? t('profiles.copiedSubscription') : t('profiles.subscription')"
      >
        <Check v-if="copyStatus" :size="18" aria-hidden="true" />
        <Link2 v-else :size="18" aria-hidden="true" />
        <span>{{ copyStatus ? t('profiles.copiedSubscription') : t('profiles.subscription') }}</span>
      </Button>
    </template>
  </FileCard>

  <EditorModal
    :isOpen="isOpen"
    @update:isOpen="isOpen = $event"
    :title="localProfileName"
    @update:title="localProfileName = $event"
    :titlePlaceholder="t('profiles.name')"
    :note="localProfileNote"
    @update:note="localProfileNote = $event"
    :editableTitle="true"
    :editableNote="true"
    :isDirty="isDirty"
    :isSaving="isSaving || globalBusy"
    :showSave="true"
    :saveDisabled="!isValidProfileName"
    :saveText="t('common.save')"
    :showViewToggle="true"
    v-model:viewMode="viewMode"
    @save="handleLocalSave"
    @close="handleClose"
  >
    <template #default>
      <!-- Visual Editor -->
      <div v-if="viewMode === 'edit'" class="flex-1 overflow-auto flex flex-col min-h-0">
        <div class="p-5 sm:p-6 space-y-6 flex-1 min-h-0">
          <ProfileTemplateConfig v-model:profile="localProfile" :availableNodes="availableNodes" :availableTemplates="availableTemplates" :availablePatches="availablePatches" />
          <ProfileInbounds v-model:profile="localProfile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
          <ProfileOutbounds v-model:profile="localProfile" :templateData="fetchedTemplateData" :nodesData="fetchedNodesData" />
        </div>
      </div>

      <!-- Preview Mode: Raw JSON from KV -->
      <div v-if="viewMode === 'preview'" class="flex-1 flex flex-col min-h-0 bg-bg-code-toolbar">
        <CodePreview
          :content="previewContent"
          :loading="previewLoading"
          :loadingText="t('assets.reading')"
          class="flex-1 min-h-0"
        />
      </div>
    </template>
  </EditorModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { Trash2, Copy, Link2, Check } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import EditorModal from './ui/EditorModal.vue';
import CodePreview from './ui/CodePreview.vue';
import type { Profile } from '../types';
import { useApi } from '../composables/useApi';

const ProfileTemplateConfig = defineAsyncComponent(() => import('./profile/ProfileTemplateConfig.vue'));
const ProfileInbounds = defineAsyncComponent(() => import('./profile/ProfileInbounds.vue'));
const ProfileOutbounds = defineAsyncComponent(() => import('./profile/ProfileOutbounds.vue'));
const { t } = useI18n();

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
  copyLink: [name: string, index: number];
  remove: [index: number];
  duplicate: [profile: Profile];
  discard: [profile: Profile];
  save: [profile: Profile, index: number, oldName?: string];
  'update:expanded': [value: boolean];
  status: [type: 'success' | 'warning' | 'error', message: string, duration?: number];
}>();

const isOpen = computed({
  get: () => props.expanded ?? false,
  set: (v) => emit('update:expanded', v),
});


const cardMenuItems = computed(() => [
  { label: t('profiles.duplicate'), action: 'duplicate', icon: Copy },
  { label: t('profiles.remove'), action: 'remove', icon: Trash2, danger: true },
]);

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
let originalProfileName = '';
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
    previewContent.value = `// ${t('profiles.previewFailed')}\n// ${e.message || t('common.unknownError')}`;
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
    emit('status', 'error', `${t('profiles.templateFailed')}: ${e.message}`);
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
    emit('status', 'error', `${t('profiles.nodesFailed')}: ${e.message}`);
    fetchedNodesData.value = null;
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    initialProfileState = JSON.stringify(props.profile);
    originalProfileName = props.profile.name || '';
    localProfile.value = JSON.parse(initialProfileState);
    localProfileName.value = props.profile.name || '';
    localProfileNote.value = props.profile.note || '';
    if (viewMode.value === 'preview') {
      void fetchPreview();
    } else {
      void fetchTemplateData(localProfile.value.templateUrl || '');
      void fetchNodesData(localProfile.value.nodesPath || '');
    }
  } else {
    document.body.style.overflow = '';
  }
}, { immediate: true });

watch(() => localProfile.value.templateUrl, (url) => {
  if (isOpen.value && viewMode.value === 'edit') void fetchTemplateData(url || '');
});
watch(() => localProfile.value.nodesPath, (path) => {
  if (isOpen.value && viewMode.value === 'edit') void fetchNodesData(path || '');
});

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
  if (!isOpen.value) return;
  if (mode === 'preview') void fetchPreview();
  else {
    void fetchTemplateData(localProfile.value.templateUrl || '');
    void fetchNodesData(localProfile.value.nodesPath || '');
  }
});

function handleLocalSave() {
  if (!isValidProfileName.value) {
    emit('status', 'error', t('profiles.invalidName'));
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
  
  emit('save', JSON.parse(JSON.stringify(localProfile.value)), props.index, originalProfileName || undefined);
}
</script>
