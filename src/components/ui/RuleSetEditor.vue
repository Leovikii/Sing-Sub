<template>
  <div class="ruleset-editor flex flex-col h-full min-h-[60vh] bg-[#0a0a0a] rounded-xl overflow-hidden border border-bg-elevated">
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 class="w-8 h-8 animate-spin text-brand-pink" />
    </div>
    <div v-else class="flex-1 flex flex-col relative">
      <!-- Editor Content -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-if="rules.length === 0" class="flex flex-col items-center justify-center h-full text-text-muted space-y-3 opacity-60 mt-10">
          <ListPlus class="w-12 h-12" />
          <p>{{ readonly ? '当前规则集为空。' : '当前规则集为空，请点击右上角添加规则。' }}</p>
        </div>

        <div v-for="(rule, index) in rules" :key="rule.id" class="glass p-4 rounded-xl border border-border-base group relative transition-colors focus-within:border-brand-pink/50">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-medium tracking-wider font-mono border"
                :class="rule.type === 'external_url' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : rule.type === 'raw' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'"
              >
                {{ rule.type.toUpperCase() }}
              </span>
              <span class="text-xs text-text-muted">{{ getSubtitle(rule) }}</span>
            </div>
            <button v-if="!readonly" @click="removeRule(index)" class="text-text-muted hover:text-red-400 transition-colors p-1 cursor-pointer" title="移除该规则块">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>

          <textarea
            v-model="rule.content"
            :class="[
              'w-full bg-[#0a0a0a] border border-bg-elevated rounded-md p-3 text-sm text-[#e5e5ea] font-mono focus:outline-none focus:border-brand-pink transition-colors resize-y min-h-[100px] placeholder:text-[#48484a]',
              readonly ? 'opacity-70 cursor-default' : ''
            ]"
            :placeholder="getPlaceholder(rule.type)"
            :readonly="readonly"
            @input="emitChange"
          ></textarea>
          <p v-if="rule.rawError" class="mt-2 text-xs text-danger">{{ rule.rawError }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Loader2, ListPlus, Trash2 } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: string;
  loading?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'validity-change': [value: boolean];
}>();

type RuleType = 'domain' | 'domain_suffix' | 'external_url' | 'raw';

interface RuleBlock {
  id: string;
  type: RuleType;
  content: string;
  raw?: any;
  rawError?: string;
}

const rules = ref<RuleBlock[]>([]);
const sourceDocument = ref<Record<string, any>>({});

// Tracks the last value we emitted ourselves, so the reflected v-model update
// doesn't get reparsed into a fresh set of rule ids (which would tear down and
// rebuild every textarea via :key, losing focus/cursor position mid-typing).
let lastEmitted: string | null = null;

// Parse initial JSON / externally-changed content (e.g. reset)
watch(() => props.modelValue, (newVal) => {
  if (!newVal || newVal === lastEmitted) return;
  try {
    const parsed = JSON.parse(newVal);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    sourceDocument.value = parsed;
    const parsedRules: RuleBlock[] = [];

    // Parse _urls
    if (parsed._urls && Array.isArray(parsed._urls) && parsed._urls.length > 0) {
      parsedRules.push({
        id: Math.random().toString(36).slice(2),
        type: 'external_url',
        content: parsed._urls.join('\n')
      });
    }

    // Parse rules. Anything beyond a single plain domain/domain_suffix key
    // (combined conditions, invert, domain_keyword, ip_cidr, ...) is preserved
    // verbatim as a read-only "raw" block instead of being dropped or split.
    if (parsed.rules && Array.isArray(parsed.rules)) {
      parsed.rules.forEach((r: any) => {
        const keys = Object.keys(r);
        if (keys.length === 1 && keys[0] === 'domain' && Array.isArray(r.domain)) {
          parsedRules.push({ id: Math.random().toString(36).slice(2), type: 'domain', content: r.domain.join('\n') });
        } else if (keys.length === 1 && keys[0] === 'domain_suffix' && Array.isArray(r.domain_suffix)) {
          parsedRules.push({ id: Math.random().toString(36).slice(2), type: 'domain_suffix', content: r.domain_suffix.join('\n') });
        } else {
          parsedRules.push({ id: Math.random().toString(36).slice(2), type: 'raw', content: JSON.stringify(r, null, 2), raw: r });
        }
      });
    }

    rules.value = parsedRules;
    emit('validity-change', true);
  } catch (e) {
    emit('validity-change', false);
  }
}, { immediate: true });

function getPlaceholder(type: RuleType) {
  if (type === 'domain') return 'example.com\nwww.example.com';
  if (type === 'domain_suffix') return '.example.com\n.google.com';
  if (type === 'external_url') return 'https://raw.githubusercontent.com/.../geosite-cn.json';
  return '';
}

function isEmptyBlock(block: RuleBlock) {
  return block.content.split('\n').map(l => l.trim()).filter(Boolean).length === 0;
}

function getSubtitle(block: RuleBlock) {
  if (block.type === 'raw') return '原始规则块，可直接编辑 JSON；无效 JSON 不会写回文件';
  if (isEmptyBlock(block)) return '此规则块为空，保存后不会写入文件';
  return '每行输入一项';
}

function addRule(type: RuleType) {
  rules.value.push({
    id: Math.random().toString(36).slice(2),
    type,
    content: ''
  });
  emitChange();
}

function removeRule(index: number) {
  rules.value.splice(index, 1);
  emitChange();
}

function emitChange() {
  const output = JSON.parse(JSON.stringify(sourceDocument.value || {})) as Record<string, any>;
  if (output.version === undefined) output.version = 4;
  output.rules = [];

  const urls: string[] = [];

  for (const block of rules.value) {
    if (block.type === 'raw') {
      try {
        block.raw = JSON.parse(block.content);
        block.rawError = undefined;
        output.rules.push(block.raw);
      } catch {
        block.rawError = '请输入有效的 JSON 对象后再保存';
        emit('validity-change', false);
        return;
      }
      continue;
    }

    const lines = block.content.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    if (block.type === 'external_url') {
      urls.push(...lines);
    } else if (block.type === 'domain') {
      output.rules.push({ domain: lines });
    } else if (block.type === 'domain_suffix') {
      output.rules.push({ domain_suffix: lines });
    }
  }

  if (urls.length > 0) {
    output._urls = urls;
  } else {
    delete output._urls;
  }

  const json = JSON.stringify(output, null, 2);
  sourceDocument.value = output;
  lastEmitted = json;
  emit('validity-change', true);
  emit('update:modelValue', json);
}

defineExpose({ addRule });
</script>

<style scoped>
/* Scrollbar styling */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: var(--color-border-base);
  border-radius: var(--radius-xl);
}
</style>
