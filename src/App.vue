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

    <template v-else-if="stateData">
      <TopToolbar
        :saveState="saveStatus"
        :refreshing="refreshing"
        :isDirty="isDirty"
        @refresh="handleGlobalRefresh"
        @add="handleGlobalAdd"
        @sort="handleGlobalSort"
        @save="handleGlobalSave"
      />

      <div class="relative overflow-hidden min-h-[500px]">
        <transition :name="transitionName" mode="out-in">
          <div v-if="activeTab === 'config'" key="config" class="space-y-6">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProfileEditor
                v-for="(profile, pIndex) in stateData.profiles"
                :key="profile.name || pIndex"
                :profile="profile"
                :index="pIndex"
                :availableNodes="availableAssets.nodes"
                :availableTemplates="availableAssets.templates"
                :copyStatus="!!copyStatus[pIndex]"
                :expanded="expandedIndex === pIndex"
                :globalSaveState="saveStatus"
                @update:expanded="toggleExpand(pIndex)"
                @preview="handlePreview"
                @copyLink="handleCopyLink"
                @remove="removeProfile"
                @duplicate="duplicateProfile"
                @save="handleSaveProfile"
              />
            </div>
          </div>
          <div v-else-if="activeTab === 'nodes'" key="nodes" class="space-y-6">
            <NodesManager
              ref="nodesManagerRef"
              :nodes="availableAssets.nodes"
              @refresh="refreshAssets"
              @status="(t, m) => showStatus(t, m, 5000)"
            />
          </div>
        </transition>
      </div>

      <AppDock v-model:activeTab="activeTab" />
    </template>

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

    <StatusToast :status="saveStatus" :message="statusMessage" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, nextTick } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import AppHeader from './components/layout/AppHeader.vue';
import ConnectForm from './components/ConnectForm.vue';
import ProfileEditor from './components/ProfileEditor.vue';
import PreviewModal from './components/ui/PreviewModal.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';
import TopToolbar from './components/layout/TopToolbar.vue';
import StatusToast from './components/ui/StatusToast.vue';
import AppDock from './components/layout/AppDock.vue';
import NodesManager from './components/NodesManager.vue';
import { useApi } from './composables/useApi';
import type { SetupData, UserSettings, StateData, Profile } from './types';

const APP_VERSION = 'v3.0.0-beta';

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
const availableAssets = ref<{ nodes: any[], templates: string[] }>({ nodes: [], templates: [] });

const activeTab = ref<'config' | 'nodes'>('config');
const transitionName = ref('slide-left');
const nodesManagerRef = ref<any>(null);

watch(activeTab, (newVal, oldVal) => {
  if (oldVal === 'config' && newVal === 'nodes') transitionName.value = 'slide-left';
  else if (oldVal === 'nodes' && newVal === 'config') transitionName.value = 'slide-right';
});

const isDirty = ref(false);
let suppressDirty = false;
let statusTimer: any = null;

function showStatus(state: 'success' | 'warning' | 'error', msg: string, duration = 3000) {
  if (statusTimer) clearTimeout(statusTimer);
  saveStatus.value = state;
  statusMessage.value = msg;
  statusTimer = setTimeout(() => { saveStatus.value = 'idle'; }, duration);
}

const { user, settings, login, getSettings, saveSettings, deleteSettings, getState, saveState, rebuild, getPreview, getAssets } = useApi();

async function refreshAssets() {
  try {
    availableAssets.value = await getAssets();
  } catch {
    availableAssets.value = { nodes: [], templates: [] };
  }
}

function setStateData(state: StateData) {
  suppressDirty = true;
  stateData.value = normalizeProfiles(state);
  nextTick(() => {
    suppressDirty = false;
    isDirty.value = false;
  });
}

watch(() => stateData.value?.profiles.map(p => p.name).join(','), () => {
  if (suppressDirty) return;
  if (!stateData.value) return;
  isDirty.value = true;
});

function normalizeProfiles(state: StateData): StateData {
  state.profiles = state.profiles.map((p: any) => ({
    name: p.name || '',
    note: p.note || '',
    templateUrl: p.templateUrl || '',
    nodesPath: p.nodesPath || '',
    rules: Array.isArray(p.rules) ? p.rules : [],
    inboundRules: Array.isArray(p.inboundRules) ? p.inboundRules : [],
  }));
  return state;
}

onMounted(async () => {
  try {
    const s = await getSettings();
    if (s) {
      const [data] = await Promise.all([getState(), refreshAssets()]);
      setStateData(data.state);
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
    const [data] = await Promise.all([getState(), refreshAssets()]);
    setStateData(data.state);
    fileSha.value = data.sha;
    setupData.pat = '';
    if (result.warning) {
      showStatus('warning', '登录成功，但配置构建失败: ' + result.warning, 5000);
    }
  } catch (e: any) {
    showStatus('error', '登录失败: ' + e.message, 5000);
  } finally {
    loadingData.value = false;
  }
}

async function handleSaveSettings(newSettings: { owner: string; repo: string; pat: string; subToken: string }) {
  loadingData.value = true;
  try {
    const result = await saveSettings(newSettings);
    const data = await getState();
    setStateData(data.state);
    fileSha.value = data.sha;
    if (result.warning) {
      showStatus('warning', '设置已保存，但配置构建失败: ' + result.warning, 5000);
    } else {
      showStatus('success', '设置已保存，配置已更新', 3000);
    }
  } catch (e: any) {
    showStatus('error', '更新设置失败: ' + e.message, 5000);
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
    isDirty.value = false;
    if (data.warning) {
      showStatus('warning', '规则已保存，但构建失败: ' + data.warning, 5000);
    } else {
      showStatus('success', '保存成功，配置已更新', 3000);
    }
  } catch (e: any) {
    showStatus('error', e.message || '保存失败', 5000);
  }
}

async function handleSaveProfile(profileName: string) {
  if (!stateData.value) return;
  saveStatus.value = 'saving';
  statusMessage.value = '';
  try {
    const data = await saveState(stateData.value, fileSha.value, profileName);
    fileSha.value = data.sha;
    isDirty.value = false;
    if (data.warning) {
      showStatus('warning', '配置已保存，但构建失败: ' + data.warning, 5000);
    } else {
      showStatus('success', '局部保存成功，配置已更新', 3000);
    }
  } catch (e: any) {
    showStatus('error', e.message || '保存失败', 5000);
  }
}

async function handleRefresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  saveStatus.value = 'refreshing';
  statusMessage.value = '';
  try {
    const data = await rebuild();
    setStateData(data.state);
    fileSha.value = data.sha;
    if (data.warning) {
      showStatus('warning', '刷新成功，但构建失败: ' + data.warning, 5000);
    } else {
      showStatus('success', '刷新并重新构建成功', 3000);
    }
  } catch (e: any) {
    showStatus('error', '刷新失败: ' + e.message, 5000);
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
    const data = await getPreview(name);
    previewContent.value = data.content;
  } catch {
    previewContent.value = '构建预览失败，请检查配置。';
  } finally {
    previewLoading.value = false;
  }
}

async function handleCopyLink(name: string) {
  const token = settings.value?.subToken;
  if (!token) return;
  const url = `${window.location.origin}/sub/${token}/${name}.json`;
  try {
    await navigator.clipboard.writeText(url);
    const idx = stateData.value!.profiles.findIndex(p => p.name === name);
    if (idx >= 0) {
      copyStatus.value[idx] = true;
      setTimeout(() => { copyStatus.value[idx] = false; }, 2000);
    }
  } catch {
    showStatus('error', '复制失败', 3000);
  }
}

function addProfile() {
  if (!stateData.value) return;
  stateData.value.profiles.push({
    name: 'new_env', note: '', templateUrl: '', nodesPath: 'sing-sub/nodes.json',
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

function duplicateProfile(source: Profile) {
  if (!stateData.value) return;
  if (!source) return;
  const index = stateData.value.profiles.findIndex(p => p.name === source.name);
  const copy: Profile = JSON.parse(JSON.stringify(source));
  copy.name = `${source.name || 'untitled'}_copy`;
  stateData.value.profiles.splice(index + 1, 0, copy);
  expandedIndex.value = index + 1;
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

async function handleGlobalAdd() {
  if (activeTab.value === 'config') {
    addProfile();
  } else if (activeTab.value === 'nodes') {
    if (nodesManagerRef.value) {
      nodesManagerRef.value.createNode();
    }
  }
}

function handleGlobalSort() {
  if (activeTab.value === 'config') sortProfiles();
  // Nodes sort if implemented
}

function handleGlobalSave() {
  if (activeTab.value === 'config') handleSave();
}

function handleGlobalRefresh() {
  handleRefresh();
  refreshAssets();
}
</script>

<style>
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
