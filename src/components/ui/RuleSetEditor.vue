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
            <span class="truncate text-xs text-text-muted">每行一个 HTTPS URL，保存时会下载校验。</span>
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
          v-model="sourceUrlsContent"
          :readonly="readonly"
          placeholder="https://raw.githubusercontent.com/.../ruleset.json&#10;https://raw.githubusercontent.com/.../another-ruleset.json"
          class="min-h-0 flex-1 resize-none rounded-md border border-bg-elevated bg-[#0a0a0a] p-3 font-mono text-sm text-[#e5e5ea] placeholder:text-[#48484a] focus:border-brand-pink focus:outline-none"
          @input="emitChange"
        ></textarea>
        <p v-if="sourceLastUpdated" class="mt-2 text-xs text-text-muted">最近更新 {{ formatUpdatedAt(sourceLastUpdated) }}</p>
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

interface RuleBucket { domain: string[]; domain_suffix: string[] }

interface SourceConfig {
  url: string;
  interval_hours: number;
  last_updated?: string;
}

const sourceUrlsContent = ref('');
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

function readSources(document: Record<string, unknown>): SourceConfig[] {
  const metadata = document._sing_sub;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const sources = (metadata as Record<string, unknown>).sources;
  if (!Array.isArray(sources)) return [];
  const validSources: SourceConfig[] = [];
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
    const entry = source as Record<string, unknown>;
    if (typeof entry.url !== 'string' || !Number.isInteger(entry.interval_hours) ||
        (entry.last_updated !== undefined && typeof entry.last_updated !== 'string')) {
      return [];
    }
    validSources.push({
      url: entry.url,
      interval_hours: entry.interval_hours as number,
      ...(typeof entry.last_updated === 'string' ? { last_updated: entry.last_updated } : {}),
    });
  }
  return validSources;
}

function readManual(document: Record<string, unknown>): RuleBucket {
  const metadata = document._sing_sub as Record<string, unknown> | undefined;
  const manual = metadata?.manual as Record<string, unknown> | undefined;
  return {
    domain: Array.isArray(manual?.domain) ? manual.domain.filter((value): value is string => typeof value === 'string') : [],
    domain_suffix: Array.isArray(manual?.domain_suffix) ? manual.domain_suffix.filter((value): value is string => typeof value === 'string') : [],
  };
}

watch(() => props.modelValue, (newValue) => {
  if (!newValue || newValue === lastEmitted) return;
  try {
    const parsed = JSON.parse(newValue) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const document = parsed as Record<string, unknown>;
    const sources = readSources(document);
    const manual = readManual(document);

    sourceDocument.value = document;
    sourceUrlsContent.value = sources.map(source => source.url).join('\n');
    sourceIntervalHours.value = sources[0]?.interval_hours || 0;
    sourceLastUpdated.value = sources.map(source => source.last_updated).filter((value): value is string => !!value).sort().at(-1);
    domainContent.value = manual.domain.join('\n');
    domainSuffixContent.value = manual.domain_suffix.join('\n');
    sourceError.value = '';
    emit('validity-change', true);
  } catch {
    emit('validity-change', false);
  }
}, { immediate: true });

function lines(content: string) {
  return content.split('\n').map(value => value.trim()).filter(Boolean);
}

function validateSourceUrls(urls: string): string | null {
  const values = lines(urls);
  const seen = new Set<string>();
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || isPrivateHostname(url.hostname)) {
        return '来源仅支持公网 HTTPS URL。';
      }
    } catch {
      return '每行必须是完整的 HTTPS URL。';
    }
    if (seen.has(value)) return '来源 URL 不能重复。';
    seen.add(value);
  }
  return null;
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.includes(':')) return true;
  const parts = normalized.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
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
  output.version = 2;

  const sourceUrls = lines(sourceUrlsContent.value);
  const localValidationError = validateSourceUrls(sourceUrlsContent.value);
  if (localValidationError) {
    sourceError.value = localValidationError;
    emit('validity-change', false);
    return;
  }

  const previousSources = new Map(readSources(output).map(source => [source.url, source]));
  const nextSources = sourceUrls.map(url => {
    const previous = previousSources.get(url);
    const changed = !previous || previous.interval_hours !== sourceIntervalHours.value;
    return changed
      ? { url, interval_hours: sourceIntervalHours.value }
      : previous;
  });
  sourceLastUpdated.value = nextSources.map(source => source.last_updated).filter((value): value is string => !!value).sort().at(-1);
  const manual: RuleBucket = { domain: lines(domainContent.value), domain_suffix: lines(domainSuffixContent.value) };

  const metadata = output._sing_sub && typeof output._sing_sub === 'object' && !Array.isArray(output._sing_sub)
    ? clone(output._sing_sub as Record<string, unknown>)
    : {};
  metadata.manual = manual;
  metadata.sources = nextSources;
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
