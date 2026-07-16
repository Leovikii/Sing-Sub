<template>
  <div class="space-y-6">
    <Message v-if="!sync.loading && !sync.status?.connected" severity="info" :closable="false">
      <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{{ t('sync.connectFirst') }}</span>
        <Button class="w-full sm:w-auto" severity="secondary" outlined size="small" @click="router.push('/settings/repository')">
          {{ t('sync.openRepositorySettings') }}
        </Button>
      </div>
    </Message>

    <template v-else>
      <section class="settings-list" :aria-busy="busy">
        <div class="settings-row">
          <div>
            <div class="settings-label">{{ t('sync.status') }}</div>
            <div class="settings-hint">{{ sync.status?.repository }}</div>
          </div>
          <div aria-live="polite">
            <Tag :severity="statusSeverity" :value="displayStatusLabel" />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2 p-4 sm:flex sm:flex-wrap sm:justify-end sm:p-5">
          <Button
            class="w-full sm:w-auto"
            severity="secondary"
            outlined
            :loading="activeAction === 'refresh'"
            :disabled="busy"
            @click="refresh"
          >
            <RefreshCw :size="17" aria-hidden="true" />
            <span>{{ t(activeAction === 'refresh' ? 'sync.refreshing' : 'sync.refresh') }}</span>
          </Button>
          <Button
            class="w-full sm:w-auto"
            severity="secondary"
            :loading="activeAction === 'pull'"
            :disabled="busy || !sync.status?.connected"
            @click="run('pull')"
          >
            <Download :size="17" aria-hidden="true" />
            <span>{{ t(activeAction === 'pull' ? 'sync.pulling' : 'sync.pull') }}</span>
          </Button>
          <Button
            class="w-full sm:w-auto"
            :loading="activeAction === 'push'"
            :disabled="busy || !sync.status?.connected"
            @click="run('push')"
          >
            <Upload :size="17" aria-hidden="true" />
            <span>{{ t(activeAction === 'push' ? 'sync.pushing' : 'sync.push') }}</span>
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
import { computed, onMounted, ref } from 'vue';
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
type SyncAction = 'refresh' | 'pull' | 'push';
const activeAction = ref<SyncAction | null>(null);
const busy = computed(() => activeAction.value !== null || sync.loading || sync.operating);
const statusLabel = computed(() => t(`sync.${statusKey.value}`));
const displayStatusLabel = computed(() => activeAction.value
  ? t(`sync.${activeAction.value}ing`)
  : statusLabel.value);
const statusKey = computed(() => ({
  never: 'never',
  synced: 'synced',
  'local-ahead': 'localAhead',
  'remote-ahead': 'remoteAhead',
  conflict: 'conflict',
  running: 'status',
  failed: 'conflict',
}[sync.status?.status || 'never']));
const statusSeverity = computed(() => activeAction.value
  ? 'info'
  : sync.status?.status === 'synced'
  ? 'success'
  : sync.status?.status === 'conflict' ? 'danger' : 'warn');

async function execute(direction: 'push' | 'pull', resolution: 'safe' | 'overwrite') {
  if (busy.value) return;
  activeAction.value = direction;
  try {
    const result = await sync.run(direction, { expectedRevision: props.revision, resolution });
    emit('revision', result.revision);
    toast.add({ severity: 'success', summary: direction === 'push' ? t('sync.push') : t('sync.pull'), life: 3000 });
  } catch (error: any) {
    toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
  } finally {
    activeAction.value = null;
  }
}

async function refresh() {
  if (busy.value) return;
  activeAction.value = 'refresh';
  try {
    await sync.load();
  } catch (error: any) {
    toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
  } finally {
    activeAction.value = null;
  }
}

function run(direction: 'push' | 'pull') {
  if (busy.value) return;
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
