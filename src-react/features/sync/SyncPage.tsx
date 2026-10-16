import { Alert, Badge, Button, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Download, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { SyncFileChanges } from '../../../shared';
import { api } from '../../../src/api/endpoints';
import { useAssetsStore } from '../../stores/assets';
import { useSyncStore } from '../../stores/sync';
import { useWorkspaceStore } from '../../stores/workspace';

type SyncAction = 'refresh' | 'pull' | 'push';

const statusKey = {
  never: 'never', synced: 'synced', 'local-ahead': 'localAhead', 'remote-ahead': 'remoteAhead',
  conflict: 'conflict', running: 'status', failed: 'conflict',
} as const;

function ChangeList({ title, changes }: { title: string; changes?: SyncFileChanges }) {
  const { t } = useTranslation();
  const groups = [
    { key: 'added', color: 'teal', paths: changes?.added ?? [] },
    { key: 'modified', color: 'yellow', paths: changes?.modified ?? [] },
    { key: 'deleted', color: 'red', paths: changes?.deleted ?? [] },
  ].filter((group) => group.paths.length > 0);

  return (
    <Paper withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Text fw={700}>{title}</Text>
        {groups.length === 0 ? <Text c="dimmed" size="sm">{t('sync.noChanges')}</Text> : groups.map((group) => (
          <Stack key={group.key} gap={4}>
            <Badge color={group.color} variant="light">{t(`sync.${group.key}`)}</Badge>
            {group.paths.map((path) => <Text key={path} ff="monospace" size="xs" truncate title={path}>{path}</Text>)}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

export function SyncPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useSyncStore((state) => state.status);
  const loading = useSyncStore((state) => state.loading);
  const operating = useSyncStore((state) => state.operating);
  const load = useSyncStore((state) => state.load);
  const runSync = useSyncStore((state) => state.run);
  const revision = useWorkspaceStore((state) => state.revision);
  const workspaceState = useWorkspaceStore((state) => state.state);
  const replaceWorkspace = useWorkspaceStore((state) => state.replace);
  const [action, setAction] = useState<SyncAction | null>(null);
  const busy = Boolean(action || loading || operating);

  useEffect(() => {
    void load().catch(() => notifications.show({ color: 'red', message: t('errors.generic') }));
  }, [load, t]);

  const refresh = async () => {
    if (busy) return;
    setAction('refresh');
    try { await load(true); }
    catch { notifications.show({ color: 'red', message: t('errors.generic') }); }
    finally { setAction(null); }
  };

  const execute = async (direction: 'push' | 'pull', resolution: 'safe' | 'overwrite') => {
    if (busy || !revision) return;
    setAction(direction);
    try {
      const result = await runSync(direction, { expectedRevision: revision, resolution });
      if (direction === 'pull') {
        useAssetsStore.getState().reset();
        const latest = await api.getState();
        replaceWorkspace(latest.state, latest.revision);
      } else {
        replaceWorkspace(workspaceState, result.revision);
      }
      if (result.warnings?.length) notifications.show({ color: 'yellow', message: t('sync.metadataWarnings', { count: result.warnings.length }) });
      notifications.show({ color: 'green', message: t(direction === 'push' ? 'sync.push' : 'sync.pull') });
    } catch {
      notifications.show({ color: 'red', message: t('errors.generic') });
    } finally {
      setAction(null);
    }
  };

  const requestRun = (direction: 'push' | 'pull') => {
    if (busy || !status?.connected || !revision) return;
    const safe = direction === 'push' ? status.canPush : status.canPull;
    if (safe) return void execute(direction, 'safe');
    modals.openConfirmModal({
      title: t('sync.overwriteTitle'),
      children: <Text size="sm">{t(direction === 'push' ? 'sync.overwriteRemote' : 'sync.overwriteLocal')}</Text>,
      labels: { confirm: t('common.confirm'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' }, centered: true,
      onConfirm: () => void execute(direction, 'overwrite'),
    });
  };

  if (!loading && !status?.connected) {
    return (
      <Container size="md">
        <Stack gap="lg">
          <Title order={1}>{t('nav.sync')}</Title>
          <Alert color="blue" title={t('sync.connectFirst')}>
            <Button mt="md" variant="light" onClick={() => navigate('/settings/repository')}>{t('sync.openRepositorySettings')}</Button>
          </Alert>
        </Stack>
      </Container>
    );
  }

  const labelKey = statusKey[status?.status ?? 'never'];
  const statusColor = status?.status === 'synced' ? 'teal' : status?.status === 'conflict' ? 'red' : 'yellow';

  return (
    <Container size="lg">
      {status?.validation?.path === 'sing-sub/metadata.json' && <Alert color="yellow" mb="md">{t('sync.metadataFileHint')}</Alert>}
      <Stack gap="lg">
        <Title order={1}>{t('nav.sync')}</Title>
        <Paper withBorder radius="lg" p="lg" aria-busy={busy}>
          <Stack gap="lg">
            <Group justify="space-between">
              <div><Text fw={700}>{t('sync.status')}</Text><Text c="dimmed" size="sm">{status?.repository}</Text></div>
              <Badge color={action ? 'blue' : statusColor} variant="light">
                {t(action ? `sync.${action}ing` : `sync.${labelKey}`)}
              </Badge>
            </Group>
            <Group justify="flex-end">
              <Button variant="light" leftSection={<RefreshCw size={17} />} loading={action === 'refresh'} disabled={busy} onClick={() => void refresh()}>{t('sync.refresh')}</Button>
              <Button variant="light" leftSection={<Download size={17} />} loading={action === 'pull'} disabled={busy || !status?.connected || !revision} onClick={() => requestRun('pull')}>{t('sync.pull')}</Button>
              <Button leftSection={<Upload size={17} />} loading={action === 'push'} disabled={busy || !status?.connected || !revision} onClick={() => requestRun('push')}>{t('sync.push')}</Button>
            </Group>
          </Stack>
        </Paper>
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <ChangeList title="R2" changes={status?.local.changes} />
          <ChangeList title="GitHub" changes={status?.remote?.changes} />
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
