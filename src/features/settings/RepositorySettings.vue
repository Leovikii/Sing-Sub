<template>
  <div class="space-y-8">
    <section class="settings-list">
      <div class="settings-row items-start">
        <div>
          <div class="settings-label">{{ t('repository.connection') }}</div>
          <div class="settings-hint">{{ t('repository.connectionHint') }}</div>
        </div>
        <Tag
          :severity="sync.status?.connected ? 'success' : 'secondary'"
          :value="sync.status?.connected ? sync.status.repository : t('common.notConnected')"
        />
      </div>

      <template v-if="sync.status?.connected && !editingConnection">
        <div class="settings-row">
          <span class="settings-label">{{ t('repository.defaultBranch') }}</span>
          <code class="text-sm">{{ sync.status.defaultBranch }}</code>
        </div>
        <div class="settings-row">
          <span class="settings-label">{{ t('repository.pat') }}</span>
          <div class="flex flex-wrap gap-2">
            <Button severity="secondary" outlined @click="beginEdit">
              <Pencil :size="17" aria-hidden="true" />
              <span>{{ t('repository.replace') }}</span>
            </Button>
            <Button severity="danger" text :loading="sync.operating" @click="confirmDisconnect">
              <Unplug :size="17" aria-hidden="true" />
              <span>{{ t('common.disconnect') }}</span>
            </Button>
          </div>
        </div>
      </template>

      <form v-else class="space-y-4 p-5" @submit.prevent="connect">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label for="repository" class="settings-label">{{ t('repository.ownerRepo') }}</label>
            <InputText id="repository" v-model="ownerRepo" placeholder="owner/repository" class="w-full" autocomplete="off" />
          </div>
          <div class="space-y-2">
            <label for="repository-pat" class="settings-label">{{ t('repository.pat') }}</label>
            <Password id="repository-pat" v-model="pat" :feedback="false" toggle-mask fluid autocomplete="new-password" />
          </div>
        </div>
        <Message v-if="changingRepository" severity="warn" size="small" :closable="false">
          {{ t('repository.differentRepositoryWarning') }}
        </Message>
        <div class="flex justify-end gap-2">
          <Button v-if="sync.status?.connected" type="button" severity="secondary" text @click="editingConnection = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :loading="sync.operating" :disabled="!connectionValid">
            <Github :size="17" aria-hidden="true" />
            <span>{{ t('repository.connect') }}</span>
          </Button>
        </div>
      </form>
    </section>

    <section class="settings-list">
      <div class="settings-row">
        <div>
          <div class="settings-label">{{ t('repository.srsCompiler') }}</div>
          <div class="settings-hint">{{ t('repository.srsHint') }}</div>
        </div>
        <div class="flex items-center gap-3">
          <Tag :severity="compilerSeverity" :value="compilerLabel" />
          <ToggleSwitch
            :model-value="compiler?.enabled || false"
            :disabled="compilerLoading || !sync.status?.connected"
            @update:model-value="toggleCompiler"
          />
        </div>
      </div>
      <Message v-if="compiler?.errorCode" severity="error" :closable="false" class="m-5 mt-0">
        {{ compiler.errorCode }}
      </Message>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import { Github, Pencil, Unplug } from 'lucide-vue-next';
import { api } from '../../api/endpoints';
import { useSyncStore } from '../../stores/sync';
import type { SrsCompilerStatusResult } from '../../../shared';

const emit = defineEmits<{
  revision: [value: string];
}>();

const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const sync = useSyncStore();
const editingConnection = ref(false);
const ownerRepo = ref('');
const pat = ref('');
const compiler = ref<SrsCompilerStatusResult | null>(null);
const compilerLoading = ref(false);
const connectionParts = computed(() => ownerRepo.value.trim().split('/'));
const connectionValid = computed(() => connectionParts.value.length === 2 && connectionParts.value.every(Boolean) && pat.value.length > 0);
const changingRepository = computed(() => Boolean(
  sync.status?.repository && ownerRepo.value && sync.status.repository.toLowerCase() !== ownerRepo.value.toLowerCase(),
));
const compilerLabel = computed(() => compilerLoading.value
  ? t('common.loading')
  : compiler.value?.enabled ? t('common.enabled') : t('common.disabled'));
const compilerSeverity = computed(() => compiler.value?.status === 'error'
  ? 'danger'
  : compiler.value?.enabled ? 'success' : 'secondary');

function beginEdit() {
  ownerRepo.value = sync.status?.repository || '';
  pat.value = '';
  editingConnection.value = true;
}

async function load() {
  try {
    await sync.load();
    compilerLoading.value = true;
    compiler.value = await api.getSrsCompiler();
  } catch (error: any) {
    toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
  } finally {
    compilerLoading.value = false;
  }
}

async function connect() {
  if (!connectionValid.value) return;
  try {
    const [owner, repo] = connectionParts.value;
    await sync.connect({ owner, repo, pat: pat.value });
    pat.value = '';
    editingConnection.value = false;
    compiler.value = await api.getSrsCompiler();
    toast.add({ severity: 'success', summary: t('repository.connection'), life: 2500 });
  } catch (error: any) {
    toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
  }
}

function confirmDisconnect() {
  confirm.require({
    header: t('common.disconnect'),
    message: t('repository.connectionHint'),
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.disconnect'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await sync.disconnect();
        compiler.value = await api.getSrsCompiler();
      } catch (error: any) {
        toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
      }
    },
  });
}

async function toggleCompiler(enabled: boolean) {
  compilerLoading.value = true;
  try {
    compiler.value = await api.setSrsCompiler(enabled);
    if (compiler.value.reconcile?.revision) emit('revision', compiler.value.reconcile.revision);
    toast.add({ severity: 'success', summary: t('repository.srsCompiler'), life: 2500 });
  } catch (error: any) {
    toast.add({ severity: 'error', summary: error.message || t('errors.generic'), life: 5000 });
  } finally {
    compilerLoading.value = false;
  }
}

onMounted(() => { void load(); });
</script>
