<template>
  <div class="space-y-6">
    <Message v-if="!sync.loading && !sync.status?.connected" severity="info" :closable="false">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ t('sync.connectFirst') }}</span>
        <Button severity="secondary" outlined size="small" @click="router.push('/settings/repository')">
          {{ t('sync.openRepositorySettings') }}
        </Button>
      </div>
    </Message>

    <template v-else>
      <section class="settings-list">
        <div class="settings-row">
          <div>
            <div class="settings-label">{{ t('sync.status') }}</div>
            <div class="settings-hint">{{ sync.status?.repository }}</div>
          </div>
          <Tag :severity="statusSeverity" :value="statusLabel" />
        </div>
        <div class="flex flex-wrap justify-end gap-2 p-5">
          <Button severity="secondary" outlined :loading="sync.loading" @click="refresh">
            <RefreshCw :size="17" aria-hidden="true" />
            <span>{{ t('sync.refresh') }}</span>
          </Button>
          <Button severity="secondary" :loading="sync.operating" :disabled="!sync.status?.connected" @click="run('pull')">
            <Download :size="17" aria-hidden="true" />
            <span>{{ t('sync.pull') }}</span>
          </Button>
          <Button :loading="sync.operating" :disabled="!sync.status?.connected" @click="run('push')">
            <Upload :size="17" aria-hidden="true" />
            <span>{{ t('sync.push') }}</span>
          </Button>
        </div>
      </section>

      <div class="grid gap-5 xl:grid-cols-2">
        <SyncChanges :title="'R2'" :changes="sync.status?.local.changes" />
        <SyncChanges title="GitHub" :changes="sync.status?.remote?.changes" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { Download, RefreshCw, Upload } from 'lucide-vue-next';
import { useSyncStore } from '../../stores/sync';
import SyncChanges from './components/SyncChanges.vue';

const props = defineProps<{ revision: string }>();
const emit = defineEmits<{ revision: [value: string] }>();
const sync = useSyncStore();
const router = useRouter();
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const statusLabel = computed(() => t(`sync.${statusKey.value}`));
const statusKey = computed(() => ({
  never: 'never',
  synced: 'synced',
  'local-ahead': 'localAhead',
  'remote-ahead': 'remoteAhead',
  conflict: 'conflict',
  running: 'status',
  failed: 'conflict',
}[sync.status?.status || 'never']));
const statusSeverity = computed(() => sync.status?.status === 'synced'
  ? 'success'
  : sync.status?.status === 'conflict' ? 'danger' : 'warn');

async function execute(direction: 'push' | 'pull', resolution: 'safe' | 'overwrite') {
  try {
    const result = await sync.run(direction, { expectedRevision: props.revision, resolution });
    emit('revision', result.revision);
    toast.add({ severity: 'success', summary: direction === 'push' ? t('sync.push') : t('sync.pull'), life: 3000 });
  } catch (error: any) {
    toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
  }
}

async function refresh() {
  try {
    await sync.load();
  } catch (error: any) {
    toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
  }
}

function run(direction: 'push' | 'pull') {
  if (!sync.status?.requiresResolution) {
    void execute(direction, 'safe');
    return;
  }
  confirm.require({
    header: t('sync.overwriteTitle'),
    message: direction === 'push' ? t('sync.overwriteRemote') : t('sync.overwriteLocal'),
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.confirm'),
    acceptClass: 'p-button-danger',
    accept: () => { void execute(direction, 'overwrite'); },
  });
}

onMounted(() => { void refresh(); });
</script>
