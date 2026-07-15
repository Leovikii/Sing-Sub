<template>
  <div class="asset-manager space-y-6">
    <!-- Assets List -->
    <div v-if="!loading" class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] gap-6">
      <FileCard
        v-for="file in files"
        :key="file.path"
        :title="getBasename(file.path).replace(/\.json$/, '')"
        :note="file.note"
        :icon="type === 'node' ? Network : (type === 'template' ? LayoutTemplate : type === 'adapter' ? Puzzle : Shield)"
        :tag="type === 'node' ? 'NODE' : (type === 'template' ? 'TEMPLATE' : type === 'adapter' ? 'ADAPTER' : 'RULESET')"
        :tagStyle="type === 'node' ? 'bg-brand-pink/10 text-brand-pink border border-brand-pink/20' : (type === 'template' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : type === 'adapter' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')"
        :menuItems="fileMenuItems"
        @click="editFile(file, 'preview')"
        @edit="editFile(file)"
        @action="(act) => handleFileAction(act, file)"
      >
        <template #actions>
          <Tag
            v-if="type === 'ruleset'"
            :value="rulesetStatusLabel(file)"
            :severity="rulesetStatusSeverity(file)"
          />
          <Button
            v-if="type === 'ruleset' && rulesetBuild(file)?.status === 'failed'"
            severity="danger"
            text
            rounded
            :loading="retryingRuleset === rulesetId(file)"
            :aria-label="t('rulesets.retryBuild')"
            v-tooltip.top="t('rulesets.retryBuild')"
            @click.stop="retryRuleset(file)"
          >
            <RotateCcw :size="18" aria-hidden="true" />
          </Button>
          <Button
            v-if="type === 'ruleset'"
            severity="secondary"
            text
            size="small"
            @click.stop="copyRulesetLink(file, 'json')"
            :aria-label="copiedRulesetPath === `${file.path}:json` ? t('common.copied') : t('assets.copyJson')"
            v-tooltip.top="copiedRulesetPath === `${file.path}:json` ? t('common.copied') : t('assets.copyJson')"
          >
            <Check v-if="copiedRulesetPath === `${file.path}:json`" :size="17" aria-hidden="true" />
            <Link2 v-else :size="18" aria-hidden="true" />
            <span class="hidden sm:inline">JSON</span>
          </Button>
          <Button
            v-if="type === 'ruleset' && rulesetBuild(file)?.formats.binary"
            severity="secondary"
            text
            size="small"
            @click.stop="copyRulesetLink(file, 'srs')"
            :aria-label="copiedRulesetPath === `${file.path}:srs` ? t('common.copied') : t('assets.copySrs')"
            v-tooltip.top="copiedRulesetPath === `${file.path}:srs` ? t('common.copied') : t('assets.copySrs')"
          >
            <Check v-if="copiedRulesetPath === `${file.path}:srs`" :size="17" aria-hidden="true" />
            <Link2 v-else :size="18" aria-hidden="true" />
            <span class="hidden sm:inline">SRS</span>
          </Button>
        </template>
      </FileCard>
    </div>



    <div v-if="loading" class="flex justify-center py-20">
      <Loader2 class="h-7 w-7 animate-spin text-brand-pink" />
    </div>

    <div v-else-if="files.length === 0" class="text-center py-20 text-text-muted">
      {{ emptyMessage }}
    </div>

    <!-- Editor Modal -->
    <EditorModal
      :isOpen="!!editingFile"
      @update:isOpen="(val) => { if (!val) closeEditor(); }"
      :title="localFileName"
      @update:title="localFileName = $event"
      :titlePlaceholder="t('assets.fileName')"
      :note="localFileNote"
      @update:note="localFileNote = $event"
      :viewMode="viewMode"
      @update:viewMode="viewMode = $event"
      :editableTitle="true"
      :editableNote="true"
      extension=".json"
      :isDirty="isEditorDirty || isNameDirty || isNoteDirty"
      :isSaving="isSaving || globalBusy"
      :showSave="true"
      :saveDisabled="!isSaveReady"
      :saveText="t('common.save')"
      :showViewToggle="true"
      @save="saveFileCode"
      @close="closeEditor"
    >
      <CodePreview
        v-if="viewMode === 'preview'"
        :content="editorContent"
        :loading="isLoading"
        :loadingText="t('assets.reading')"
        class="min-h-[60vh]"
      />
      <component
        v-else
        ref="editorComponentRef"
        :is="type === 'ruleset' ? RuleSetEditor : CodeEditor"
        v-model="editorContent"
        @validity-change="ruleSetContentValid = $event"
        @dirty-input="isEditorDirty = true"
        class="min-h-[60vh]"
      />
    </EditorModal>


  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { Trash2, Network, LayoutTemplate, Puzzle, Shield, Link2, Check, Loader2, RotateCcw } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import EditorModal from './ui/EditorModal.vue';
import CodePreview from './ui/CodePreview.vue';
import { useApi, ApiError } from '../composables/useApi';
import { useRulesetsStore } from '../stores/rulesets';

const CodeEditor = defineAsyncComponent(() => import('./ui/CodeEditor.vue'));
const RuleSetEditor = defineAsyncComponent(() => import('./ui/RuleSetEditor.vue'));
const { t } = useI18n();
const { getFile, putFile } = useApi();
const rulesetsStore = useRulesetsStore();
const { builds: rulesetBuilds, retryingId: retryingRuleset } = storeToRefs(rulesetsStore);

const props = defineProps<{
  files: any[];
  loading?: boolean;
  type: 'node' | 'template' | 'adapter' | 'ruleset';
  globalBusy?: boolean;
  revision: string | null;
}>();

const emit = defineEmits<{
  'refresh': [force?: boolean];
  'status': [type: 'success' | 'warning' | 'error', message: string, duration?: number];
  'delete': [file: any];
  'saved': [file: { path: string; oldPath?: string; note: string; type: 'node' | 'template' | 'adapter' | 'ruleset'; revision: string }];
  'conflict': [resolve: (action: 'reload' | 'overwrite' | 'cancel') => void];
}>();

const editingFile = ref<any>(null);
const viewMode = ref<'preview' | 'edit'>('edit');
const editorContent = ref('');
const originalContent = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const fileSha = ref<string | null>(null);

const isEditorDirty = ref(false);
const localFileName = ref('');
const localFileNote = ref('');
const originalFileNote = ref('');
const ruleSetContentValid = ref(true);
const copiedRulesetPath = ref('');
const editorComponentRef = ref<{ flushPendingChange?: () => void } | null>(null);



const isNameDirty = computed(() => {
  if (!editingFile.value) return false;
  if (editingFile.value.isNew) return localFileName.value !== '';
  return localFileName.value !== getBasename(editingFile.value.path).replace(/\.json$/, '');
});

const isNoteDirty = computed(() => {
  if (!editingFile.value) return false;
  return localFileNote.value !== originalFileNote.value;
});

const isValidJson = computed(() => {
  try {
    JSON.parse(editorContent.value);
    return props.type !== 'ruleset' || ruleSetContentValid.value;
  } catch {
    return false;
  }
});

const hasValidFileName = computed(() => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(localFileName.value));
const isSaveReady = computed(() => isValidJson.value && hasValidFileName.value);



const fileMenuItems = computed(() => [
  { label: t('assets.removeFile'), action: 'remove', icon: Trash2, danger: true },
]);
const emptyMessage = computed(() => t(typeEmptyKey[props.type]));
const typeEmptyKey = {
  node: 'assets.nodesEmpty',
  template: 'assets.templatesEmpty',
  adapter: 'assets.adaptersEmpty',
  ruleset: 'assets.rulesetsEmpty',
} as const;

function rulesetId(file: { path: string }) {
  return getBasename(file.path).replace(/\.json$/, '');
}

function rulesetBuild(file: { path: string }) {
  return rulesetBuilds.value[rulesetId(file)];
}

function rulesetStatusLabel(file: { path: string }) {
  const status = rulesetBuild(file)?.status || 'none';
  return status === 'none' ? t('rulesets.jsonOnly') : t(`rulesets.${status}`);
}

function rulesetStatusSeverity(file: { path: string }) {
  const status = rulesetBuild(file)?.status;
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'pending' || status === 'dispatching' || status === 'compiling') return 'warn';
  return 'secondary';
}

async function loadRulesetBuild(file: { path: string }) {
  const id = rulesetId(file);
  try {
    await rulesetsStore.load(id);
  } catch {
    // JSON distribution remains available when build status cannot be read.
  }
}

async function retryRuleset(file: { path: string }) {
  const id = rulesetId(file);
  try {
    await rulesetsStore.retry(id);
  } catch (error: any) {
    emit('status', 'error', `${t('rulesets.retryBuild')}: ${error.message}`);
  }
}

watch(() => [props.type, ...props.files.map(file => file.path)], () => {
  if (props.type === 'ruleset') void rulesetsStore.loadMany(props.files.map(rulesetId));
}, { immediate: true });

function handleFileAction(action: string, file: any) {
  if (action === 'remove') {
    emit('delete', file);
  }
}

function getBasename(path: string) {
  return path.split('/').pop() || path;
}

watch(editorContent, (newVal) => {
  isEditorDirty.value = newVal !== originalContent.value;
});

watch(viewMode, (mode, previousMode) => {
  if (props.type === 'ruleset' && previousMode === 'edit' && mode === 'preview') {
    editorComponentRef.value?.flushPendingChange?.();
  }
});

let editFileSeq = 0;

async function editFile(file: any, mode: 'preview' | 'edit' = 'edit') {
  const seq = ++editFileSeq;
  editingFile.value = file;
  viewMode.value = mode;
  localFileName.value = getBasename(file.path).replace(/\.json$/, '');
  isLoading.value = true;
  editorContent.value = '';
  originalContent.value = '';
  isEditorDirty.value = false;

  try {
    let data;
    try {
      data = await getFile(file.path);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === 'ASSET_NOT_FOUND') {
        closeEditor();
        emit('status', 'warning', t('assets.reloadNotice'), 5000);
        emit('refresh', true);
        return;
      }
      throw error;
    }
    if (seq !== editFileSeq) return; // A newer editFile() call superseded this one

    originalContent.value = data.content;
    editorContent.value = data.content;
    fileSha.value = data.sha;

    // Parse note if possible
    try {
      const parsed = JSON.parse(data.content);
      originalFileNote.value = props.type === 'ruleset'
        ? (parsed._sing_sub?.note || '')
        : (parsed.note || '');
      localFileNote.value = originalFileNote.value;
    } catch {
      originalFileNote.value = '';
      localFileNote.value = '';
    }

  } catch (e: any) {
    if (seq !== editFileSeq) return;
    emit('status', 'error', `${t('assets.loadFailed')}: ${e.message}`);
  } finally {
    if (seq === editFileSeq) isLoading.value = false;
  }
}

function closeEditor() {
  isEditorDirty.value = false;
  ruleSetContentValid.value = true;
  editingFile.value = null;
}

function resolveConflict(): Promise<'reload' | 'overwrite' | 'cancel'> {
  return new Promise(resolve => { emit('conflict', resolve); });
}

async function saveFileCode() {
  if (props.type === 'ruleset') editorComponentRef.value?.flushPendingChange?.();
  if (!isValidJson.value) {
    emit('status', 'error', t('assets.invalidJson'));
    return;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(localFileName.value)) {
    emit('status', 'error', t('assets.invalidName'));
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(editorContent.value);
  } catch (e: any) {
    emit('status', 'error', `${t('assets.invalidJson')} ${e.message}`);
    return;
  }

  // Rule-set metadata is stripped before compilation. Other asset formats keep
  // their established root-level note field.
  if (props.type === 'ruleset') {
    const metadata = parsed._sing_sub && typeof parsed._sing_sub === 'object' && !Array.isArray(parsed._sing_sub)
      ? parsed._sing_sub
      : {};
    if (localFileNote.value) {
      metadata.note = localFileNote.value;
      parsed._sing_sub = metadata;
    } else {
      delete metadata.note;
      if (Object.keys(metadata).length === 0) delete parsed._sing_sub;
      else parsed._sing_sub = metadata;
    }
  } else {
    if (props.type === 'adapter') parsed.name = localFileName.value;
    if (localFileNote.value) {
    parsed.note = localFileNote.value;
    } else {
      delete parsed.note;
    }
  }
  editorContent.value = JSON.stringify(parsed, null, 2);

  isSaving.value = true;

  try {
    const dir = props.type === 'node' ? 'nodes' : (props.type === 'template' ? 'templates' : props.type === 'adapter' ? 'adapters' : 'rulesets');
    const newPath = `sing-sub/${dir}/${localFileName.value}.json`;
    const isRename = newPath !== editingFile.value.path && !editingFile.value.isNew;

    let data;
    const expectedRevision = fileSha.value || props.revision;
    if (!expectedRevision) throw new Error(t('workspace.revisionMissing'));
    try {
      data = await putFile({
        path: newPath,
        content: editorContent.value,
        expectedRevision,
        sha: isRename ? null : fileSha.value,
        oldPath: isRename ? editingFile.value.path : undefined,
        message: `${editingFile.value.isNew ? 'Create' : (isRename ? 'Rename' : 'Update')} ${localFileName.value}.json`
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const action = await resolveConflict();
        isSaving.value = false;
        if (action === 'reload') {
          await editFile(editingFile.value);
          emit('status', 'warning', t('workspace.reloadNotice'), 5000);
        } else if (action === 'overwrite') {
          const latest = await getFile(editingFile.value.path);
          fileSha.value = latest.sha;
          return saveFileCode();
        }
        return;
      }
      throw error;
    }

    isEditorDirty.value = false;
    originalContent.value = editorContent.value;
    originalFileNote.value = localFileNote.value;
    emit('saved', {
      path: newPath,
      oldPath: isRename ? editingFile.value.path : undefined,
      note: localFileNote.value,
      type: props.type,
      revision: data.revision,
    });
    if (data.warning) {
      emit('status', 'warning', data.warning, 5000);
    } else if (props.type === 'ruleset') {
      emit('status', 'success', t('assets.saved'), 5000);
      void loadRulesetBuild({ path: newPath });
    } else {
      emit('status', 'success', t('assets.saved'));
    }
    editingFile.value = null;
  } catch (e: any) {
    emit('status', 'error', `${t('assets.saveFailed')}: ${e.message}`);
  } finally {
    isSaving.value = false;
  }
}

function createFile() {
  const dir = props.type === 'node' ? 'nodes' : (props.type === 'template' ? 'templates' : props.type === 'adapter' ? 'adapters' : 'rulesets');
  viewMode.value = 'edit';
  editingFile.value = {
    path: `sing-sub/${dir}/untitled.json`,
    isNew: true
  };
  localFileName.value = '';
  localFileNote.value = '';
  originalFileNote.value = '';
  editorContent.value = props.type === 'ruleset'
    ? '{\n  "version": 2,\n  "rules": [],\n  "_sing_sub": {\n    "sources": []\n  }\n}'
    : props.type === 'adapter'
      ? '{\n  "schemaVersion": 1,\n  "name": "untitled",\n  "replacements": [\n    {\n      "path": ["inbounds"],\n      "value": []\n    }\n  ]\n}'
      : '{\n  "inbounds": [],\n  "outbounds": []\n}';
  originalContent.value = editorContent.value;
  fileSha.value = null;
  isEditorDirty.value = false;
  isLoading.value = false;
  ruleSetContentValid.value = true;
}

async function copyRulesetLink(file: any, format: 'json' | 'srs') {
  const name = getBasename(file.path).replace(/\.json$/, '');
  const url = `${window.location.origin}/rules/${encodeURIComponent(name)}.${format}`;
  const copyKey = `${file.path}:${format}`;
  try {
    await navigator.clipboard.writeText(url);
    copiedRulesetPath.value = copyKey;
    window.setTimeout(() => { if (copiedRulesetPath.value === copyKey) copiedRulesetPath.value = ''; }, 2000);
  } catch {
    emit('status', 'error', t('assets.copyFailed'));
  }
}

defineExpose({ createFile });
</script>
