<template>
  <div class="absolute inset-0 flex flex-col bg-[#0d0d0d] overflow-hidden text-[#f5f5f7]">
    <!-- Toolbar -->
    <EditorToolbar 
      @format="formatCode" 
      @undo="doUndo"
      @redo="doRedo"
      @search="openSearch"
      @replace="openReplace"
      :canUndo="canUndo"
      :canRedo="canRedo"
      v-if="!readonly"
    />

    <!-- Search / Replace Panel -->
    <div v-if="showSearchPanel" class="absolute top-14 right-4 z-20 bg-[#1c1c1e] border border-[#38383a] rounded-lg shadow-xl p-2 w-72 flex flex-col gap-2">
      <!-- Search Row -->
      <div class="flex items-center gap-2">
        <input 
          ref="searchInput"
          v-model="searchText"
          @input="onSearchInput"
          @keydown.enter.prevent="nextMatch"
          @keydown.shift.enter.prevent="prevMatch"
          @keydown.esc.prevent="closePanels"
          type="text" 
          placeholder="查找..." 
          class="flex-1 min-w-0 bg-[#0a0a0a] border border-[#38383a] rounded px-2 py-1 text-sm outline-none focus:border-[#F596AA]"
        />
        <span class="text-xs text-[#86868b] w-10 text-right shrink-0">{{ matchText }}</span>
        <div class="flex gap-1 shrink-0">
          <button @click="prevMatch" class="p-1 hover:bg-[#38383a] rounded text-[#86868b] hover:text-white" title="上一个"><ChevronUp :size="14" /></button>
          <button @click="nextMatch" class="p-1 hover:bg-[#38383a] rounded text-[#86868b] hover:text-white" title="下一个"><ChevronDown :size="14" /></button>
          <button @click="closePanels" class="p-1 hover:bg-[#38383a] rounded text-[#86868b] hover:text-white" title="关闭"><X :size="14" /></button>
        </div>
      </div>
      
      <!-- Replace Row -->
      <div v-if="isReplaceMode" class="flex items-center gap-2">
        <input 
          v-model="replaceText"
          @keydown.enter.prevent="replaceCurrent"
          @keydown.esc.prevent="closePanels"
          type="text" 
          placeholder="替换为..." 
          class="flex-1 min-w-0 bg-[#0a0a0a] border border-[#38383a] rounded px-2 py-1 text-sm outline-none focus:border-[#F596AA]"
        />
        <div class="flex gap-1 shrink-0">
          <button @click="replaceCurrent" class="px-2 py-1 bg-[#2c2c2e] hover:bg-[#38383a] border border-[#38383a] rounded text-xs text-white" title="替换">替换</button>
          <button @click="replaceAll" class="px-2 py-1 bg-[#2c2c2e] hover:bg-[#38383a] border border-[#38383a] rounded text-xs text-white" title="全部替换">全部</button>
        </div>
      </div>
    </div>

    <!-- Simple Editing Area -->
    <div class="flex-1 relative overflow-hidden flex flex-col">
      <textarea
        ref="textareaRef"
        class="flex-1 w-full p-4 bg-[#0d0d0d] text-[#f5f5f7] font-mono text-sm resize-none outline-none leading-relaxed whitespace-pre"
        :value="modelValue"
        @input="onInput"
        @keydown="onKeydown"
        :readonly="readonly"
        spellcheck="false"
        placeholder="在此输入代码..."
      ></textarea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { ChevronUp, ChevronDown, X } from 'lucide-vue-next';
import EditorToolbar from './EditorToolbar.vue';

const props = defineProps<{
  modelValue: string;
  baseContent?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

// --- History (Undo/Redo) ---
const undoStack = ref<{ text: string; cursor: number }[]>([]);
const redoStack = ref<{ text: string; cursor: number }[]>([]);

let isHistoryNavigating = false;
let inputTimeout: any = null;

const canUndo = computed(() => undoStack.value.length > 1);
const canRedo = computed(() => redoStack.value.length > 0);

function saveHistoryState(force = false) {
  if (isHistoryNavigating || !textareaRef.value) return;
  const state = { text: props.modelValue, cursor: textareaRef.value.selectionStart };
  
  if (force) {
    if (undoStack.value.length === 0 || undoStack.value[undoStack.value.length - 1].text !== state.text) {
      undoStack.value.push(state);
      redoStack.value = [];
    }
  } else {
    // Debounce typing saves
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
      if (undoStack.value.length === 0 || undoStack.value[undoStack.value.length - 1].text !== state.text) {
        undoStack.value.push(state);
        redoStack.value = [];
      }
    }, 500);
  }
}

onMounted(() => {
  undoStack.value = [{ text: props.modelValue, cursor: 0 }];
});

watch(() => props.modelValue, (newVal) => {
  // If parent completely replaces the value externally (e.g. Profile change)
  if (!isHistoryNavigating && (!undoStack.value.length || undoStack.value[undoStack.value.length - 1].text !== newVal)) {
    saveHistoryState(true);
  }
});

function doUndo() {
  if (!canUndo.value) return;
  isHistoryNavigating = true;
  const current = undoStack.value.pop()!;
  redoStack.value.push(current);
  
  const previous = undoStack.value[undoStack.value.length - 1];
  emit('update:modelValue', previous.text);
  
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.setSelectionRange(previous.cursor, previous.cursor);
      textareaRef.value.focus();
    }
    isHistoryNavigating = false;
    if (showSearchPanel.value) onSearchInput();
  });
}

function doRedo() {
  if (!canRedo.value) return;
  isHistoryNavigating = true;
  const next = redoStack.value.pop()!;
  undoStack.value.push(next);
  
  emit('update:modelValue', next.text);
  
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.setSelectionRange(next.cursor, next.cursor);
      textareaRef.value.focus();
    }
    isHistoryNavigating = false;
    if (showSearchPanel.value) onSearchInput();
  });
}

// --- Input Handling ---
function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
  saveHistoryState();
  if (showSearchPanel.value) {
    onSearchInput(); // update matches
  }
}

function onKeydown(e: KeyboardEvent) {
  // Support tab insertion
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!textareaRef.value) return;
    const start = textareaRef.value.selectionStart;
    const end = textareaRef.value.selectionEnd;
    const newText = props.modelValue.substring(0, start) + "  " + props.modelValue.substring(end);
    emit('update:modelValue', newText);
    nextTick(() => {
      if (textareaRef.value) {
        textareaRef.value.setSelectionRange(start + 2, start + 2);
      }
      saveHistoryState(true);
    });
  }
  
  // Custom Undo/Redo shortcuts
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    doUndo();
  }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    doRedo();
  }
  // Search / Replace shortcuts
  if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    openSearch();
  }
  if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    openReplace();
  }
}

function formatCode() {
  try {
    const formatted = JSON.stringify(JSON.parse(props.modelValue), null, 2);
    if (formatted !== props.modelValue) {
      emit('update:modelValue', formatted);
      nextTick(() => saveHistoryState(true));
    }
  } catch (e) {
    // Ignore invalid JSON formatting attempts
  }
}

// --- Search / Replace ---
const showSearchPanel = ref(false);
const isReplaceMode = ref(false);
const searchText = ref('');
const replaceText = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

const matches = ref<{ start: number; end: number }[]>([]);
const currentMatchIndex = ref(-1);

const matchText = computed(() => {
  if (!searchText.value) return '0/0';
  if (matches.value.length === 0) return '0/0';
  return `${currentMatchIndex.value + 1}/${matches.value.length}`;
});

function openSearch() {
  showSearchPanel.value = true;
  isReplaceMode.value = false;
  nextTick(() => {
    searchInput.value?.focus();
    if (textareaRef.value && textareaRef.value.selectionStart !== textareaRef.value.selectionEnd) {
      searchText.value = props.modelValue.substring(textareaRef.value.selectionStart, textareaRef.value.selectionEnd);
      onSearchInput();
    }
  });
}

function openReplace() {
  showSearchPanel.value = true;
  isReplaceMode.value = true;
  nextTick(() => searchInput.value?.focus());
}

function closePanels() {
  showSearchPanel.value = false;
  isReplaceMode.value = false;
  textareaRef.value?.focus();
}

function onSearchInput() {
  if (!searchText.value) {
    matches.value = [];
    currentMatchIndex.value = -1;
    return;
  }
  
  const text = props.modelValue;
  const searchStr = searchText.value.toLowerCase(); 
  const textLower = text.toLowerCase();
  
  const newMatches = [];
  let index = 0;
  while ((index = textLower.indexOf(searchStr, index)) !== -1) {
    newMatches.push({ start: index, end: index + searchStr.length });
    index += searchStr.length;
  }
  
  matches.value = newMatches;
  
  if (newMatches.length > 0) {
    // Find closest match after cursor
    const cursor = textareaRef.value?.selectionStart || 0;
    const closestIdx = newMatches.findIndex(m => m.start >= cursor);
    currentMatchIndex.value = closestIdx !== -1 ? closestIdx : 0;
    highlightMatch();
  } else {
    currentMatchIndex.value = -1;
  }
}

function nextMatch() {
  if (matches.value.length === 0) return;
  currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length;
  highlightMatch();
}

function prevMatch() {
  if (matches.value.length === 0) return;
  currentMatchIndex.value = (currentMatchIndex.value - 1 + matches.value.length) % matches.value.length;
  highlightMatch();
}

function highlightMatch() {
  if (currentMatchIndex.value === -1 || !textareaRef.value) return;
  const match = matches.value[currentMatchIndex.value];
  
  textareaRef.value.setSelectionRange(match.start, match.end);
  
  // Try to scroll into view roughly
  const fullText = props.modelValue;
  const linesBefore = fullText.substring(0, match.start).split('\n').length;
  // A rough estimate of line height is 21px
  textareaRef.value.scrollTop = Math.max(0, (linesBefore - 5) * 21);
}

function replaceCurrent() {
  if (currentMatchIndex.value === -1 || matches.value.length === 0) return;
  
  const match = matches.value[currentMatchIndex.value];
  const before = props.modelValue.substring(0, match.start);
  const after = props.modelValue.substring(match.end);
  const newText = before + replaceText.value + after;
  
  emit('update:modelValue', newText);
  nextTick(() => {
    saveHistoryState(true);
    onSearchInput();
  });
}

function replaceAll() {
  if (!searchText.value) return;
  
  const text = props.modelValue;
  const searchStr = searchText.value; 
  
  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapeRegExp(searchStr), 'gi');
  
  const newText = text.replace(regex, replaceText.value);
  if (newText !== text) {
    emit('update:modelValue', newText);
    nextTick(() => {
      saveHistoryState(true);
      onSearchInput();
    });
  }
}
</script>
