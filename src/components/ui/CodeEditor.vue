<template>
  <div class="absolute inset-0 flex flex-col bg-[#0d0d0d] overflow-hidden">
    <EditorToolbar 
      @format="formatCode" 
      @undo="doUndo" 
      @redo="doRedo" 
      @replace="openReplace" 
      :canUndo="canUndo"
      :canRedo="canRedo"
      v-if="!readonly"
    />

    <!-- Editor Container -->
    <div class="flex-1 relative overflow-hidden cm-custom-wrapper">
      <div ref="editorContainer" class="absolute inset-0 h-full w-full"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import EditorToolbar from './EditorToolbar.vue';

// CodeMirror Core
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { linter, lintKeymap } from '@codemirror/lint';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';

const props = defineProps<{
  modelValue: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const editorContainer = ref<HTMLElement | null>(null);
const view = shallowRef<EditorView | null>(null);

const canUndo = ref(false);
const canRedo = ref(false);

function getActiveView(): EditorView | null {
  return view.value;
}

// Format JSON Command
function formatCode() {
  const v = getActiveView();
  if (!v) return;
  try {
    const currentCode = v.state.doc.toString();
    const formatted = JSON.stringify(JSON.parse(currentCode), null, 2);
    if (formatted !== currentCode) {
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: formatted }
      });
    }
  } catch (e) {
    // Cannot format invalid JSON, ignore
  }
}

function doUndo() {
  const v = getActiveView();
  if (v) undo(v);
}

function doRedo() {
  const v = getActiveView();
  if (v) redo(v);
}

function openReplace() {
  const v = getActiveView();
  if (v) openSearchPanel(v);
}

const themeExtensions = EditorView.theme({
  "&": {
    backgroundColor: "transparent !important",
    height: "100%"
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    overflow: "auto"
  },
  ".cm-gutters": {
    backgroundColor: "transparent !important",
    color: "#4b5563 !important",
    borderRight: "1px solid rgba(255,255,255,0.05) !important"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255,255,255,0.05) !important",
    color: "#F596AA !important"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255,255,255,0.03) !important"
  },
  /* --- Clean Search Panel Styling --- */
  ".cm-panels": {
    backgroundColor: "#1c1c1e !important",
    borderBottom: "1px solid #38383a",
    color: "#f5f5f7"
  },
  ".cm-search": {
    padding: "10px 12px !important",
    position: "relative"
  },
  ".cm-search label": {
    display: "none !important"
  },
  ".cm-search input": {
    backgroundColor: "#0a0a0a",
    border: "1px solid #38383a",
    borderRadius: "6px",
    padding: "4px 8px",
    color: "#f5f5f7",
    outline: "none",
    fontSize: "13px",
    maxWidth: "160px",
    marginRight: "6px",
    marginBottom: "6px"
  },
  ".cm-search input:focus": {
    borderColor: "#F596AA"
  },
  ".cm-search button": {
    backgroundColor: "#2c2c2e",
    border: "1px solid #38383a",
    borderRadius: "6px",
    padding: "4px 10px",
    color: "#86868b",
    cursor: "pointer",
    fontSize: "12px",
    transition: "all 0.2s",
    marginRight: "6px",
    marginBottom: "6px"
  },
  ".cm-search button:hover": {
    backgroundColor: "#38383a",
    color: "#f5f5f7"
  },
  ".cm-search button[name=close]": {
    position: "absolute",
    top: "6px",
    right: "6px",
    backgroundColor: "transparent !important",
    border: "none !important",
    fontSize: "16px",
    padding: "4px !important",
    margin: "0 !important",
    color: "#86868b !important"
  },
  ".cm-search button[name=close]:hover": {
    color: "#F596AA !important"
  },
  /* --- Lint panel --- */
  ".cm-lint-marker": {
    width: "4px",
    height: "4px",
    borderRadius: "50%"
  },
  ".cm-diagnostic": {
    borderLeft: "3px solid #ff6961 !important",
    backgroundColor: "#ff69611a !important"
  }
});

function createExtensions() {
  const exts = [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    json(),
    linter(jsonParseLinter()),
    search({ top: true }),
    oneDark,
    themeExtensions,
    highlightActiveLine(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...lintKeymap
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newCode = update.state.doc.toString();
        emit('update:modelValue', newCode);
      }
      canUndo.value = undoDepth(update.state) > 0;
      canRedo.value = redoDepth(update.state) > 0;
    }),
    EditorState.phrases.of({
      "Find": "查找",
      "Replace": "替换",
      "Replace all": "全部替换",
      "Match case": "区分大小写",
      "Regexp": "正则表达式",
      "By word": "全字匹配",
      "Close": "关闭",
      "next": "下一个",
      "previous": "上一个",
      "replace": "替换",
      "replace all": "全部替换"
    }),
    EditorState.readOnly.of(!!props.readonly)
  ];

  return exts;
}

onMounted(() => {
  if (!editorContainer.value) return;

  view.value = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: createExtensions()
    }),
    parent: editorContainer.value
  });
});

watch(() => props.modelValue, (newVal) => {
  const v = getActiveView();
  if (v && v.state.doc.toString() !== newVal) {
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: newVal }
    });
  }
});

onBeforeUnmount(() => {
  if (view.value) view.value.destroy();
});
</script>

<style>
.cm-custom-wrapper .cm-editor {
  height: 100%;
  outline: none !important;
}
.cm-custom-wrapper .cm-focused {
  outline: none !important;
}
</style>
