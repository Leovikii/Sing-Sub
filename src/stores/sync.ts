import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/endpoints';
import type {
  GithubSyncConnectionRequest,
  SyncOperationRequest,
  SyncOperationResult,
  SyncStatusResult,
} from '../../shared';

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatusResult | null>(null);
  const loading = ref(false);
  const operating = ref(false);
  const error = ref<unknown>(null);
  const connected = computed(() => status.value?.connected === true);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      status.value = await api.getGithubSync();
      return status.value;
    } catch (cause) {
      error.value = cause;
      throw cause;
    } finally {
      loading.value = false;
    }
  }

  async function connect(request: GithubSyncConnectionRequest) {
    operating.value = true;
    try {
      await api.connectGithubSync(request);
      return await load();
    } finally {
      operating.value = false;
    }
  }

  async function disconnect() {
    operating.value = true;
    try {
      await api.disconnectGithubSync();
      return await load();
    } finally {
      operating.value = false;
    }
  }

  async function run(direction: 'push' | 'pull', request: SyncOperationRequest): Promise<SyncOperationResult> {
    operating.value = true;
    try {
      const result = direction === 'push'
        ? await api.pushGithubSync(request)
        : await api.pullGithubSync(request);
      await load();
      return result;
    } finally {
      operating.value = false;
    }
  }

  return { status, loading, operating, error, connected, load, connect, disconnect, run };
});
