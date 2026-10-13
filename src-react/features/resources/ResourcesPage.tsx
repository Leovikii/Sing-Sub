import {
  ActionIcon, Badge, Button, Card, Center, Code, Container, CopyButton, EmptyState, Group, Loader,
  Menu, Modal, ScrollArea, SegmentedControl, SimpleGrid, Stack, Text, Title, Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Boxes, Check, Link2, MoreHorizontal, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetSummary, RulesetBuildStatusResult, StateData } from '../../../shared';
import { api } from '../../../src/api/endpoints';
import { ApiClientError } from '../../../src/api/client';
import { EntityEditorHeader } from '../../components/EntityEditorChrome';
import { useAssetsStore } from '../../stores/assets';
import { useWorkspaceStore } from '../../stores/workspace';
import { RulesetEditor } from './RulesetEditor';
import { ResourceTime } from './ResourceTime';
import { useResourceClock } from './use-resource-clock';

const CodeEditor = lazy(() => import('../../components/CodeEditor/CodeEditor'));

export type ResourceType = 'node' | 'template' | 'ruleset';

const directoryByType: Record<ResourceType, 'nodes' | 'templates' | 'rulesets'> = {
  node: 'nodes', template: 'templates', ruleset: 'rulesets',
};
const titleKeyByType: Record<ResourceType, string> = {
  node: 'nav.nodes', template: 'nav.templates', ruleset: 'nav.rulesets',
};
const emptyKeyByType: Record<ResourceType, string> = {
  node: 'assets.nodesEmpty', template: 'assets.templatesEmpty', ruleset: 'assets.rulesetsEmpty',
};

interface EditorState {
  file: AssetSummary & { isNew?: boolean };
  name: string;
  note: string;
  content: string;
  originalContent: string;
  originalNote: string;
  sha: string | null;
  mode: 'edit' | 'preview';
  structuredValid: boolean;
  structuredDirty: boolean;
}

function basename(path: string) {
  return (path.split('/').pop() ?? path).replace(/\.json$/, '');
}

function initialContent(type: ResourceType) {
  if (type === 'ruleset') return '{\n  "version": 2,\n  "rules": [],\n  "_sing_sub": {\n    "sources": []\n  }\n}';
  return '{\n  "inbounds": [],\n  "outbounds": []\n}';
}

export function ResourcesPage({ type }: { type: ResourceType }) {
  const now = useResourceClock();
  const { t } = useTranslation();
  const mobile = useMediaQuery('(max-width: 48em)');
  const assets = useAssetsStore((state) => state.items);
  const loaded = useAssetsStore((state) => state.loaded);
  const loading = useAssetsStore((state) => state.loading);
  const replaceAssets = useAssetsStore((state) => state.replace);
  const setAssetsLoading = useAssetsStore((state) => state.setLoading);
  const revision = useWorkspaceStore((state) => state.revision);
  const workspaceState = useWorkspaceStore((state) => state.state);
  const replaceWorkspace = useWorkspaceStore((state) => state.replace);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [builds, setBuilds] = useState<Record<string, RulesetBuildStatusResult>>({});
  const [retryingRuleset, setRetryingRuleset] = useState('');
  const files = assets[directoryByType[type]];

  const refresh = useCallback(async () => {
    setAssetsLoading(true);
    try {
      replaceAssets(await api.getAssets());
    } catch {
      setAssetsLoading(false);
      notifications.show({ color: 'red', message: t('assets.loadFailed') });
    }
  }, [replaceAssets, setAssetsLoading, t]);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    if (type !== 'ruleset') return;
    let active = true;
    const load = async () => {
      const entries = await Promise.all(files.map(async (file) => {
        const id = basename(file.path);
        try { return [id, await api.getRulesetBuild(id)] as const; } catch { return null; }
      }));
      if (active) setBuilds(Object.fromEntries(entries.filter((entry) => entry !== null)));
    };
    void load();
    return () => { active = false; };
  }, [files, type]);

  const openFile = async (file: AssetSummary, mode: 'edit' | 'preview' = 'edit') => {
    setEditor({ file, name: basename(file.path), note: file.note, content: '', originalContent: '', originalNote: file.note, sha: null, mode, structuredValid: true, structuredDirty: false });
    try {
      const data = await api.getFile(file.path);
      let note = file.note;
      try {
        const document = JSON.parse(data.content) as Record<string, unknown>;
        note = type === 'ruleset'
          ? String((document._sing_sub as Record<string, unknown> | undefined)?.note ?? '')
          : String(document.note ?? '');
      } catch {
        // Keep the summary note for malformed legacy documents.
      }
      setEditor((current) => current?.file.path === file.path ? {
        ...current, content: data.content, originalContent: data.content, note, originalNote: note, sha: data.sha, structuredValid: true, structuredDirty: false,
      } : current);
    } catch (error) {
      setEditor(null);
      if (error instanceof ApiClientError && error.status === 404) void refresh();
      notifications.show({ color: 'red', message: t('assets.loadFailed') });
    }
  };

  const createFile = () => {
    const content = initialContent(type);
    setEditor({
      file: { path: `sing-sub/${directoryByType[type]}/untitled.json`, note: '', isNew: true },
      name: '', note: '', content, originalContent: content, originalNote: '', sha: null, mode: 'edit', structuredValid: true, structuredDirty: false,
    });
  };

  const dirty = Boolean(editor && (
    editor.content !== editor.originalContent || editor.structuredDirty || editor.note !== editor.originalNote
    || (editor.file.isNew ? editor.name !== '' : editor.name !== basename(editor.file.path))
  ));
  const valid = useMemo(() => {
    if (!editor || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(editor.name)) return false;
    try { JSON.parse(editor.content); return editor.structuredValid; } catch { return false; }
  }, [editor]);

  const closeEditor = () => setEditor(null);
  const requestClose = () => {
    if (!dirty) return closeEditor();
    modals.openConfirmModal({
      title: t('common.unsavedTitle'),
      children: <Text size="sm">{t('common.unsavedMessage')}</Text>,
      labels: { confirm: t('common.discard'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' }, centered: true, onConfirm: closeEditor,
    });
  };

  const save = async () => {
    if (!editor || !valid) return;
    if (!revision && !editor.sha) {
      notifications.show({ color: 'red', message: t('workspace.revisionMissing') });
      return;
    }
    setSaving(true);
    try {
      const document = JSON.parse(editor.content) as Record<string, unknown>;
      if (type === 'ruleset') {
        const metadata = document._sing_sub && typeof document._sing_sub === 'object' && !Array.isArray(document._sing_sub)
          ? { ...(document._sing_sub as Record<string, unknown>) } : {};
        if (editor.note) metadata.note = editor.note; else delete metadata.note;
        if (Object.keys(metadata).length) document._sing_sub = metadata; else delete document._sing_sub;
      } else {
        if (editor.note) document.note = editor.note; else delete document.note;
      }
      const content = JSON.stringify(document, null, 2);
      const path = `sing-sub/${directoryByType[type]}/${editor.name}.json`;
      const rename = !editor.file.isNew && path !== editor.file.path;
      const result = await api.putFile({
        path, content, expectedRevision: editor.sha ?? revision as string,
        sha: rename ? null : editor.sha,
        oldPath: rename ? editor.file.path : undefined,
        message: `${editor.file.isNew ? 'Create' : rename ? 'Rename' : 'Update'} ${editor.name}.json`,
      });
      replaceWorkspace(workspaceState, result.revision);
      await refresh();
      closeEditor();
      notifications.show({ color: result.warning ? 'yellow' : 'green', message: result.warning ?? t('assets.saved') });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        modals.openConfirmModal({
          title: t('common.conflictTitle'),
          children: <Text size="sm">{t('common.conflictMessage')}</Text>,
          labels: { confirm: t('common.reload'), cancel: t('common.cancel') },
          onConfirm: () => editor && void openFile(editor.file),
        });
      } else {
        notifications.show({ color: 'red', message: t('assets.saveFailed') });
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = (file: AssetSummary) => modals.openConfirmModal({
    title: t('assets.deleteTitle'),
    children: <Text size="sm">{t('assets.deleteConfirm', { name: basename(file.path) })}</Text>,
    labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
    confirmProps: { color: 'red' }, centered: true,
    onConfirm: async () => {
      if (!revision) return;
      try {
        const deleted = await api.deleteFile(file.path, revision);
        let nextRevision = deleted.revision;
        const nextState: StateData | null = workspaceState ? structuredClone(workspaceState) : null;
        if (nextState) {
          let changed = false;
          for (const profile of nextState.profiles) {
            if (type === 'node' && profile.nodesPath === file.path) { profile.nodesPath = ''; changed = true; }
            if (type === 'template' && profile.templateUrl === file.path) { profile.templateUrl = ''; changed = true; }
          }
          if (changed) nextRevision = (await api.saveState(nextState, nextRevision)).revision;
        }
        replaceWorkspace(nextState, nextRevision);
        await refresh();
        notifications.show({ color: 'green', message: t('common.delete') });
      } catch {
        notifications.show({ color: 'red', message: t('workspace.deleteFailed', { paths: file.path }) });
      }
    },
  });

  const retryBuild = async (file: AssetSummary) => {
    const id = basename(file.path);
    setRetryingRuleset(id);
    try {
      await api.retryRulesetBuild(id);
      const build = await api.getRulesetBuild(id);
      setBuilds((current) => ({ ...current, [id]: build }));
    } catch {
      notifications.show({ color: 'red', message: t('rulesets.retryBuild') });
    } finally {
      setRetryingRuleset('');
    }
  };

  const buildLabel = (file: AssetSummary) => {
    const status = builds[basename(file.path)]?.status ?? 'none';
    return status === 'none' ? t('rulesets.jsonOnly') : t(`rulesets.${status}`);
  };

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={1}>{t(titleKeyByType[type])}</Title>
          <Button leftSection={<Plus size={17} />} onClick={createFile}>{t('common.add')}</Button>
        </Group>
        {loading && !loaded ? (
          <Center py={80}><Loader /></Center>
        ) : files.length === 0 ? (
          <EmptyState icon={<Boxes />} title={t(emptyKeyByType[type])} variant="light" color="pink">
            <EmptyState.Actions><Button onClick={createFile}>{t('assets.newFile')}</Button></EmptyState.Actions>
          </EmptyState>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {files.map((file) => (
              <Card
                key={file.path} role="article" aria-label={basename(file.path)}
                withBorder radius="lg" padding="lg" pos="relative"
              >
                <UnstyledButton
                  aria-label={t('assets.previewFile', { name: basename(file.path) })}
                  onClick={() => void openFile(file, 'preview')}
                  pos="absolute" top={0} right={0} bottom={0} left={0}
                  style={{ zIndex: 1 }}
                />
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={4} miw={0}>
                    <Text fw={700} truncate>{basename(file.path)}</Text>
                  </Stack>
                  <Group gap={4} wrap="nowrap" pos="relative" style={{ zIndex: 2 }}>
                    <Tooltip label={t('common.edit')}>
                      <ActionIcon size={44} variant="subtle" aria-label={t('common.edit')} onClick={() => void openFile(file)}><Pencil size={18} /></ActionIcon>
                    </Tooltip>
                    <Menu position="bottom-end" shadow="md" transitionProps={{ transition: 'pop', duration: 120 }}>
                      <Menu.Target><ActionIcon size={44} variant="subtle" aria-label={t('common.moreActions')}><MoreHorizontal size={18} /></ActionIcon></Menu.Target>
                      <Menu.Dropdown><Menu.Item color="red" leftSection={<Trash2 size={16} />} onClick={() => remove(file)}>{t('assets.removeFile')}</Menu.Item></Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed" lineClamp={2} mt={4} mih="2.9em" style={{ overflowWrap: 'anywhere' }}>
                  {file.note}
                </Text>
                <Group mt="auto" pt="sm" justify="space-between" gap="xs">
                  <ResourceTime value={file.updatedAt} now={now} compact />
                {type === 'ruleset' && (() => {
                  const id = basename(file.path);
                  const build = builds[id];
                  const format = build?.formats.binary ? 'srs' : 'json';
                  const copyLabel = t(format === 'srs' ? 'assets.copySrs' : 'assets.copyJson');
                  return (
                    <Group gap="xs" wrap="wrap">
                      <Badge color={build?.status === 'failed' ? 'red' : build?.formats.binary ? 'teal' : 'gray'} variant="light">
                        {buildLabel(file)}
                      </Badge>
                      <Group gap="xs" pos="relative" style={{ zIndex: 2 }}>
                        <CopyButton value={`${window.location.origin}/rules/${encodeURIComponent(id)}.${format}`} timeout={1800}>
                          {({ copied, copy }) => (
                            <Button
                              h={44} variant="light" color={copied ? 'teal' : undefined}
                              aria-label={copied ? t('common.copied') : copyLabel}
                              leftSection={copied ? <Check size={15} /> : <Link2 size={15} />} onClick={copy}
                            >{format.toUpperCase()}</Button>
                          )}
                        </CopyButton>
                        {build?.status === 'failed' && (
                          <Tooltip label={t('rulesets.retryBuild')}>
                            <ActionIcon
                              size={44} color="red" variant="light" aria-label={t('rulesets.retryBuild')}
                              loading={retryingRuleset === id} onClick={() => void retryBuild(file)}
                            ><RotateCcw size={16} /></ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Group>
                  );
                })()}
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <Modal.Root
        opened={Boolean(editor)} onClose={requestClose}
        size="xl" fullScreen={mobile} transitionProps={{ transition: 'fade', duration: 120 }}
        closeOnClickOutside={false}
      >
        <Modal.Overlay />
        <Modal.Content aria-label={`${t(titleKeyByType[type])} ${editor?.name || t(editor?.file.isNew ? 'assets.newFile' : 'common.untitled')}`}>
          {editor && (
            <>
              <EntityEditorHeader
                mode={editor.mode} kind={t(titleKeyByType[type])}
                name={editor.name || t(editor.file.isNew ? 'assets.newFile' : 'common.untitled')}
                note={editor.note} nameLabel={t('common.name')} noteLabel={t('common.note')}
                closeLabel={t('common.close')}
                nameInputProps={{
                  value: editor.name,
                  error: editor.name && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(editor.name) ? t('assets.invalidName') : null,
                  onChange: (event) => setEditor({ ...editor, name: event.currentTarget.value }),
                }}
                noteInputProps={{
                  value: editor.note,
                  onChange: (event) => setEditor({ ...editor, note: event.currentTarget.value }),
                }}
              />
              <Modal.Body>
                <Stack gap="md">
                  {!editor.file.isNew && <ResourceTime value={editor.file.updatedAt} now={now} full />}
                  <SegmentedControl
                    fullWidth data-testid="resource-mode-control"
                    value={editor.mode}
                    onChange={(mode) => setEditor({ ...editor, mode: mode as 'edit' | 'preview' })}
                    data={[{ value: 'edit', label: t('common.edit') }, { value: 'preview', label: t('common.preview') }]}
                  />
                  {editor.mode === 'edit' && type === 'ruleset' ? (
                    editor.content ? (
                      <ScrollArea h="52dvh" type="auto">
                        <RulesetEditor
                          now={now}
                          key={`${editor.file.path}-${editor.sha ?? 'new'}`} value={editor.content}
                          onChange={(content) => setEditor((current) => current ? { ...current, content, structuredDirty: true } : current)}
                          onValidityChange={(structuredValid) => setEditor((current) => current ? { ...current, structuredValid, structuredDirty: true } : current)}
                        />
                      </ScrollArea>
                    ) : <Center h="52dvh"><Loader /></Center>
                  ) : editor.mode === 'edit' ? (
                    <Suspense fallback={<Center h="52dvh" role="status" aria-label={t('common.loading')}><Loader /></Center>}>
                      <CodeEditor
                        ariaLabel={t('assets.jsonEditor')} value={editor.content}
                        onChange={(content) => setEditor((current) => current ? { ...current, content } : current)}
                      />
                    </Suspense>
                  ) : (
                    <ScrollArea h="52dvh" type="auto"><Code block aria-label={t('assets.previewJson')}>{editor.content}</Code></ScrollArea>
                  )}
                  <Group justify="flex-end">
                    <Button type="button" variant="subtle" onClick={requestClose}>
                      {t(editor.mode === 'preview' ? 'common.done' : 'common.cancel')}
                    </Button>
                    {editor.mode === 'edit' && (
                      <Button leftSection={<Save size={17} />} loading={saving} disabled={!dirty || !valid} onClick={() => void save()}>{t('common.save')}</Button>
                    )}
                  </Group>
                </Stack>
              </Modal.Body>
            </>
          )}
        </Modal.Content>
      </Modal.Root>
    </Container>
  );
}
