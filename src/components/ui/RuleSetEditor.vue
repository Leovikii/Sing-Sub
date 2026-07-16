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
        <div
          class="flex min-h-9 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          :class="isSectionVisible('source') ? 'mb-3' : ''"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-purple-400">SOURCE</span>
            <span class="min-w-0 text-xs text-text-muted sm:truncate">
              {{ sourceLastUpdated ? t('rulesets.sourceUpdated', { time: formatUpdatedAt(sourceLastUpdated) }) : t('rulesets.sourceDescription') }}
            </span>
          </div>
          <div v-if="!readonly" class="flex min-w-0 items-center justify-between gap-2 sm:shrink-0 sm:justify-end">
            <PrimeSelect
              v-if="isSectionVisible('source')"
              :modelValue="String(sourceIntervalHours)"
              :options="sourceIntervalOptions"
              option-label="label"
              option-value="value"
              size="small"
              :aria-label="t('rulesets.sourceInterval')"
              class="min-w-0 flex-1 sm:w-40 sm:flex-none"
              @update:modelValue="updateSourceInterval"
            />
            <Button
              :severity="isSectionVisible('source') ? 'danger' : 'secondary'"
              text
              rounded
              :aria-label="t(isSectionVisible('source') ? 'rulesets.removeSection' : 'rulesets.addSection', { section: 'SOURCE' })"
              v-tooltip.top="t(isSectionVisible('source') ? 'rulesets.removeSection' : 'rulesets.addSection', { section: 'SOURCE' })"
              @click="isSectionVisible('source') ? clearSection('source') : openSection('source')"
            >
              <Trash2 v-if="isSectionVisible('source')" :size="18" aria-hidden="true" />
              <Plus v-else :size="18" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <template v-if="isSectionVisible('source')">
          <textarea
            v-model="sourceUrlsContent"
            :readonly="readonly"
            placeholder="https://raw.githubusercontent.com/.../ruleset.json&#10;https://raw.githubusercontent.com/.../another-ruleset.json"
            class="min-h-[9rem] shrink-0 resize-none rounded-md border border-bg-elevated bg-bg-code-toolbar p-3 font-mono text-sm text-text-primary placeholder:text-text-subtle focus:border-brand-pink focus:outline-none"
            @input="scheduleEmitChange"
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
        <div class="flex min-h-9 items-center justify-between gap-3" :class="isSectionVisible(section.key) ? 'mb-3' : ''">
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-blue-400">{{ section.label }}</span>
            <span class="min-w-0 text-xs text-text-muted sm:truncate">{{ section.description }}</span>
          </div>
          <Button
            v-if="!readonly"
            :severity="isSectionVisible(section.key) ? 'danger' : 'secondary'"
            text
            rounded
            :aria-label="t(isSectionVisible(section.key) ? 'rulesets.removeSection' : 'rulesets.addSection', { section: section.label })"
            v-tooltip.top="t(isSectionVisible(section.key) ? 'rulesets.removeSection' : 'rulesets.addSection', { section: section.label })"
            @click="isSectionVisible(section.key) ? clearSection(section.key) : openSection(section.key)"
          >
            <Trash2 v-if="isSectionVisible(section.key)" :size="18" aria-hidden="true" />
            <Plus v-else :size="18" aria-hidden="true" />
          </Button>
        </div>
        <textarea
          v-if="isSectionVisible(section.key)"
          :value="getSectionContent(section.key)"
          :readonly="readonly"
          :placeholder="section.placeholder"
          class="min-h-[9rem] flex-1 resize-none rounded-md border border-bg-elevated bg-bg-code-toolbar p-3 font-mono text-sm text-text-primary placeholder:text-text-subtle focus:border-brand-pink focus:outline-none"
          @input="updateSectionContent(section.key, $event)"
        ></textarea>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2, Plus, Trash2 } from 'lucide-vue-next';
import Button from 'primevue/button';
import PrimeSelect from 'primevue/select';
import type { RuleBucket, RulesetSource } from '../../../shared';

const { t, locale } = useI18n();

const props = defineProps<{
  modelValue: string;
  loading?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'validity-change': [value: boolean];
  'dirty-input': [];
}>();

type ManualSectionKey = keyof RuleBucket;
type SectionKey = 'source' | ManualSectionKey;

type SourceConfig = RulesetSource;

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
let emitTimer: ReturnType<typeof window.setTimeout> | null = null;

const sourceIntervalOptions = computed(() => [
  { label: t('rulesets.intervalNever'), value: '0' },
  { label: t('rulesets.intervalDaily'), value: '24' },
  { label: t('rulesets.intervalWeekly'), value: '168' },
  { label: t('rulesets.intervalMonthly'), value: '720' },
  { label: t('rulesets.intervalYearly'), value: '8760' },
]);

const manualSections = computed<Array<{
  key: ManualSectionKey;
  label: string;
  description: string;
  placeholder: string;
}>>(() => [
  { key: 'domain', label: 'DOMAIN', description: t('rulesets.domainDescription'), placeholder: 'example.com\nwww.example.com' },
  { key: 'domain_suffix', label: 'DOMAIN_SUFFIX', description: t('rulesets.domainSuffixDescription'), placeholder: '.example.com\n.google.com' },
  { key: 'domain_keyword', label: 'DOMAIN_KEYWORD', description: t('rulesets.domainKeywordDescription'), placeholder: 'google\nyoutube' },
  { key: 'domain_regex', label: 'DOMAIN_REGEX', description: t('rulesets.domainRegexDescription'), placeholder: '^www\\.example\\.com$' },
]);

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
  scheduleEmitChange();
}

function clearEmitTimer() {
  if (emitTimer !== null) {
    window.clearTimeout(emitTimer);
    emitTimer = null;
  }
}

function scheduleEmitChange() {
  emit('dirty-input');
  clearEmitTimer();
  emitTimer = window.setTimeout(() => {
    emitTimer = null;
    emitChange();
  }, 180);
}

function flushPendingChange() {
  if (emitTimer === null) return;
  clearEmitTimer();
  emitChange();
}

function validateSourceUrls(urls: string): string | null {
  const values = lines(urls);
  const seen = new Set<string>();
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || isPrivateHostname(url.hostname)) {
        return t('rulesets.publicHttpsOnly');
      }
    } catch {
      return t('rulesets.invalidSourceUrl');
    }
    if (seen.has(value)) return t('rulesets.duplicateSourceUrl');
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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value);
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

defineExpose({ flushPendingChange });
</script>

<style scoped>
.overflow-y-auto::-webkit-scrollbar { width: 6px; }
.overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
.overflow-y-auto::-webkit-scrollbar-thumb { background-color: var(--color-border-base); border-radius: var(--radius-xl); }
</style>
