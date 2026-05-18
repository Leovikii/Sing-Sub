<template>
  <div class="max-w-7xl mx-auto space-y-10 p-6 md:p-12 pb-32">
    <AppHeader
      :user="user"
      :appVersion="APP_VERSION"
      :settings="settings"
      :loading="loadingData"
      @save="handleSaveSettings"
      @disconnect="handleDisconnect"
      @update:settings="handleUpdateSettings"
    />

    <div v-if="isInitializing" class="flex justify-center items-center py-32">
      <Loader2 :size="32" class="animate-spin text-[#F596AA]" />
    </div>

    <ConnectForm
      v-else-if="!settings"
      :setupData="setupData"
      :loading="loadingData"
      @update:setupData="Object.assign(setupData, $event)"
      @save="handleSetup"
    />

    <div v-else-if="stateData" class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <ProfileEditor
        v-for="(profile, pIndex) in stateData.profiles"
        :key="pIndex"
        :profile="profile"
        :index="pIndex"
        :copyStatus="!!copyStatus[pIndex]"
        :expanded="expandedIndex === pIndex"
        @update:expanded="toggleExpand(pIndex)"
        @preview="handlePreview"
        @copyLink="handleCopyLink"
        @remove="removeProfile"
      />

    </div>

    <PreviewModal
      :visible="showPreviewModal"
      :title="previewTitle"
      :content="previewContent"
      :loading="previewLoading"
      @close="showPreviewModal = false"
    />

    <ConfirmModal
      :visible="showDisconnectConfirm"
      title="确认断开连接"
      message="此操作将清除服务器上保存的所有设置和缓存配置。下次需要重新配置仓库信息。"
      confirmText="确认断开"
      @confirm="confirmDisconnect"
      @cancel="showDisconnectConfirm = false"
    />

    <FloatingActions
      v-if="stateData"
      :saveState="saveStatus"
      :refreshing="refreshing"
      @refresh="handleRefresh"
      @add="addProfile"
      @sort="sortProfiles"
      @save="handleSave"
    />

    <StatusToast :status="saveStatus" :message="statusMessage" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import AppHeader from './components/AppHeader.vue';
import ConnectForm from './components/ConnectForm.vue';
import ProfileEditor from './components/ProfileEditor.vue';
import PreviewModal from './components/PreviewModal.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import FloatingActions from './components/FloatingActions.vue';
import StatusToast from './components/StatusToast.vue';
import { useApi } from './composables/useApi';
import type { SetupData, UserSettings, StateData, Profile } from './types';

const APP_VERSION = 'v2.0.1';

const setupData = reactive<SetupData>({ owner: '', repo: '', pat: '' });
const stateData = ref<StateData | null>(null);
const fileSha = ref<string | null>(null);
const loadingData = ref(false);
const saveStatus = ref<'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error'>('idle');
const statusMessage = ref('');
const refreshing = ref(false);
const isInitializing = ref(true);
const copyStatus = ref<Record<number, boolean>>({});
const showPreviewModal = ref(false);
const showDisconnectConfirm = ref(false);
const expandedIndex = ref<number | null>(null);
const previewTitle = ref('');
const previewContent = ref('');
const previewLoading = ref(false);

const { user, settings, login, getSettings, saveSettings, deleteSettings, getState, saveState, rebuild, getPreview } = useApi();

function normalizeProfiles(state: StateData): StateData {
  state.profiles.forEach((p: Profile) => {
    if (!p.rules) p.rules = [];
    if (!p.inboundRules) p.inboundRules = [];
    if (!p.note) p.note = '';
  });
  return state;
}

onMounted(async () => {
  try {
    const s = await getSettings();
    if (s) {
      const data = await getState();
      stateData.value = normalizeProfiles(data.state);
      fileSha.value = data.sha;
    }
  } catch { /* not logged in */ }
  isInitializing.value = false;
});

async function handleSetup() {
  if (!setupData.owner || !setupData.repo || !setupData.pat) return;
  loadingData.value = true;
  try {
    const result = await login(setupData);
    const data = await getState();
    stateData.value = normalizeProfiles(data.state);
    fileSha.value = data.sha;
    setupData.pat = '';
    if (result.warning) {
      saveStatus.value = 'warning';
      statusMessage.value = '登录成功，但配置构建失败: ' + result.warning;
      setTimeout(() => { saveStatus.value = 'idle'; }, 5000);
    }
  } catch (e: any) {
    alert('登录失败: ' + e.message);
  } finally {
    loadingData.value = false;
  }
}

async function handleSaveSettings(newSettings: { owner: string; repo: string; pat: string; subToken: string }) {
  loadingData.value = true;
  try {
    const result = await saveSettings(newSettings);
    const data = await getState();
    stateData.value = normalizeProfiles(data.state);
    fileSha.value = data.sha;
    if (result.warning) {
      saveStatus.value = 'warning';
      statusMessage.value = '设置已保存，但配置构建失败: ' + result.warning;
      setTimeout(() => { saveStatus.value = 'idle'; }, 5000);
    } else {
      saveStatus.value = 'success';
      statusMessage.value = '设置已保存，配置已更新';
      setTimeout(() => { saveStatus.value = 'idle'; }, 3000);
    }
  } catch (e: any) {
    alert('更新设置失败: ' + e.message);
  } finally {
    loadingData.value = false;
  }
}

function handleUpdateSettings(partial: Partial<UserSettings>) {
  if (settings.value) {
    Object.assign(settings.value, partial);
  }
}

function handleDisconnect() {
  showDisconnectConfirm.value = true;
}

async function confirmDisconnect() {
  showDisconnectConfirm.value = false;
  await deleteSettings();
  stateData.value = null;
  fileSha.value = null;
}

async function handleSave() {
  if (!stateData.value) return;
  saveStatus.value = 'saving';
  statusMessage.value = '';
  try {
    const data = await saveState(stateData.value, fileSha.value);
    fileSha.value = data.sha;
    if (data.warning) {
      saveStatus.value = 'warning';
      statusMessage.value = '规则已保存，但构建失败: ' + data.warning;
      setTimeout(() => { saveStatus.value = 'idle'; }, 5000);
    } else {
      saveStatus.value = 'success';
      statusMessage.value = '保存成功，配置已更新';
      setTimeout(() => { saveStatus.value = 'idle'; }, 3000);
    }
  } catch (e: any) {
    saveStatus.value = 'error';
    statusMessage.value = e.message || '保存失败';
    setTimeout(() => { saveStatus.value = 'idle'; }, 5000);
  }
}

async function handleRefresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  saveStatus.value = 'refreshing';
  statusMessage.value = '';
  try {
    const data = await rebuild();
    stateData.value = normalizeProfiles(data.state);
    fileSha.value = data.sha;
    if (data.warning) {
      saveStatus.value = 'warning';
      statusMessage.value = '刷新成功，但构建失败: ' + data.warning;
      setTimeout(() => { saveStatus.value = 'idle'; }, 5000);
    } else {
      saveStatus.value = 'success';
      statusMessage.value = '刷新并重新构建成功';
      setTimeout(() => { saveStatus.value = 'idle'; }, 3000);
    }
  } catch (e: any) {
    saveStatus.value = 'error';
    statusMessage.value = '刷新失败: ' + e.message;
    setTimeout(() => { saveStatus.value = 'idle'; }, 5000);
  } finally {
    refreshing.value = false;
  }
}

async function handlePreview(name: string) {
  previewTitle.value = name;
  previewContent.value = '';
  showPreviewModal.value = true;
  previewLoading.value = true;
  try {
    previewContent.value = await getPreview(name);
  } catch {
    previewContent.value = '构建预览失败，请检查配置。';
  } finally {
    previewLoading.value = false;
  }
}

async function handleCopyLink(name: string, index: number) {
  const token = settings.value?.subToken;
  if (!token) return;
  const url = `${window.location.origin}/sub/${token}/${name}.json`;
  try {
    await navigator.clipboard.writeText(url);
    copyStatus.value[index] = true;
    setTimeout(() => { copyStatus.value[index] = false; }, 2000);
  } catch {
    alert('复制失败');
  }
}

function addProfile() {
  if (!stateData.value) return;
  stateData.value.profiles.push({
    name: 'new_env', note: '', templateUrl: '', inboundsPath: '', outboundsPath: '',
    rules: [], inboundRules: [],
  });
  expandedIndex.value = stateData.value.profiles.length - 1;
}

function removeProfile(index: number) {
  if (!stateData.value) return;
  if (expandedIndex.value === index) expandedIndex.value = null;
  else if (expandedIndex.value !== null && expandedIndex.value > index) expandedIndex.value--;
  stateData.value.profiles.splice(index, 1);
}

function sortProfiles() {
  if (!stateData.value) return;
  const expandedName = expandedIndex.value !== null
    ? stateData.value.profiles[expandedIndex.value]?.name ?? null
    : null;
  stateData.value.profiles.sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
  if (expandedName !== null) {
    const newIndex = stateData.value.profiles.findIndex(p => p.name === expandedName);
    expandedIndex.value = newIndex >= 0 ? newIndex : null;
  }
}

function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index;
}
</script>
