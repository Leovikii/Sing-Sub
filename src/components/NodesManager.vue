<template>
  <div class="nodes-manager space-y-6">


    <!-- Nodes List -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <FileCard
        v-for="node in nodes"
        :key="node.path"
        :title="getBasename(node.path)"
        :inboundCount="node.inboundsCount"
        :outboundCount="node.outboundsCount"
        :menuItems="nodeMenuItems"
        @click="editNode(node)"
        @edit="editNode(node)"
        @action="(act) => handleNodeAction(act, node)"
      />
    </div>

    <div v-if="nodes.length === 0" class="text-center py-20 text-[#86868b]">
      暂无节点文件，仓库初始化可能正在进行中。
    </div>

    <!-- Node Editor Modal -->
    <EditorModal
      :isOpen="!!editingNode"
      @update:isOpen="val => { if (!val) closeEditor() }"
      :title="localNodeName"
      @update:title="localNodeName = $event"
      :editableTitle="true"
      extension=".json"
      :isDirty="isEditorDirty || isNameDirty"
      :isSaving="isSaving"
      :showSave="true"
      saveText="保存"
      @save="saveNodeCode"
      @close="closeEditor"
    >
      <!-- Editor Error -->
      <div v-if="editorError" class="bg-[#ff6961]/10 text-[#ff6961] p-3 text-sm flex items-center gap-2 border-b border-[#ff6961]/20">
        <AlertCircle :size="16" /> {{ editorError }}
      </div>

      <!-- Editor Body -->
      <div class="flex-1 relative bg-[#0d0d0d]">
        <div v-if="isLoadingNode" class="absolute inset-0 flex flex-col justify-center items-center z-10 bg-[#0d0d0d]/80 backdrop-blur-sm">
          <Loader2 class="w-8 h-8 text-[#F596AA] animate-spin mb-4" />
          <span class="text-[#86868b]">加载文件内容中...</span>
        </div>
        <textarea
          v-model="editorContent"
          class="absolute inset-0 w-full h-full p-6 bg-transparent text-[#a1a1aa] font-mono text-sm leading-relaxed resize-none outline-none selection:bg-[#F596AA]/30 selection:text-[#f5f5f7]"
          spellcheck="false"
        ></textarea>
      </div>
    </EditorModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Loader2, AlertCircle, Trash2 } from 'lucide-vue-next';
import FileCard from './FileCard.vue';
import EditorModal from './EditorModal.vue';

const props = defineProps<{
  nodes: any[];
}>();

const emit = defineEmits<{
  'refresh': [];
}>();

const editingNode = ref<any | null>(null);
const editorContent = ref('');
const originalContent = ref('');
const editorError = ref('');
const isLoadingNode = ref(false);
const isSaving = ref(false);
const fileSha = ref<string | null>(null);

const isEditorDirty = ref(false);
const localNodeName = ref('');

const isNameDirty = computed(() => {
  if (!editingNode.value) return false;
  if (editingNode.value.isNew) return true;
  return localNodeName.value !== getBasename(editingNode.value.path).replace(/\.json$/, '');
});

const nodeMenuItems = [
  { label: '删除文件', action: 'remove', icon: Trash2, danger: true },
];

function handleNodeAction(action: string, node: any) {
  if (action === 'remove') {
    if (confirm(`确定要删除 ${getBasename(node.path)} 吗？此操作无法撤销。`)) {
      deleteNodeFile(node.path);
    }
  }
}

async function deleteNodeFile(path: string) {
  try {
    await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    emit('refresh');
  } catch (e: any) {
    console.error(e);
    alert('删除失败: ' + e.message);
  }
}

function getBasename(path: string) {
  return path.split('/').pop() || path;
}

watch(editorContent, (newVal) => {
  isEditorDirty.value = newVal !== originalContent.value;
  // Clear error when user types to try fixing json
  if (editorError.value) {
    try {
      JSON.parse(newVal);
      editorError.value = '';
    } catch {
      // still invalid
    }
  }
});

async function editNode(node: any) {
  editingNode.value = node;
  localNodeName.value = getBasename(node.path).replace(/\.json$/, '');
  isLoadingNode.value = true;
  editorError.value = '';
  editorContent.value = '';
  originalContent.value = '';
  isEditorDirty.value = false;
  
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(node.path)}`);
    if (!res.ok) throw new Error('Failed to load file');
    const data = await res.json();
    originalContent.value = data.content;
    editorContent.value = data.content;
    fileSha.value = data.sha;
  } catch (e: any) {
    editorError.value = '加载失败: ' + e.message;
  } finally {
    isLoadingNode.value = false;
  }
}

function closeEditor() {
  if (isEditorDirty.value) {
    if (!confirm('有未保存的修改，确定放弃并关闭吗？')) return;
  }
  editingNode.value = null;
}

async function saveNodeCode() {
  try {
    // Validate JSON
    JSON.parse(editorContent.value);
  } catch (e: any) {
    editorError.value = 'JSON 语法错误: ' + e.message;
    return;
  }

  isSaving.value = true;
  editorError.value = '';

  try {
    const newPath = `sing-sub/nodes/${localNodeName.value}.json`;
    const isRename = newPath !== editingNode.value.path && !editingNode.value.isNew;

    const res = await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: newPath,
        content: editorContent.value,
        sha: isRename ? null : fileSha.value, // If renaming, it's a new file, so no sha.
        message: `${editingNode.value.isNew ? 'Create' : 'Update'} ${localNodeName.value}.json via Sing-Sub Node Manager`
      })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '保存失败');
    }

    // If it was a rename, we must delete the old file
    if (isRename && fileSha.value) {
      try {
        await fetch(`/api/file?path=${encodeURIComponent(editingNode.value.path)}`, {
          method: 'DELETE',
        });
      } catch (deleteErr) {
        console.error('Failed to delete old file after rename:', deleteErr);
        // It's a non-fatal error for the save, but we should probably warn
      }
    }
    
    isEditorDirty.value = false;
    originalContent.value = editorContent.value;
    
    // Refresh the nodes list to update counts
    emit('refresh');
    
    // Close editor on success
    editingNode.value = null;
  } catch (e: any) {
    editorError.value = '保存失败: ' + e.message;
  } finally {
    isSaving.value = false;
  }
}

function createNode() {
  editingNode.value = { path: 'sing-sub/nodes/new_node.json', isNew: true };
  localNodeName.value = 'new_node';
  editorContent.value = '{\n  "inbounds": [],\n  "outbounds": []\n}';
  originalContent.value = editorContent.value;
  fileSha.value = null;
  isEditorDirty.value = true;
  isLoadingNode.value = false;
  editorError.value = '';
}

defineExpose({ createNode });
</script>


