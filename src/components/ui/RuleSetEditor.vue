<template>
  <div class="ruleset-editor flex h-full min-h-0 flex-col bg-transparent">
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <Loader2 class="h-8 w-8 animate-spin text-brand-pink" />
    </div>
    <div v-else class="grid min-h-0 flex-1 grid-rows-[minmax(11rem,0.8fr)_minmax(13rem,1fr)_minmax(13rem,1fr)] gap-4 overflow-y-auto p-4">
      <section class="glass flex min-h-0 flex-col rounded-xl border border-border-base p-4">
        <div class="mb-3 flex items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-2">
            <span class="rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-purple-400">SOURCE</span>
            <span class="truncate text-xs text-text-muted">来源地址会按设定间隔自动拉取并重新编译。</span>
          </div>
          <Select
            v-if="!readonly"
            :modelValue="String(sourceIntervalHours)"
            :options="sourceIntervalOptions"
            size="compact"
            class="w-40 shrink-0"
            @update:modelValue="updateSourceInterval"
          />
        </div>
        <textarea
          v-model="sourceUrl"
          :readonly="readonly"
          placeholder="https://raw.githubusercontent.com/.../ruleset.json"
          class="min-h-0 flex-1 resize-none rounded-md border border-bg-elevated bg-[#0a0a0a] p-3 font-mono text-sm text-[#e5e5ea] placeholder:text-[#48484a] focus:border-brand-pink focus:outline-none"
          @input="emitChange"
        ></textarea>
        <p v-if="sourceLastUpdated" class="mt-2 text-xs text-text-muted">上次 {{ formatUpdatedAt(sourceLastUpdated) }}</p>
        <p v-if="sourceError" class="mt-2 text-xs text-danger">{{ sourceError }}</p>
      </section>

      <section class="glass flex min-h-0 flex-col rounded-xl border border-border-base p-4">
        <div class="mb-3 flex items-center gap-2">
          <span class="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-blue-400">DOMAIN</span>
          <span class="text-xs text-text-muted">每行一个完整域名。</span>
        </div>
        <textarea
          v-model="domainContent"
          :readonly="readonly"
          placeholder="example.com&#10;www.example.com"
          class="min-h-0 flex-1 resize-none rounded-md border border-bg-elevated bg-[#0a0a0a] p-3 font-mono text-sm text-[#e5e5ea] placeholder:text-[#48484a] focus:border-brand-pink focus:outline-none"
          @input="emitChange"
        ></textarea>
      </section>

      <section class="glass flex min-h-0 flex-col rounded-xl border border-border-base p-4">
        <div class="mb-3 flex items-center gap-2">
          <span class="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-blue-400">DOMAIN_SUFFIX</span>
          <span class="text-xs text-text-muted">每行一个域名后缀。</span>
        </div>
        <textarea
          v-model="domainSuffixContent"
          :readonly="readonly"
          placeholder=".example.com&#10;.google.com"
          class="min-h-0 flex-1 resize-none rounded-md border border-bg-elevated bg-[#0a0a0a] p-3 font-mono text-sm text-[#e5e5ea] placeholder:text-[#48484a] focus:border-brand-pink focus:outline-none"
          @input="emitChange"
        ></textarea>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import Select from './Select.vue';

const props = defineProps<{
  modelValue: string;
  loading?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'validity-change': [value: boolean];
}>();

type ImportedRule = { domain: string[] } | { domain_suffix: string[] };

interface SourceConfig {
  url: string;
  interval_hours: number;
  last_updated?: string;
  rules: ImportedRule[];
}

const sourceUrl = ref('');
const sourceIntervalHours = ref(0);
const sourceLastUpdated = ref<string | undefined>();
const domainContent = ref('');
const domainSuffixContent = ref('');
const sourceError = ref('');
const sourceDocument = ref<Record<string, unknown>>({});
let lastEmitted: string | null = null;

const sourceIntervalOptions = [
  { label: '不自动更新', value: '0' },
  { label: '每天', value: '24' },
  { label: '每周', value: '168' },
  { label: '每月', value: '720' },
  { label: '每年', value: '8760' },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ruleKey(rule: unknown) {
  return JSON.stringify(rule);
}

function isImportedRule(rule: unknown): rule is ImportedRule {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
  const entries = Object.entries(rule as Record<string, unknown>);
  return entries.length === 1 &&
    (entries[0][0] === 'domain' || entries[0][0] === 'domain_suffix') &&
    Array.isArray(entries[0][1]) && entries[0][1].every(item => typeof item === 'string' && item.trim());
}

function readSource(document: Record<string, unknown>): SourceConfig | null {
  const metadata = document._sing_sub;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const sources = (metadata as Record<string, unknown>).sources;
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const source = sources[0];
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const entry = source as Record<string, unknown>;
  if (typeof entry.url !== 'string' || !Number.isInteger(entry.interval_hours) || !Array.isArray(entry.rules) || !entry.rules.every(isImportedRule)) {
    return null;
  }
  return clone(entry as unknown as SourceConfig);
}

function appendRuleValues(rule: unknown, domainLines: string[], suffixLines: string[]) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
  const entries = Object.entries(rule as Record<string, unknown>);
  if (entries.length !== 1 || !Array.isArray(entries[0][1]) || !entries[0][1].every(value => typeof value === 'string')) return false;
  if (entries[0][0] === 'domain') domainLines.push(...entries[0][1] as string[]);
  else if (entries[0][0] === 'domain_suffix') suffixLines.push(...entries[0][1] as string[]);
  else return false;
  return true;
}

watch(() => props.modelValue, (newValue) => {
  if (!newValue || newValue === lastEmitted) return;
  try {
    const parsed = JSON.parse(newValue) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const document = parsed as Record<string, unknown>;
    const source = readSource(document);
    const sourceRules = source?.rules || [];
    const sourceRuleCounts = new Map<string, number>();
    for (const rule of sourceRules) {
      const key = ruleKey(rule);
      sourceRuleCounts.set(key, (sourceRuleCounts.get(key) || 0) + 1);
    }

    const domains: string[] = [];
    const suffixes: string[] = [];
    for (const rule of Array.isArray(document.rules) ? document.rules : []) {
      const key = ruleKey(rule);
      const count = sourceRuleCounts.get(key) || 0;
      if (count > 0) {
        sourceRuleCounts.set(key, count - 1);
        continue;
      }
      if (!appendRuleValues(rule, domains, suffixes)) throw new Error('Unsupported rule');
    }

    sourceDocument.value = document;
    sourceUrl.value = source?.url || '';
    sourceIntervalHours.value = source?.interval_hours || 0;
    sourceLastUpdated.value = source?.last_updated;
    domainContent.value = domains.join('\n');
    domainSuffixContent.value = suffixes.join('\n');
    sourceError.value = '';
    emit('validity-change', true);
  } catch {
    emit('validity-change', false);
  }
}, { immediate: true });

function lines(content: string) {
  return content.split('\n').map(value => value.trim()).filter(Boolean);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function updateSourceInterval(value: string) {
  sourceIntervalHours.value = Number(value);
  emitChange();
}

function emitChange() {
  const output = clone(sourceDocument.value || {}) as Record<string, unknown>;
  if (output.version === undefined) output.version = 4;

  const source = readSource(output);
  const url = sourceUrl.value.trim();
  if (url && /\s/.test(url)) {
    sourceError.value = '每个来源只能填写一个 URL。';
    emit('validity-change', false);
    return;
  }

  const sourceChanged = !source || source.url !== url;
  if (sourceChanged) sourceLastUpdated.value = undefined;
  let nextSource: SourceConfig | null = null;
  if (url) {
    nextSource = sourceChanged || !source
      ? { url, interval_hours: sourceIntervalHours.value, rules: [] }
      : {
          url,
          interval_hours: sourceIntervalHours.value,
          last_updated: source.last_updated,
          rules: source.rules,
        };
  }
  const manualRules: ImportedRule[] = [
    ...(lines(domainContent.value).length > 0 ? [{ domain: lines(domainContent.value) }] : []),
    ...(lines(domainSuffixContent.value).length > 0 ? [{ domain_suffix: lines(domainSuffixContent.value) }] : []),
  ];
  output.rules = [...manualRules, ...(nextSource?.rules || [])];

  const metadata = output._sing_sub && typeof output._sing_sub === 'object' && !Array.isArray(output._sing_sub)
    ? clone(output._sing_sub as Record<string, unknown>)
    : {};
  if (nextSource) metadata.sources = [nextSource];
  else delete metadata.sources;
  if (Object.keys(metadata).length > 0) output._sing_sub = metadata;
  else delete output._sing_sub;

  sourceError.value = '';
  const json = JSON.stringify(output, null, 2);
  sourceDocument.value = output;
  lastEmitted = json;
  emit('validity-change', true);
  emit('update:modelValue', json);
}
</script>

<style scoped>
.overflow-y-auto::-webkit-scrollbar { width: 6px; }
.overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
.overflow-y-auto::-webkit-scrollbar-thumb { background-color: var(--color-border-base); border-radius: var(--radius-xl); }
</style>
