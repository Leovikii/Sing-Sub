import {
  ActionIcon, Badge, Box, Button, Card, Center, Code, Container, CopyButton, EmptyState, Group,
  Loader, Menu, Modal, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack,
  Text, TextInput, Title, Tooltip, UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check, Copy, FileCog, GripVertical, Link2, MoreHorizontal, Pencil, Plus, Save, Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { profileSchema, type FilterAction, type Profile, type StateData } from '../../../shared';
import { ApiClientError } from '../../../src/api/client';
import { api } from '../../../src/api/endpoints';
import { EntityEditorHeader } from '../../components/EntityEditorChrome';
import { useAssetsStore } from '../../stores/assets';
import { useSessionStore } from '../../stores/session';
import { useWorkspaceStore } from '../../stores/workspace';
import classes from './ProfilesPage.module.css';

interface JsonNode {
  tag?: string;
  type?: string;
}

type ProtocolTier =
  | 'preferred'
  | 'recommended'
  | 'acceptable'
  | 'standard'
  | 'discouraged'
  | 'structural'
  | 'unknown';

const protocolTiers: Record<string, ProtocolTier> = {
  vless: 'preferred',
  anytls: 'recommended',
  naive: 'recommended',
  naiveproxy: 'recommended',
  hysteria: 'acceptable',
  hysteria2: 'acceptable',
  tuic: 'acceptable',
  wireguard: 'acceptable',
  wg: 'acceptable',
  http: 'standard',
  socks: 'standard',
  socks5: 'standard',
  mixed: 'standard',
  trojan: 'discouraged',
  shadowsocks: 'discouraged',
  ss: 'discouraged',
  vmess: 'discouraged',
  direct: 'structural',
  block: 'structural',
  dns: 'structural',
  selector: 'structural',
  urltest: 'structural',
};

const tierPresentation: Record<ProtocolTier, { color: string; labelKey: string }> = {
  preferred: { color: 'teal', labelKey: 'profiles.tierPreferred' },
  recommended: { color: 'cyan', labelKey: 'profiles.tierRecommended' },
  acceptable: { color: 'blue', labelKey: 'profiles.tierAcceptable' },
  standard: { color: 'gray', labelKey: 'profiles.tierStandard' },
  discouraged: { color: 'yellow', labelKey: 'profiles.tierDiscouraged' },
  structural: { color: 'violet', labelKey: 'profiles.tierStructural' },
  unknown: { color: 'gray', labelKey: 'profiles.tierUnknown' },
};

interface EditorState {
  profile: Profile;
  oldName?: string;
  isNew: boolean;
  initialMode: 'edit' | 'preview';
}

interface ConflictState {
  state: StateData;
  profileName?: string;
  oldProfileName?: string;
  closeEditor: boolean;
}

function basename(path: string) {
  return (path.split('/').pop() ?? path).replace(/\.json$/, '');
}

function cloneProfile(profile: Profile): Profile {
  return structuredClone(profile);
}

function applyFilters(nodes: JsonNode[], filters: FilterAction[]): JsonNode[] {
  let result: JsonNode[] = [];
  let firstInclude = true;

  for (const filter of filters) {
    const keywords = filter.keyword.split(',').map((item) => item.trim()).filter(Boolean);
    if (keywords.length === 0) continue;
    const matches = (node: JsonNode) => keywords.some((keyword) => node.tag?.includes(keyword));
    if (filter.action === 'include') {
      const current = nodes.filter(matches);
      result = firstInclude
        ? current
        : [...result, ...current.filter((node) => !result.some((item) => item.tag === node.tag))];
      firstInclude = false;
    } else {
      result = firstInclude ? nodes.filter((node) => !matches(node)) : result.filter((node) => !matches(node));
      firstInclude = false;
    }
  }
  return result;
}

function MatchedNodeBadge({ node }: { node: JsonNode }) {
  const { t } = useTranslation();
  const type = node.type?.trim() || 'unknown';
  const typeLabel = type.toUpperCase();
  const tier = protocolTiers[type.toLowerCase()] ?? 'unknown';
  const presentation = tierPresentation[tier];
  const tierLabel = t(presentation.labelKey);
  const tag = node.tag ?? '';
  const accessibleLabel = `${typeLabel}，${tierLabel}，${tag}`;

  return (
    <Tooltip label={`${typeLabel} · ${tierLabel} · ${tag}`} withArrow>
      <Badge
        aria-label={accessibleLabel}
        color={presentation.color}
        variant="light"
        size="md"
        radius="sm"
        maw="100%"
        tt="none"
        leftSection={typeLabel}
        style={{ flexShrink: 1 }}
      >
        {tag}
      </Badge>
    </Tooltip>
  );
}

// Empty keywords are valid editing drafts, but do not create runtime rules.
function withActiveFilters(profile: Profile): Profile {
  const rules = profile.rules.map((rule) => ({ ...rule, filters: rule.filters.filter((filter) => filter.keyword.trim()) }))
    .filter((rule) => rule.filters.length > 0);
  const inboundRules = profile.inboundRules.map((rule) => ({ ...rule, filters: rule.filters.filter((filter) => filter.keyword.trim()) }))
    .filter((rule) => rule.filters.length > 0);
  return { ...profile, rules, inboundRules };
}

function FilterRow({
  label, filter, matched, onChange, onClear,
}: {
  label: string;
  filter?: FilterAction;
  matched: JsonNode[];
  onChange: (value: FilterAction) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const value = filter ?? { action: 'include', keyword: '' };

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Text fw={600}>{label}</Text>
          {filter && (
            <Button size="compact-sm" variant="subtle" color="red" onClick={onClear}>
              {t('common.delete')}
            </Button>
          )}
        </Group>
        <Group align="flex-start" grow>
          <Select
            label={t('profiles.filterMode')}
            aria-label={`${label} ${t('profiles.filterMode')}`}
            value={value.action}
            allowDeselect={false}
            data={[
              { value: 'include', label: t('profiles.filterInclude') },
              { value: 'exclude', label: t('profiles.filterExclude') },
            ]}
            onChange={(action) => onChange({ ...value, action: (action ?? 'include') as FilterAction['action'] })}
          />
          <TextInput
            label={t('profiles.keywordLabel')}
            placeholder={t('profiles.keyword')}
            value={value.keyword}
            onChange={(event) => onChange({ ...value, keyword: event.currentTarget.value })}
          />
        </Group>
        {value.keyword.trim() && (
          <div className={classes.nodeList} aria-label={t('profiles.matches')}>
            {matched.slice(0, 10).map((node) => (
              <MatchedNodeBadge key={`${node.type ?? 'unknown'}:${node.tag ?? ''}`} node={node} />
            ))}
            {matched.length > 10 && <Badge variant="outline">+{matched.length - 10}</Badge>}
            {matched.length === 0 && <Text size="sm" c="dimmed">{t('profiles.noMatches')}</Text>}
          </div>
        )}
      </Stack>
    </Paper>
  );
}

function ProfileEditorModal({
  editor, existingNames, saving, onClose, onSave,
}: {
  editor: EditorState;
  existingNames: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (profile: Profile, oldName?: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const mobile = useMediaQuery('(max-width: 48em)');
  const assets = useAssetsStore((state) => state.items);
  const [mode, setMode] = useState<'edit' | 'preview'>(editor.initialMode);
  const [loadedTemplate, setLoadedTemplate] = useState<{ path: string; data: Record<string, unknown> } | null>(null);
  const [loadedNodes, setLoadedNodes] = useState<{ path: string; data: Record<string, unknown> } | null>(null);
  const [preview, setPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(editor.initialMode === 'preview');
  const [previewProfile, setPreviewProfile] = useState(() => cloneProfile(editor.profile));
  const form = useForm<Profile>({
    initialValues: cloneProfile(editor.profile),
    validate: zod4Resolver(profileSchema),
  });

  const template = loadedTemplate?.path === form.values.templateUrl ? loadedTemplate.data : null;
  const nodes = loadedNodes?.path === form.values.nodesPath ? loadedNodes.data : null;
  const selectorGroups = useMemo(() => {
    const outbounds = Array.isArray(template?.outbounds) ? template.outbounds as JsonNode[] : [];
    return outbounds.filter((item) => item.type === 'selector' && item.tag);
  }, [template]);
  const inboundNodes = Array.isArray(nodes?.inbounds) ? nodes.inbounds as JsonNode[] : [];
  const outboundNodes = Array.isArray(nodes?.outbounds) ? nodes.outbounds as JsonNode[] : [];

  useEffect(() => {
    let active = true;
    if (form.values.templateUrl) {
      void api.getTemplate(form.values.templateUrl).then((result) => {
        if (active && result.content && typeof result.content === 'object') {
          setLoadedTemplate({ path: form.values.templateUrl, data: result.content as Record<string, unknown> });
        }
      }).catch(() => {
        if (active) notifications.show({ color: 'red', message: t('profiles.templateFailed') });
      });
    }
    return () => { active = false; };
  }, [form.values.templateUrl, t]);

  useEffect(() => {
    let active = true;
    if (form.values.nodesPath) {
      void api.getFile(form.values.nodesPath).then((result) => {
        if (active) setLoadedNodes({ path: form.values.nodesPath, data: JSON.parse(result.content) as Record<string, unknown> });
      }).catch(() => {
        if (active) notifications.show({ color: 'red', message: t('profiles.nodesFailed') });
      });
    }
    return () => { active = false; };
  }, [form.values.nodesPath, t]);

  useEffect(() => {
    if (mode !== 'preview') return;
    let active = true;
    void api.postPreview(previewProfile).then((result) => {
      if (active) setPreview(result.content);
    }).catch((error: unknown) => {
      if (active) setPreview(`// ${t('profiles.previewFailed')}\n// ${error instanceof Error ? error.message : t('common.unknownError')}`);
    }).finally(() => {
      if (active) setPreviewLoading(false);
    });
    return () => { active = false; };
  }, [mode, previewProfile, t]);

  const changeMode = (value: string) => {
    const nextMode = value as 'edit' | 'preview';
    if (nextMode === 'preview') {
      setPreviewLoading(true);
      setPreview('');
      setPreviewProfile(withActiveFilters(form.values));
    }
    setMode(nextMode);
  };

  const requestClose = () => {
    if (!form.isDirty()) return onClose();
    modals.openConfirmModal({
      title: t('common.unsavedTitle'),
      children: <Text size="sm">{t('common.unsavedMessage')}</Text>,
      labels: { confirm: t('common.discard'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' }, centered: true, onConfirm: onClose,
    });
  };

  const setInboundFilter = (filter?: FilterAction) => {
    form.setFieldValue('inboundRules', filter
      ? [{ tag: 'global-inbounds', filters: [filter] }]
      : []);
  };
  const setOutboundFilter = (group: string, filter?: FilterAction) => {
    const next = form.values.rules.filter((rule) => rule.group !== group);
    if (filter) next.push({ group, filters: [filter] });
    form.setFieldValue('rules', next);
  };

  const handleValidSubmit = async (values: Profile) => {
    if (existingNames.some((name) => name === values.name && name !== editor.oldName)) {
      form.setFieldError('name', t('profiles.duplicateName'));
      return;
    }
    const validGroups = new Set(selectorGroups.map((item) => item.tag as string));
    const normalized = withActiveFilters(values);
    const profile = { ...normalized, rules: normalized.rules.filter((rule) => validGroups.has(rule.group)), updated_at: new Date().getTime() };
    await onSave(profile, editor.oldName);
  };
  const submit = form.onSubmit(handleValidSubmit);

  return (
    <Modal.Root
      opened onClose={requestClose}
      size="xl" fullScreen={mobile} closeOnClickOutside={false}
      transitionProps={{ transition: mobile ? 'fade' : 'pop' }}
    >
      <Modal.Overlay />
      <Modal.Content aria-label={`${t('nav.profiles')} ${form.values.name || t(editor.isNew ? 'profiles.newProfile' : 'common.untitled')}`}>
        <Box
          component="form" onSubmit={submit} h={mobile ? '100%' : undefined} mih={0}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <EntityEditorHeader
            mode={mode} kind={t('nav.profiles')}
            name={form.values.name || t(editor.isNew ? 'profiles.newProfile' : 'common.untitled')}
            note={form.values.note} nameLabel={t('common.name')} noteLabel={t('common.note')}
            closeLabel={t('common.close')}
            nameInputProps={{ withAsterisk: true, ...form.getInputProps('name') }}
            noteInputProps={form.getInputProps('note')}
          />
          <Modal.Body flex={mobile ? 1 : undefined} mih={0}>
            <Stack gap="lg" h={mobile ? '100%' : undefined} mih={0}>
              <SegmentedControl
                fullWidth value={mode} onChange={changeMode}
                data={[{ value: 'edit', label: t('common.edit') }, { value: 'preview', label: t('common.preview') }]}
              />

              {mode === 'preview' ? (
                previewLoading ? <Center h={mobile ? undefined : '50dvh'} flex={mobile ? 1 : undefined}><Loader /></Center> : (
                  <ScrollArea h={mobile ? undefined : '50dvh'} flex={mobile ? 1 : undefined} mih={0}>
                    <Code block>{preview}</Code>
                  </ScrollArea>
                )
              ) : (
                <ScrollArea
                  h={mobile ? undefined : '50dvh'} flex={mobile ? 1 : undefined} mih={0}
                  type="auto" scrollbars="y" offsetScrollbars="y"
                  viewportProps={{ 'aria-label': t('profiles.editorContent') }}
                >
                  <Stack gap="xl" pe="xs">
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <Select
                        label={t('profiles.template')} placeholder={t('profiles.chooseTemplate')} searchable clearable
                        data={assets.templates.map((item) => ({ value: item.path, label: basename(item.path) }))}
                        value={form.values.templateUrl || null}
                        error={form.errors.templateUrl}
                        onChange={(value) => form.setFieldValue('templateUrl', value ?? '')}
                      />
                      <Select
                        label={t('profiles.nodeSet')} placeholder={t('profiles.chooseNodeSet')} searchable clearable
                        data={assets.nodes.map((item) => ({ value: item.path, label: basename(item.path) }))}
                        value={form.values.nodesPath || null}
                        error={form.errors.nodesPath}
                        onChange={(value) => form.setFieldValue('nodesPath', value ?? '')}
                      />
                    </SimpleGrid>

                    <Stack gap="sm">
                      <Title order={3}>{t('profiles.inbounds')}</Title>
                      <FilterRow
                        label={t('profiles.inbounds')}
                        filter={form.values.inboundRules[0]?.filters[0]}
                        matched={applyFilters(inboundNodes, form.values.inboundRules[0]?.filters ?? [])}
                        onChange={setInboundFilter}
                        onClear={() => setInboundFilter()}
                      />
                    </Stack>

                    <Stack gap="sm">
                      <Title order={3}>{t('profiles.outbounds')}</Title>
                      {!form.values.templateUrl ? (
                        <Text c="dimmed">{t('profiles.chooseTemplateFirst')}</Text>
                      ) : selectorGroups.length === 0 ? (
                        <Text c="dimmed">{t('profiles.noSelector')}</Text>
                      ) : selectorGroups.map((group) => {
                        const tag = group.tag as string;
                        const filter = form.values.rules.find((rule) => rule.group === tag)?.filters[0];
                        return (
                          <FilterRow
                            key={tag} label={tag} filter={filter}
                            matched={applyFilters(outboundNodes, filter ? [filter] : [])}
                            onChange={(value) => setOutboundFilter(tag, value)}
                            onClear={() => setOutboundFilter(tag)}
                          />
                        );
                      })}
                    </Stack>
                  </Stack>
                </ScrollArea>
              )}

              <Group justify="flex-end" data-testid="profile-editor-actions">
                <Button type="button" variant="subtle" onClick={requestClose}>
                  {t(mode === 'preview' ? 'common.done' : 'common.cancel')}
                </Button>
                {mode === 'edit' && (
                  <Button type="submit" leftSection={<Save size={17} />} loading={saving}>{t('common.save')}</Button>
                )}
              </Group>
            </Stack>
          </Modal.Body>
        </Box>
      </Modal.Content>
    </Modal.Root>
  );
}

function SortableProfileCard({
  profile, subscriptionUrl, onOpen, onDuplicate, onRemove,
}: {
  profile: Profile;
  subscriptionUrl: string;
  onOpen: (mode: 'edit' | 'preview') => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: profile.name });

  return (
    <Card
      ref={setNodeRef} className={`${classes.sortableCard} ${isDragging ? classes.dragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined }}
      role="article" aria-label={profile.name}
      withBorder radius="lg" padding="lg" pos="relative"
    >
      <UnstyledButton
        aria-label={t('profiles.previewProfile', { name: profile.name })}
        onClick={() => onOpen('preview')}
        pos="absolute" top={0} right={0} bottom={0} left={0}
        style={{ zIndex: 1 }}
      />
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Tooltip label={t('profiles.reorder')}>
            <ActionIcon
              className={classes.dragHandle} size={44} variant="subtle" aria-label={t('profiles.reorder')}
              pos="relative" style={{ zIndex: 2 }}
              {...attributes} {...listeners}
            ><GripVertical size={18} /></ActionIcon>
          </Tooltip>
          <Stack gap={4} miw={0} flex={1}>
            <Text fw={700} size="lg" truncate>{profile.name}</Text>
            <Text size="sm" c="dimmed" truncate>{profile.note || t('common.noNote')}</Text>
          </Stack>
          <Group gap={4} wrap="nowrap" pos="relative" style={{ zIndex: 2 }}>
            <Tooltip label={t('common.edit')}>
              <ActionIcon size={44} variant="subtle" aria-label={t('common.edit')} onClick={() => onOpen('edit')}>
                <Pencil size={18} />
              </ActionIcon>
            </Tooltip>
            <Menu position="bottom-end" shadow="md" transitionProps={{ transition: 'pop', duration: 120 }}>
              <Menu.Target>
                <ActionIcon size={44} variant="subtle" aria-label={t('common.moreActions')}><MoreHorizontal size={18} /></ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<Copy size={16} />} onClick={onDuplicate}>{t('profiles.duplicate')}</Menu.Item>
                <Menu.Item color="red" leftSection={<Trash2 size={16} />} onClick={onRemove}>{t('profiles.remove')}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
        <CopyButton value={subscriptionUrl} timeout={1800}>
          {({ copied, copy }) => (
            <Button
              variant="light" color={copied ? 'teal' : 'pink'} fullWidth
              leftSection={copied ? <Check size={17} /> : <Link2 size={17} />}
              h={44} pos="relative" style={{ zIndex: 2 }} onClick={copy}
            >{copied ? t('common.copied') : t('profiles.subscription')}</Button>
          )}
        </CopyButton>
      </Stack>
    </Card>
  );
}

export function ProfilesPage() {
  const { t } = useTranslation();
  const workspaceState = useWorkspaceStore((state) => state.state);
  const revision = useWorkspaceStore((state) => state.revision);
  const replaceWorkspace = useWorkspaceStore((state) => state.replace);
  const settings = useSessionStore((state) => state.settings);
  const assetsLoaded = useAssetsStore((state) => state.loaded);
  const setAssetsLoading = useAssetsStore((state) => state.setLoading);
  const replaceAssets = useAssetsStore((state) => state.replace);
  const [profiles, setProfiles] = useState<Profile[]>(() => workspaceState?.profiles ?? []);
  const [orderDirty, setOrderDirty] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (assetsLoaded) return;
    setAssetsLoading(true);
    void api.getAssets().then(replaceAssets).catch(() => {
      setAssetsLoading(false);
      notifications.show({ color: 'red', message: t('assets.loadFailed') });
    });
  }, [assetsLoaded, replaceAssets, setAssetsLoading, t]);

  const acceptSave = useCallback((nextState: StateData, nextRevision: string, warning?: string, closeEditor = false) => {
    replaceWorkspace(nextState, nextRevision);
    setProfiles(nextState.profiles);
    setOrderDirty(false);
    if (closeEditor) setEditor(null);
    notifications.show({ color: warning ? 'yellow' : 'green', message: warning ?? t('workspace.saved') });
  }, [replaceWorkspace, t]);

  const persist = useCallback(async (
    nextState: StateData, profileName?: string, oldProfileName?: string, closeEditor = false,
  ) => {
    if (!revision) {
      notifications.show({ color: 'red', message: t('workspace.revisionMissing') });
      return false;
    }
    setSaving(true);
    try {
      const result = await api.saveState(nextState, revision, profileName, oldProfileName);
      acceptSave(nextState, result.revision, result.warning, closeEditor);
      return true;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setConflict({ state: nextState, profileName, oldProfileName, closeEditor });
      } else {
        notifications.show({ color: 'red', message: error instanceof Error ? error.message : t('workspace.saveFailed') });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [acceptSave, revision, t]);

  const createProfile = (source?: Profile) => {
    const now = Date.now();
    const profile: Profile = source ? {
      ...cloneProfile(source), name: `${source.name || 'untitled'}_copy`, created_at: now, updated_at: now,
    } : {
      name: '', note: '', templateUrl: '', nodesPath: '', rules: [], inboundRules: [],
      created_at: now, updated_at: now, order: profiles.length,
    };
    setEditor({ profile, oldName: undefined, isNew: true, initialMode: 'edit' });
  };

  const saveProfile = async (profile: Profile, oldName?: string) => {
    const existingIndex = oldName ? profiles.findIndex((item) => item.name === oldName) : -1;
    const nextProfiles = profiles.map(cloneProfile);
    if (existingIndex >= 0) nextProfiles.splice(existingIndex, 1, profile);
    else nextProfiles.push({ ...profile, order: nextProfiles.length });
    nextProfiles.forEach((item, index) => { item.order = index; });
    return persist({ profiles: nextProfiles }, profile.name, oldName, true);
  };

  const removeProfile = (profile: Profile) => modals.openConfirmModal({
    title: t('profiles.remove'),
    children: <Text size="sm">{t('profiles.removeConfirm', { name: profile.name })}</Text>,
    labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
    confirmProps: { color: 'red' }, centered: true,
    onConfirm: () => {
      const next = profiles.filter((item) => item.name !== profile.name).map(cloneProfile);
      next.forEach((item, index) => { item.order = index; });
      void persist({ profiles: next });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = profiles.findIndex((profile) => profile.name === event.active.id);
    const newIndex = profiles.findIndex((profile) => profile.name === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(profiles, oldIndex, newIndex).map(cloneProfile);
    next.forEach((profile, index) => { profile.order = index; });
    setProfiles(next);
    setOrderDirty(true);
  };

  const reloadConflict = async () => {
    setSaving(true);
    try {
      const latest = await api.getState();
      replaceWorkspace(latest.state, latest.revision);
      setProfiles(latest.state.profiles);
      setOrderDirty(false);
      setConflict(null);
      setEditor(null);
      notifications.show({ color: 'yellow', message: t('workspace.reloadNotice') });
    } catch {
      notifications.show({ color: 'red', message: t('workspace.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const overwriteConflict = async () => {
    if (!conflict) return;
    setSaving(true);
    try {
      const latest = await api.getState();
      const result = await api.saveState(conflict.state, latest.revision, conflict.profileName, conflict.oldProfileName);
      acceptSave(conflict.state, result.revision, result.warning, conflict.closeEditor);
      setConflict(null);
    } catch {
      notifications.show({ color: 'red', message: t('workspace.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={1}>{t('nav.profiles')}</Title>
            <Text c="dimmed">{t('profiles.description')}</Text>
          </Stack>
          <Group>
            {orderDirty && (
              <Button variant="light" leftSection={<Save size={17} />} loading={saving} onClick={() => void persist({ profiles })}>
                {t('profiles.saveOrder')}
              </Button>
            )}
            <Button leftSection={<Plus size={17} />} onClick={() => createProfile()}>{t('profiles.newProfile')}</Button>
          </Group>
        </Group>

        {profiles.length === 0 ? (
          <EmptyState icon={<FileCog />} title={t('profiles.empty')} variant="light" color="pink">
            <EmptyState.Actions><Button onClick={() => createProfile()}>{t('profiles.newProfile')}</Button></EmptyState.Actions>
          </EmptyState>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={profiles.map((profile) => profile.name)} strategy={rectSortingStrategy}>
              <div className={classes.grid}>
                {profiles.map((profile) => (
                  <SortableProfileCard
                    key={profile.name} profile={profile}
                    subscriptionUrl={`${window.location.origin}/sub/${settings?.subToken ?? ''}/${profile.name}.json`}
                    onOpen={(initialMode) => setEditor({ profile: cloneProfile(profile), oldName: profile.name, isNew: false, initialMode })}
                    onDuplicate={() => createProfile(profile)} onRemove={() => removeProfile(profile)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Stack>

      {editor && (
        <ProfileEditorModal
          key={`${editor.oldName ?? 'new'}-${editor.profile.created_at}`}
          editor={editor} existingNames={profiles.map((profile) => profile.name)} saving={saving}
          onClose={() => setEditor(null)} onSave={saveProfile}
        />
      )}

      <Modal
        opened={Boolean(conflict)} onClose={() => setConflict(null)} title={t('common.conflictTitle')} centered
        closeButtonProps={{ 'aria-label': t('common.close') }}
      >
        <Stack>
          <Text size="sm">{t('common.conflictMessage')}</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConflict(null)}>{t('common.cancel')}</Button>
            <Button variant="light" onClick={() => void reloadConflict()}>{t('common.reload')}</Button>
            <Button color="red" loading={saving} onClick={() => void overwriteConflict()}>{t('common.replace')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
