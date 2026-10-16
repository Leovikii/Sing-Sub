import { Alert, Button, Accordion, ActionIcon, Badge, Group, Select, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityMetadata, RuleBucket } from '../../../shared';
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

type RulesetSource = NonNullable<NonNullable<EntityMetadata['editor']>['ruleset']>['sources'][number];
function readDraft(definition: NonNullable<EntityMetadata['editor']>['ruleset']): Draft {
  return { sourceUrls: (definition?.sources ?? []).map(source => source.url).join('\n'),
    intervalHours: definition?.sources[0]?.intervalHours ?? 0,
    manual: Object.fromEntries(manualKeys.map(key => [key, (definition?.manual[key] ?? []).join('\n')])) as Draft['manual'],
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
    if (!source.lastFetchedAt || Number.isNaN(Date.parse(source.lastFetchedAt))) return latest;
    return !latest || Date.parse(source.lastFetchedAt) > Date.parse(latest) ? source.lastFetchedAt : latest;
  }, undefined);
}

export function RulesetEditor({
  value, metadata, now, onChange, onValidityChange,
}: {
  value: string;
  metadata?: EntityMetadata['editor'];
  now: number;
  onChange: (value: string, metadata: EntityMetadata['editor']) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [review, setReview] = useState(Boolean(metadata?.ruleset?.needsReview || (!metadata?.ruleset && (JSON.parse(value).rules?.length ?? 0))));
  const [document] = useState(() => JSON.parse(value) as Record<string, unknown>);
  const [sources] = useState(metadata?.ruleset?.sources ?? []);
  const [draft, setDraft] = useState(() => readDraft(metadata?.ruleset));
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
    const previousSources = new Map(sources.map(source => [source.url, source]));
    const nextSources = lines(next.sourceUrls).map((url) => {
      const previous = previousSources.get(url);
      return previous
        ? { ...previous, intervalHours: next.intervalHours as RulesetSource['intervalHours'] }
        : { url, intervalHours: next.intervalHours as RulesetSource['intervalHours'] };
    });
    const manual: Partial<RuleBucket> = {};
    for (const key of manualKeys) {
      const entries = lines(next.manual[key]);
      if (entries.length) manual[key] = entries;
    }
    onChange(JSON.stringify(output, null, 2), { ...metadata, ruleset: { manual, sources: nextSources } });
  };

  const resolveReview = (choice: 'body' | 'sources') => {
    let next = draft;
    if (choice === 'body') {
      const rules = document.rules;
      if (!Array.isArray(rules) || rules.some(rule => !rule || typeof rule !== 'object' || Object.entries(rule).some(([key, values]) => !manualKeys.includes(key as ManualKey) || !Array.isArray(values) || values.some(item => typeof item !== 'string')))) {
        setSourceError(t('rulesets.reviewUnsupported')); return;
      }
      next = { sourceUrls: '', intervalHours: 0, manual: Object.fromEntries(manualKeys.map(key => [key, rules.flatMap(rule => (rule as Partial<RuleBucket>)[key] ?? []).join('\n')])) as Draft['manual'] };
    }
    setReview(false); write(next);
  };
  if (review) return <Alert color="yellow" title={t('rulesets.reviewTitle')}>
    <Stack gap="sm"><Text size="sm">{t('rulesets.reviewMessage')}</Text>
      {sourceError && <Text c="red" size="sm">{sourceError}</Text>}
      <Group><Button onClick={() => resolveReview('body')}>{t('rulesets.keepBody')}</Button>
        {metadata?.ruleset && <Button variant="default" onClick={() => resolveReview('sources')}>{t('rulesets.useSources')}</Button>}</Group>
    </Stack>
  </Alert>;

  const sections: Array<{ key: ManualKey; label: string; description: string; placeholder: string }> = [
    { key: 'domain', label: 'DOMAIN', description: t('rulesets.domainDescription'), placeholder: 'example.com\nwww.example.com' },
    { key: 'domain_suffix', label: 'DOMAIN_SUFFIX', description: t('rulesets.domainSuffixDescription'), placeholder: 'example.com\ngoogle.com' },
    { key: 'domain_keyword', label: 'DOMAIN_KEYWORD', description: t('rulesets.domainKeywordDescription'), placeholder: 'google\nyoutube' },
    { key: 'domain_regex', label: 'DOMAIN_REGEX', description: t('rulesets.domainRegexDescription'), placeholder: '^www\\.example\\.com$' },
  ];
  const sourceMap = new Map(sources.map(source => [source.url, source]));
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
                <ResourceTime value={sourceMap.get(url)?.lastFetchedAt} now={now} labelKey="rulesets.sourceUpdated" />
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
