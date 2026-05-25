<template>
  <div class="asset-manager space-y-6">
    <!-- Assets List -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <FileCard
        v-for="file in files"
        :key="file.path"
        :title="getBasename(file.path)"
        :inboundCount="file.inboundsCount"
        :outboundCount="file.outboundsCount"
        :icon="type === 'node' ? 'network' : (type === 'template' ? 'layout-template' : 'puzzle')"
        :tag="type === 'node' ? 'NODE' : (type === 'template' ? 'TEMPLATE' : 'PATCH')"
        :tagStyle="type === 'node' ? 'bg-[#F596AA]/10 text-[#F596AA] border border-[#F596AA]/20' : (type === 'template' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20')"
        :menuItems="fileMenuItems"
        @click="editFile(file, 'preview')"
        @edit="editFile(file)"
        @action="(act) => handleFileAction(act, file)"
      />
    </div>



    <div v-if="files.length === 0" class="text-center py-20 text-[#86868b]">
      {{ type === 'node' ? '暂无节点文件，仓库初始化可能正在进行中。' : (type === 'template' ? '暂无模板文件。' : '暂无补丁文件。') }}
    </div>

    <!-- Editor Modal -->
    <EditorModal
      :isOpen="!!editingFile"
      @update:isOpen="val => { if (!val) closeEditor() }"
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
      :isSaving="isSaving"
      :showSave="isEditorDirty || isNameDirty || isNoteDirty"
      saveText="保存"
      :showViewToggle="true"
      @save="saveFileCode"
      @reset="resetFileCode"
      @close="closeEditor"
    >
      <CodeEditor
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
import { computed, ref, watch } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import FileCard from './ui/FileCard.vue';
import EditorModal from './ui/EditorModal.vue';
import CodeEditor from './ui/CodeEditor.vue';

const props = defineProps<{
  files: any[];
  type: 'node' | 'template' | 'patch';
}>();

const emit = defineEmits<{
  'refresh': [];
  'status': [type: 'success' | 'warning' | 'error', message: string, duration?: number];
  'delete': [file: any];
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

async function editFile(file: any, mode: 'preview' | 'edit' = 'edit') {
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
    emit('status', 'error', '加载失败: ' + e.message);
  } finally {
    isLoading.value = false;
  }
}

function closeEditor() {
  isEditorDirty.value = false;
  editingFile.value = null;
}

function resetFileCode() {
  editorContent.value = originalContent.value;
  if (editingFile.value && !editingFile.value.isNew) {
    localFileName.value = getBasename(editingFile.value.path).replace(/\.json$/, '');
  }
  localFileNote.value = originalFileNote.value;
  isEditorDirty.value = false;
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
    const dir = props.type === 'node' ? 'nodes' : (props.type === 'template' ? 'templates' : 'patches');
    const newPath = `sing-sub/${dir}/${localFileName.value}.json`;
    const isRename = newPath !== editingFile.value.path && !editingFile.value.isNew;

    const res = await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: newPath,
        content: editorContent.value,
        sha: isRename ? null : fileSha.value,
        message: `${editingFile.value.isNew ? 'Create' : 'Update'} ${localFileName.value}.json via Sing-Sub Asset Manager`
      })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '保存失败');
    }

    if (isRename && fileSha.value) {
      try {
        await fetch(`/api/file?path=${encodeURIComponent(editingFile.value.path)}`, {
          method: 'DELETE',
        });
      } catch (deleteErr) {
        console.error('Failed to delete old file after rename:', deleteErr);
      }
    }
    
    isEditorDirty.value = false;
    originalContent.value = editorContent.value;
    originalFileNote.value = localFileNote.value;
    emit('status', 'success', '保存成功');
    emit('refresh');
    editingFile.value = null;
  } catch (e: any) {
    emit('status', 'error', '保存失败: ' + e.message);
  } finally {
    isSaving.value = false;
  }
}

function createFile() {
  const dir = props.type === 'node' ? 'nodes' : (props.type === 'template' ? 'templates' : 'patches');
  const newName = props.type === 'node' ? 'new_node' : (props.type === 'template' ? 'new_template' : 'new_patch');
  viewMode.value = 'edit';
  editingFile.value = {
    path: `sing-sub/${dir}/untitled.json`,
    isNew: true
  };
  localFileName.value = newName;
  localFileNote.value = '';
  originalFileNote.value = '';
  editorContent.value = '{\n  "inbounds": [],\n  "outbounds": []\n}';
  originalContent.value = editorContent.value;
  fileSha.value = null;
  isEditorDirty.value = true;
  isLoading.value = false;
}

defineExpose({ createFile });
</script>
