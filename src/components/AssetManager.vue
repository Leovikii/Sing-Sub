<template>
  <div class="asset-manager space-y-6">
    <!-- Assets List -->
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] gap-6">
      <FileCard
        v-for="file in files"
        :key="file.path"
        :title="getBasename(file.path).replace(/\.json$/, '')"
        :inboundCount="file.inboundsCount"
        :outboundCount="file.outboundsCount"
        :note="file.note"
        :icon="type === 'node' ? Network : (type === 'template' ? LayoutTemplate : type === 'patch' ? Puzzle : Shield)"
        :tag="type === 'node' ? 'NODE' : (type === 'template' ? 'TEMPLATE' : type === 'patch' ? 'PATCH' : 'RULESET')"
        :tagStyle="type === 'node' ? 'bg-brand-pink/10 text-brand-pink border border-brand-pink/20' : (type === 'template' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : type === 'patch' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')"
        :menuItems="fileMenuItems"
        @click="editFile(file, 'preview')"
        @edit="editFile(file)"
        @action="(act) => handleFileAction(act, file)"
      >
        <template #actions>
          <ToolbarButton
            v-if="type === 'ruleset'"
            @click.stop="copyRulesetLink(file)"
            :icon="copiedRulesetPath === file.path ? Check : Link2"
            :label="copiedRulesetPath === file.path ? '已复制' : '订阅'"
            variant="emphasis"
            size="card"
            mobileLabel
          />
        </template>
      </FileCard>
    </div>



    <div v-if="files.length === 0" class="text-center py-20 text-text-muted">
      {{ type === 'node' ? '暂无节点文件，仓库初始化可能正在进行中。' : (type === 'template' ? '暂无模板文件。' : (type === 'patch' ? '暂无补丁文件。' : '暂无规则集文件。')) }}
    </div>

    <!-- Editor Modal -->
    <EditorModal
      :isOpen="!!editingFile"
      @update:isOpen="(val) => { if (!val) closeEditor(); }"
      :title="localFileName"
      @update:title="localFileName = $event"
      titlePlaceholder="输入文件名称"
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
      saveText="保存"
      :showViewToggle="true"
      @save="saveFileCode"
      @close="closeEditor"
    >
      <component
        :is="type === 'ruleset' && viewMode === 'edit' ? RuleSetEditor : CodeEditor"
        v-model="editorContent"
        :readonly="viewMode === 'preview'"
        @validity-change="ruleSetContentValid = $event"
        :loading="isLoading"
        loadingText="读取中..."
        class="min-h-[60vh]"
      />
    </EditorModal>


  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { Trash2, Network, LayoutTemplate, Puzzle, Shield, Link2, Check } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import EditorModal from './ui/EditorModal.vue';
import ToolbarButton from './ui/ToolbarButton.vue';

const CodeEditor = defineAsyncComponent(() => import('./ui/CodeEditor.vue'));
const RuleSetEditor = defineAsyncComponent(() => import('./ui/RuleSetEditor.vue'));

const props = defineProps<{
  files: any[];
  type: 'node' | 'template' | 'patch' | 'ruleset';
  globalBusy?: boolean;
  subToken?: string;
}>();

const emit = defineEmits<{
  'refresh': [];
  'status': [type: 'success' | 'warning' | 'error', message: string, duration?: number];
  'delete': [file: any];
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



const fileMenuItems = [
  { label: '删除文件', action: 'remove', icon: Trash2, danger: true },
];

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
    const res = await fetch(`/api/file?path=${encodeURIComponent(file.path)}`);
    if (!res.ok) throw new Error('Failed to load file');
    const data = await res.json();
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
    emit('status', 'error', '加载失败: ' + e.message);
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
  if (!isValidJson.value) {
    emit('status', 'error', '请修复 JSON 语法错误后再保存');
    return;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(localFileName.value)) {
    emit('status', 'error', '文件名只能包含字母、数字、点、下划线和连字符，且不能为空');
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(editorContent.value);
  } catch (e: any) {
    emit('status', 'error', 'JSON 语法错误: ' + e.message);
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
  } else if (localFileNote.value) {
    parsed.note = localFileNote.value;
  } else {
    delete parsed.note;
  }
  editorContent.value = JSON.stringify(parsed, null, 2);

  isSaving.value = true;

  try {
    const dir = props.type === 'node' ? 'nodes' : (props.type === 'template' ? 'templates' : props.type === 'patch' ? 'patches' : 'rulesets');
    const newPath = `sing-sub/${dir}/${localFileName.value}.json`;
    const isRename = newPath !== editingFile.value.path && !editingFile.value.isNew;

    const res = await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: newPath,
        content: editorContent.value,
        sha: isRename ? null : fileSha.value,
        oldPath: isRename ? editingFile.value.path : undefined,
        message: `${editingFile.value.isNew ? 'Create' : (isRename ? 'Rename' : 'Update')} ${localFileName.value}.json`
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        const action = await resolveConflict();
        isSaving.value = false;
        if (action === 'reload') {
          await editFile(editingFile.value);
          emit('status', 'warning', '已重新加载最新版本，请检查改动是否需要重新应用', 5000);
        } else if (action === 'overwrite') {
          const latest = await fetch(`/api/file?path=${encodeURIComponent(editingFile.value.path)}`);
          if (latest.ok) {
            const latestData = await latest.json();
            fileSha.value = latestData.sha;
          }
          return saveFileCode();
        }
        return;
      }
      throw new Error(data.error || '保存失败');
    }

    const data = await res.json().catch(() => ({}));

    isEditorDirty.value = false;
    originalContent.value = editorContent.value;
    originalFileNote.value = localFileNote.value;
    if (data.warning) {
      emit('status', 'warning', data.warning, 5000);
    } else {
      emit('status', 'success', '保存成功');
    }
    emit('refresh');
    editingFile.value = null;
  } catch (e: any) {
    emit('status', 'error', '保存失败: ' + e.message);
  } finally {
    isSaving.value = false;
  }
}

function createFile() {
  const dir = props.type === 'node' ? 'nodes' : (props.type === 'template' ? 'templates' : props.type === 'patch' ? 'patches' : 'rulesets');
  viewMode.value = 'edit';
  editingFile.value = {
    path: `sing-sub/${dir}/untitled.json`,
    isNew: true
  };
  localFileName.value = '';
  localFileNote.value = '';
  originalFileNote.value = '';
  editorContent.value = props.type === 'ruleset' 
    ? '{\n  "version": 2,\n  "rules": [],\n  "_sing_sub": {\n    "manual": { "domain": [], "domain_suffix": [] },\n    "sources": []\n  }\n}'
    : '{\n  "inbounds": [],\n  "outbounds": []\n}';
  originalContent.value = editorContent.value;
  fileSha.value = null;
  isEditorDirty.value = false;
  isLoading.value = false;
  ruleSetContentValid.value = true;
}

async function copyRulesetLink(file: any) {
  if (!props.subToken) return;
  const name = getBasename(file.path).replace(/\.json$/, '');
  const url = `${window.location.origin}/rules/${props.subToken}/${encodeURIComponent(name)}.srs`;
  try {
    await navigator.clipboard.writeText(url);
    copiedRulesetPath.value = file.path;
    window.setTimeout(() => { if (copiedRulesetPath.value === file.path) copiedRulesetPath.value = ''; }, 2000);
  } catch {
    emit('status', 'error', '复制失败');
  }
}

defineExpose({ createFile });
</script>
