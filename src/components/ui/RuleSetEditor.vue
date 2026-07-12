<template>
  <div class="ruleset-editor flex h-full min-h-0 flex-col bg-transparent">
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <Loader2 class="h-8 w-8 animate-spin text-brand-pink" />
    </div>
    <div v-else class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <section
        data-rule-section="source"
        class="glass flex shrink-0 flex-col rounded-lg border border-border-base p-4"
        :class="isSectionVisible('source') ? 'min-h-[13rem]' : 'min-h-0'"
      >
        <div class="flex min-h-9 items-center justify-between gap-4" :class="isSectionVisible('source') ? 'mb-3' : ''">
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-purple-400">SOURCE</span>
            <span class="truncate text-xs text-text-muted">
              {{ sourceLastUpdated ? `最近更新 ${formatUpdatedAt(sourceLastUpdated)}` : '每行一个 HTTPS URL。' }}
            </span>
          </div>
          <div v-if="!readonly" class="flex shrink-0 items-center gap-2">
            <Select
              v-if="isSectionVisible('source')"
              :modelValue="String(sourceIntervalHours)"
              :options="sourceIntervalOptions"
              size="compact"
              class="w-40"
              @update:modelValue="updateSourceInterval"
            />
            <ToolbarButton
              :icon="isSectionVisible('source') ? Trash2 : Plus"
              :label="isSectionVisible('source') ? '删除 SOURCE' : '新增 SOURCE'"
              :variant="isSectionVisible('source') ? 'danger' : 'secondary'"
              iconOnly
              showTooltip
              @click="isSectionVisible('source') ? clearSection('source') : openSection('source')"
            />
          </div>
        </div>
        <template v-if="isSectionVisible('source')">
          <textarea
            v-model="sourceUrlsContent"
            :readonly="readonly"
            placeholder="https://raw.githubusercontent.com/.../ruleset.json&#10;https://raw.githubusercontent.com/.../another-ruleset.json"
            class="min-h-[9rem] shrink-0 resize-none rounded-md border border-bg-elevated bg-[#0a0a0a] p-3 font-mono text-sm text-[#e5e5ea] placeholder:text-[#48484a] focus:border-brand-pink focus:outline-none"
            @input="emitChange"
          ></textarea>
          <p v-if="sourceError" class="mt-2 text-xs text-danger">{{ sourceError }}</p>
        </template>
      </section>

      <section
        v-for="section in manualSections"
        :key="section.key"
        :data-rule-section="section.key"
        class="glass flex shrink-0 flex-col rounded-lg border border-border-base p-4"
        :class="isSectionVisible(section.key) ? 'min-h-[13rem]' : 'min-h-0'"
      >
        <div class="flex min-h-9 items-center justify-between gap-4" :class="isSectionVisible(section.key) ? 'mb-3' : ''">
          <div class="flex min-w-0 items-center gap-2">
            <span class="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-blue-400">{{ section.label }}</span>
            <span class="truncate text-xs text-text-muted">{{ section.description }}</span>
          </div>
          <ToolbarButton
            v-if="!readonly"
            :icon="isSectionVisible(section.key) ? Trash2 : Plus"
            :label="`${isSectionVisible(section.key) ? '删除' : '新增'} ${section.label}`"
            :variant="isSectionVisible(section.key) ? 'danger' : 'secondary'"
            iconOnly
            showTooltip
            @click="isSectionVisible(section.key) ? clearSection(section.key) : openSection(section.key)"
          />
        </div>
        <textarea
          v-if="isSectionVisible(section.key)"
          :value="getSectionContent(section.key)"
          :readonly="readonly"
          :placeholder="section.placeholder"
          class="min-h-[9rem] flex-1 resize-none rounded-md border border-bg-elevated bg-[#0a0a0a] p-3 font-mono text-sm text-[#e5e5ea] placeholder:text-[#48484a] focus:border-brand-pink focus:outline-none"
          @input="updateSectionContent(section.key, $event)"
        ></textarea>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { Loader2, Plus, Trash2 } from 'lucide-vue-next';
import Select from './Select.vue';
import ToolbarButton from './ToolbarButton.vue';

const props = defineProps<{
  modelValue: string;
  loading?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'validity-change': [value: boolean];
}>();

interface RuleBucket {
  domain: string[];
  domain_suffix: string[];
  domain_keyword: string[];
  domain_regex: string[];
}

type ManualSectionKey = keyof RuleBucket;
type SectionKey = 'source' | ManualSectionKey;

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
const domainKeywordContent = ref('');
const domainRegexContent = ref('');
const sourceError = ref('');
const sourceDocument = ref<Record<string, unknown>>({});
const openSections = ref<Set<SectionKey>>(new Set());
let lastEmitted: string | null = null;

const sourceIntervalOptions = [
  { label: '不自动更新', value: '0' },
  { label: '每天', value: '24' },
  { label: '每周', value: '168' },
  { label: '每月', value: '720' },
  { label: '每年', value: '8760' },
];

const manualSections: Array<{
  key: ManualSectionKey;
  label: string;
  description: string;
  placeholder: string;
}> = [
  { key: 'domain', label: 'DOMAIN', description: '每行一个完整域名。', placeholder: 'example.com\nwww.example.com' },
  { key: 'domain_suffix', label: 'DOMAIN_SUFFIX', description: '每行一个域名后缀。', placeholder: '.example.com\n.google.com' },
  { key: 'domain_keyword', label: 'DOMAIN_KEYWORD', description: '每行一个域名关键字。', placeholder: 'google\nyoutube' },
  { key: 'domain_regex', label: 'DOMAIN_REGEX', description: '每行一个 RE2 域名正则表达式。', placeholder: '^www\\.example\\.com$' },
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
    domain_keyword: Array.isArray(manual?.domain_keyword) ? manual.domain_keyword.filter((value): value is string => typeof value === 'string') : [],
    domain_regex: Array.isArray(manual?.domain_regex) ? manual.domain_regex.filter((value): value is string => typeof value === 'string') : [],
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
    domainKeywordContent.value = manual.domain_keyword.join('\n');
    domainRegexContent.value = manual.domain_regex.join('\n');
    openSections.value = new Set();
    sourceError.value = '';
    emit('validity-change', true);
  } catch {
    emit('validity-change', false);
  }
}, { immediate: true });

function lines(content: string) {
  return content.split('\n').map(value => value.trim()).filter(Boolean);
}

function getSectionContent(key: SectionKey): string {
  switch (key) {
    case 'source': return sourceUrlsContent.value;
    case 'domain': return domainContent.value;
    case 'domain_suffix': return domainSuffixContent.value;
    case 'domain_keyword': return domainKeywordContent.value;
    case 'domain_regex': return domainRegexContent.value;
  }
}

function setSectionContent(key: SectionKey, value: string) {
  switch (key) {
    case 'source': sourceUrlsContent.value = value; break;
    case 'domain': domainContent.value = value; break;
    case 'domain_suffix': domainSuffixContent.value = value; break;
    case 'domain_keyword': domainKeywordContent.value = value; break;
    case 'domain_regex': domainRegexContent.value = value; break;
  }
}

function setSectionOpen(key: SectionKey, open: boolean) {
  const next = new Set(openSections.value);
  if (open) next.add(key);
  else next.delete(key);
  openSections.value = next;
}

function hasSectionContent(key: SectionKey): boolean {
  return lines(getSectionContent(key)).length > 0;
}

function isSectionVisible(key: SectionKey): boolean {
  return hasSectionContent(key) || openSections.value.has(key);
}

async function openSection(key: SectionKey) {
  setSectionOpen(key, true);
  await nextTick();
  document.querySelector<HTMLTextAreaElement>(`[data-rule-section="${key}"] textarea`)?.focus();
}

function clearSection(key: SectionKey) {
  setSectionContent(key, '');
  setSectionOpen(key, false);
  if (key === 'source') {
    sourceIntervalHours.value = 0;
    sourceLastUpdated.value = undefined;
    sourceError.value = '';
  }
  emitChange();
}

function updateSectionContent(key: ManualSectionKey, event: Event) {
  setSectionContent(key, (event.target as HTMLTextAreaElement).value);
  emitChange();
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
  const manual: Partial<RuleBucket> = {};
  const manualFields: Array<[keyof RuleBucket, string]> = [
    ['domain', domainContent.value],
    ['domain_suffix', domainSuffixContent.value],
    ['domain_keyword', domainKeywordContent.value],
    ['domain_regex', domainRegexContent.value],
  ];
  for (const [field, content] of manualFields) {
    const entries = lines(content);
    if (entries.length) manual[field] = entries;
  }

  const metadata = output._sing_sub && typeof output._sing_sub === 'object' && !Array.isArray(output._sing_sub)
    ? clone(output._sing_sub as Record<string, unknown>)
    : {};
  if (Object.keys(manual).length) metadata.manual = manual;
  else delete metadata.manual;
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
