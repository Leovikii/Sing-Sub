import { Accordion, ActionIcon, Badge, Group, Select, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuleBucket, RulesetSource } from '../../../shared';
import { ResourceTime } from './ResourceTime';

type ManualKey = keyof RuleBucket;

interface Draft {
  sourceUrls: string;
  intervalHours: number;
  manual: Record<ManualKey, string>;
}

const manualKeys: ManualKey[] = ['domain', 'domain_suffix', 'domain_keyword', 'domain_regex'];

function lines(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function readSources(document: Record<string, unknown>): RulesetSource[] {
  const metadata = document._sing_sub;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const sources = (metadata as Record<string, unknown>).sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter((source): source is RulesetSource => Boolean(
    source && typeof source === 'object' && !Array.isArray(source)
    && typeof (source as Record<string, unknown>).url === 'string'
    && Number.isInteger((source as Record<string, unknown>).interval_hours),
  ));
}

function readDraft(content: string): { document: Record<string, unknown>; draft: Draft } {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const metadata = parsed._sing_sub && typeof parsed._sing_sub === 'object' && !Array.isArray(parsed._sing_sub)
    ? parsed._sing_sub as Record<string, unknown> : {};
  const manual = metadata.manual && typeof metadata.manual === 'object' && !Array.isArray(metadata.manual)
    ? metadata.manual as Record<string, unknown> : {};
  const sources = readSources(parsed);
  return {
    document: parsed,
    draft: {
      sourceUrls: sources.map((source) => source.url).join('\n'),
      intervalHours: sources[0]?.interval_hours ?? 0,
      manual: {
        domain: Array.isArray(manual.domain) ? manual.domain.filter((item): item is string => typeof item === 'string').join('\n') : '',
        domain_suffix: Array.isArray(manual.domain_suffix) ? manual.domain_suffix.filter((item): item is string => typeof item === 'string').join('\n') : '',
        domain_keyword: Array.isArray(manual.domain_keyword) ? manual.domain_keyword.filter((item): item is string => typeof item === 'string').join('\n') : '',
        domain_regex: Array.isArray(manual.domain_regex) ? manual.domain_regex.filter((item): item is string => typeof item === 'string').join('\n') : '',
      },
    },
  };
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.includes(':')) return true;
  const parts = normalized.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function validateSources(value: string, messages: { publicOnly: string; invalid: string; duplicate: string }) {
  const seen = new Set<string>();
  for (const raw of lines(value)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname || isPrivateHostname(url.hostname)) {
        return messages.publicOnly;
      }
    } catch {
      return messages.invalid;
    }
    if (seen.has(raw)) return messages.duplicate;
    seen.add(raw);
  }
  return null;
}

function latestSourceUpdate(sources: RulesetSource[]) {
  return sources.reduce<string | undefined>((latest, source) => {
    if (!source.last_updated || Number.isNaN(Date.parse(source.last_updated))) return latest;
    return !latest || Date.parse(source.last_updated) > Date.parse(latest) ? source.last_updated : latest;
  }, undefined);
}

export function RulesetEditor({
  value, now, onChange, onValidityChange,
}: {
  value: string;
  now: number;
  onChange: (value: string) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [{ document, draft: initialDraft }] = useState(() => readDraft(value));
  const [draft, setDraft] = useState(initialDraft);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const write = (next: Draft) => {
    setDraft(next);
    const error = validateSources(next.sourceUrls, {
      publicOnly: t('rulesets.publicHttpsOnly'),
      invalid: t('rulesets.invalidSourceUrl'),
      duplicate: t('rulesets.duplicateSourceUrl'),
    });
    setSourceError(error);
    onValidityChange(!error);
    if (error) return;

    const output = structuredClone(document);
    output.version = 2;
    const previousSources = new Map(readSources(output).map((source) => [source.url, source]));
    const sources = lines(next.sourceUrls).map((url) => {
      const previous = previousSources.get(url);
      return previous
        ? { ...previous, interval_hours: next.intervalHours }
        : { url, interval_hours: next.intervalHours };
    });
    const manual: Partial<RuleBucket> = {};
    for (const key of manualKeys) {
      const entries = lines(next.manual[key]);
      if (entries.length) manual[key] = entries;
    }
    const metadata = output._sing_sub && typeof output._sing_sub === 'object' && !Array.isArray(output._sing_sub)
      ? structuredClone(output._sing_sub as Record<string, unknown>) : {};
    metadata.sources = sources;
    if (Object.keys(manual).length) metadata.manual = manual;
    else delete metadata.manual;
    output._sing_sub = metadata;
    onChange(JSON.stringify(output, null, 2));
  };

  const sections: Array<{ key: ManualKey; label: string; description: string; placeholder: string }> = [
    { key: 'domain', label: 'DOMAIN', description: t('rulesets.domainDescription'), placeholder: 'example.com\nwww.example.com' },
    { key: 'domain_suffix', label: 'DOMAIN_SUFFIX', description: t('rulesets.domainSuffixDescription'), placeholder: 'example.com\ngoogle.com' },
    { key: 'domain_keyword', label: 'DOMAIN_KEYWORD', description: t('rulesets.domainKeywordDescription'), placeholder: 'google\nyoutube' },
    { key: 'domain_regex', label: 'DOMAIN_REGEX', description: t('rulesets.domainRegexDescription'), placeholder: '^www\\.example\\.com$' },
  ];
  const sourceMap = new Map(readSources(document).map((source) => [source.url, source]));
  const lastUpdated = latestSourceUpdate(lines(draft.sourceUrls).flatMap((url) => {
    const source = sourceMap.get(url);
    return source ? [source] : [];
  }));
  const defaultOpenSections = [
    ...(lines(draft.sourceUrls).length ? ['source'] : []),
    ...manualKeys.filter((key) => lines(draft.manual[key]).length),
  ];

  return (
    <Accordion multiple defaultValue={defaultOpenSections} variant="separated" radius="md" order={3}>
      <Accordion.Item value="source">
        <Accordion.Control>
          <Group gap="xs"><Badge variant="light" color="violet">SOURCE</Badge><Text size="sm" c="dimmed">{t('rulesets.sourceDescription')}</Text></Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Textarea
              aria-label="SOURCE" autosize minRows={5}
              placeholder="https://raw.githubusercontent.com/.../ruleset.json"
              value={draft.sourceUrls} error={sourceError}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
              onChange={(event) => write({ ...draft, sourceUrls: event.currentTarget.value })}
            />
            <Group gap="xs" align="center" wrap="wrap" data-testid="ruleset-source-controls">
              <Stack gap={2} flex="1 1 10rem" miw={0}>
                <ResourceTime value={lastUpdated} now={now} labelKey="rulesets.sourceUpdated" />
              </Stack>
              <Select
                size="xs" w="8rem" flex="0 0 8rem" aria-label={t('rulesets.sourceInterval')}
                value={String(draft.intervalHours)}
                data={[
                  { value: '0', label: t('rulesets.intervalNever') },
                  { value: '24', label: t('rulesets.intervalDaily') },
                  { value: '168', label: t('rulesets.intervalWeekly') },
                  { value: '720', label: t('rulesets.intervalMonthly') },
                  { value: '8760', label: t('rulesets.intervalYearly') },
                ]}
                onChange={(value) => write({ ...draft, intervalHours: Number(value ?? 0) })}
              />
              {draft.sourceUrls && (
                <Tooltip label={t('rulesets.removeSection', { section: 'SOURCE' })}>
                  <ActionIcon size={44} color="red" variant="subtle" aria-label={t('rulesets.removeSection', { section: 'SOURCE' })} onClick={() => write({ ...draft, sourceUrls: '', intervalHours: 0 })}>
                    <Trash2 size={17} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            <Text size="xs" c="dimmed">{t('rulesets.sourceRefreshHint')}</Text>
            {lines(draft.sourceUrls).length > 1 && lines(draft.sourceUrls).map((url, index) => (
              <Stack key={`${index}-${url}`} gap={2}>
                <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{url}</Text>
                <ResourceTime value={sourceMap.get(url)?.last_updated} now={now} labelKey="rulesets.sourceUpdated" />
              </Stack>
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {sections.map((section) => (
        <Accordion.Item key={section.key} value={section.key}>
          <Accordion.Control>
            <Group gap="xs"><Badge variant="light" color="blue">{section.label}</Badge><Text size="sm" c="dimmed">{section.description}</Text></Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Textarea
                aria-label={section.label} autosize minRows={5}
                placeholder={section.placeholder} value={draft.manual[section.key]}
                styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                onChange={(event) => write({ ...draft, manual: { ...draft.manual, [section.key]: event.currentTarget.value } })}
              />
              {draft.manual[section.key] && (
                <Group justify="flex-end">
                  <Tooltip label={t('rulesets.removeSection', { section: section.label })}>
                    <ActionIcon
                      color="red" variant="subtle" aria-label={t('rulesets.removeSection', { section: section.label })}
                      onClick={() => write({ ...draft, manual: { ...draft.manual, [section.key]: '' } })}
                    ><Trash2 size={17} /></ActionIcon>
                  </Tooltip>
                </Group>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
