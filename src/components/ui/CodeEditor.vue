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
import { EditorState, Compartment, Transaction } from '@codemirror/state';
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

const readOnlyCompartment = new Compartment();

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
  /* --- Floating Search Panel Styling (VS Code Style) --- */
  ".cm-panels-top": {
    position: "absolute !important",
    top: "0px !important",
    right: "8px !important",
    left: "auto !important",
    width: "auto !important",
    zIndex: "10 !important",
    backgroundColor: "transparent !important",
    border: "none !important"
  },
  ".cm-panels": {
    backgroundColor: "transparent !important",
    border: "none !important"
  },
  ".cm-search": {
    backgroundColor: "rgba(30, 30, 32, 0.95) !important",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255, 255, 255, 0.1) !important",
    borderTop: "none !important",
    borderTopLeftRadius: "0px !important",
    borderTopRightRadius: "0px !important",
    borderBottomLeftRadius: "var(--radius-md) !important",
    borderBottomRightRadius: "var(--radius-md) !important",
    boxShadow: "var(--shadow-lg) !important",
    color: "#f5f5f7",
    padding: "6px 8px !important",
    width: "320px",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    position: "relative",
    paddingRight: "18px"
  },
  ".cm-search input": {
    width: "140px",
    backgroundColor: "#0a0a0a !important",
    border: "1px solid #38383a !important",
    borderRadius: "var(--radius-xs) !important",
    padding: "4px 8px !important",
    color: "#f5f5f7 !important",
    outline: "none !important",
    fontSize: "12px !important",
    transition: "border-color 0.2s"
  },
  ".cm-search input:focus": {
    borderColor: "#F596AA !important"
  },
  ".cm-search button": {
    backgroundColor: "transparent !important",
    border: "1px solid transparent !important",
    borderRadius: "var(--radius-xs) !important",
    padding: "4px 8px !important",
    color: "#86868b !important",
    cursor: "pointer !important",
    fontSize: "12px !important",
    transition: "all 0.2s !important"
  },
  ".cm-search button:hover": {
    backgroundColor: "#2c2c2e !important",
    color: "#f5f5f7 !important"
  },
  ".cm-search label": {
    display: "none !important" /* Hide match options completely */
  },
  ".cm-search button[name=select]": {
    display: "none !important" /* Hide 'all' select button */
  },
  ".cm-search br": {
    display: "block !important",
    flexBasis: "100%",
    height: "0",
    margin: "0"
  },
  ".cm-search button[name=close]": {
    position: "absolute",
    top: "0px",
    right: "-4px",
    width: "20px",
    height: "20px",
    backgroundColor: "transparent !important",
    border: "none !important",
    padding: "0 !important",
    color: "#86868b !important",
    fontSize: "16px !important",
    lineHeight: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "20"
  },
  ".cm-search button[name=close]:hover": {
    color: "#F596AA !important",
    backgroundColor: "transparent !important"
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
    readOnlyCompartment.of(EditorState.readOnly.of(!!props.readonly))
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
      changes: { from: 0, to: v.state.doc.length, insert: newVal },
      annotations: Transaction.addToHistory.of(false),
    });
  }
});

watch(() => props.readonly, (newVal) => {
  const v = getActiveView();
  if (v) {
    v.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(!!newVal))
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
