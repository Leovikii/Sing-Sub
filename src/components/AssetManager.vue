<template>
  <div class="asset-manager space-y-6">
    <!-- Assets List -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <FileCard
        v-for="file in files"
        :key="file.path"
        :title="getBasename(file.path).replace(/\.json$/, '')"
        :inboundCount="file.inboundsCount"
        :outboundCount="file.outboundsCount"
        :icon="type === 'node' ? Network : (type === 'template' ? LayoutTemplate : type === 'patch' ? Puzzle : Shield)"
        :tag="type === 'node' ? 'NODE' : (type === 'template' ? 'TEMPLATE' : type === 'patch' ? 'PATCH' : 'RULESET')"
        :tagStyle="type === 'node' ? 'bg-[#F596AA]/10 text-[#F596AA] border border-[#F596AA]/20' : (type === 'template' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : type === 'patch' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')"
        :menuItems="fileMenuItems"
        @click="editFile(file, 'preview')"
        @edit="editFile(file)"
        @action="(act) => handleFileAction(act, file)"
      />
    </div>



    <div v-if="files.length === 0" class="text-center py-20 text-[#86868b]">
      {{ type === 'node' ? '暂无节点文件，仓库初始化可能正在进行中。' : (type === 'template' ? '暂无模板文件。' : (type === 'patch' ? '暂无补丁文件。' : '暂无规则集文件。')) }}
    </div>

    <!-- Editor Modal -->
    <EditorModal
      :isOpen="!!editingFile"
      @update:isOpen="(val) => { if (!val) closeEditor(); }"
      :title="localFileName"
      @update:title="localFileName = $event"
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
      saveText="保存"
      :showViewToggle="true"
      @save="saveFileCode"
      @close="closeEditor"
    >
      <template v-if="type === 'ruleset' && viewMode === 'edit'" #header-actions>
        <PopoverMenu
          v-model:isOpen="addRuleMenuOpen"
          wrapperClass="relative flex"
          contentClass="right-0 top-full mt-2 w-52 p-1.5 rounded-2xl bg-[#2c2c2e]/95 backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] origin-top-right flex flex-col gap-0.5"
        >
          <template #trigger="{ toggle, isOpen }">
            <ToolbarButton
              :icon="Plus"
              :active="isOpen"
              title="添加规则"
              @click="toggle"
            />
          </template>

          <template #content="{ close }">
            <button
              @click="ruleSetEditorRef?.addRule('domain'); close()"
              class="w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium text-[#f5f5f7] hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Globe :size="14" />
              添加完整域名 (domain)
            </button>
            <button
              @click="ruleSetEditorRef?.addRule('domain_suffix'); close()"
              class="w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium text-[#f5f5f7] hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Link2 :size="14" />
              添加域名后缀 (domain_suffix)
            </button>
            <button
              @click="ruleSetEditorRef?.addRule('external_url'); close()"
              class="w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium text-[#f5f5f7] hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <CloudDownload :size="14" />
              引入外部 JSON (URL)
            </button>
          </template>
        </PopoverMenu>
      </template>

      <component
        :is="type === 'ruleset' && viewMode === 'edit' ? RuleSetEditor : CodeEditor"
        :ref="type === 'ruleset' && viewMode === 'edit' ? (el => ruleSetEditorRef = (el as any)) : undefined"
        v-model="editorContent"
        :readonly="viewMode === 'preview'"
        :loading="isLoading"
        loadingText="读取中..."
        class="min-h-[60vh]"
      />
    </EditorModal>


  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { Trash2, Plus, Globe, Link2, CloudDownload, Network, LayoutTemplate, Puzzle, Shield } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import EditorModal from './ui/EditorModal.vue';
import PopoverMenu from './ui/PopoverMenu.vue';
import ToolbarButton from './ui/ToolbarButton.vue';

const CodeEditor = defineAsyncComponent(() => import('./ui/CodeEditor.vue'));
const RuleSetEditor = defineAsyncComponent(() => import('./ui/RuleSetEditor.vue'));

const props = defineProps<{
  files: any[];
  type: 'node' | 'template' | 'patch' | 'ruleset';
  globalBusy?: boolean;
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
const addRuleMenuOpen = ref(false);
const ruleSetEditorRef = ref<InstanceType<typeof RuleSetEditor> | null>(null);



const isNameDirty = computed(() => {
  if (!editingFile.value) return false;
  if (editingFile.value.isNew) return true;
  return localFileName.value !== getBasename(editingFile.value.path).replace(/\.json$/, '');
});

const isNoteDirty = computed(() => {
  if (!editingFile.value) return false;
  return localFileNote.value !== originalFileNote.value;
});



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
      originalFileNote.value = parsed.note || parsed._note || '';
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
  editingFile.value = null;
}

function resolveConflict(): Promise<'reload' | 'overwrite' | 'cancel'> {
  return new Promise(resolve => { emit('conflict', resolve); });
}

async function saveFileCode() {
  let parsed: any;
  try {
    parsed = JSON.parse(editorContent.value);
  } catch (e: any) {
    emit('status', 'error', 'JSON 语法错误: ' + e.message);
    return;
  }

  // Inject note
  if (localFileNote.value) {
    parsed.note = localFileNote.value;
  } else {
    delete parsed.note;
    delete parsed._note;
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
  const newName = props.type === 'node' ? 'new_node' : (props.type === 'template' ? 'new_template' : props.type === 'patch' ? 'new_patch' : 'new_ruleset');
  viewMode.value = 'edit';
  editingFile.value = {
    path: `sing-sub/${dir}/untitled.json`,
    isNew: true
  };
  localFileName.value = newName;
  localFileNote.value = '';
  originalFileNote.value = '';
  editorContent.value = props.type === 'ruleset' 
    ? '{\n  "version": 4,\n  "rules": []\n}' 
    : '{\n  "inbounds": [],\n  "outbounds": []\n}';
  originalContent.value = editorContent.value;
  fileSha.value = null;
  isEditorDirty.value = true;
  isLoading.value = false;
}

defineExpose({ createFile });
</script>
