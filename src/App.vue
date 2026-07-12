<template>
  <AppShell
    :user="user"
    v-model:activeTab="activeTab"
    v-model:expanded="sidebarExpanded"
    :show-navigation="!!stateData"
    @open-settings="activeTab = 'settings'"
  >
    <GlobalToast :status="saveStatus" :message="statusMessage" />

    <div class="mx-auto max-w-7xl space-y-10 p-6 md:p-12">

    <div v-if="isInitializing" class="flex justify-center items-center py-32">
      <Loader2 :size="32" class="animate-spin text-brand-pink" />
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
        v-if="activeTab !== 'settings'"
        :saveStatus="saveStatus"
        :refreshing="refreshing"
        :isDirty="isDirty"
        :activeTab="activeTab"
        :assetType="assetType"
        @update:assetType="assetType = $event"
        @refresh="handleGlobalRefresh"
        @add="handleGlobalAdd"
        @save="handleGlobalSave"
      />

      <transition name="fade-scale" mode="out-in">
        <div v-if="activeTab === 'config'" key="config" class="space-y-6">
          <draggable
            v-model="stateData.profiles"
            item-key="name"
            :delay="200"
            :animation="200"
            class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] gap-6"
            @end="recomputeOrders"
          >
            <template #item="{ element: profile, index: pIndex }">
              <ProfileEditor
                :profile="profile"
                :index="pIndex"
                :availableNodes="availableAssets.nodes"
                :availableTemplates="availableAssets.templates"
                :availablePatches="availableAssets.patches"
                :copyStatus="!!copyStatus[pIndex]"
                :expanded="expandedIndex === pIndex"
                :isDraft="draftProfile === profile"
                :globalBusy="globalBusy"
                :isSaving="savingProfileName === profile.name"
                :saveFailed="savingProfileName !== profile.name && profileSaveError !== null && lastSaveAttemptName === profile.name"
                @update:expanded="(val) => toggleExpand(pIndex, val)"
                @copyLink="handleCopyLink"
                @remove="removeProfile"
                @duplicate="duplicateProfile"
                @discard="discardDraftProfile"
                @save="handleSaveProfile"
                @status="(t, m) => showStatus(t, m, 5000)"
              />
            </template>
          </draggable>
        </div>
        <div v-else-if="activeTab === 'assets'" key="assets" class="space-y-6">
            <AssetManager
              ref="assetManagerRef"
              :type="assetType"
              :files="filteredAssets"
              :loading="assetsLoading"
              :globalBusy="globalBusy"
              :subToken="settings?.subToken"
              @refresh="handleAssetRefreshRequest"
              @status="(t, m) => showStatus(t, m, 5000)"
              @delete="markAssetForDeletion"
              @saved="handleAssetSaved"
              @conflict="handleAssetConflict"
            />
          </div>
          <div v-else-if="activeTab === 'settings'" key="settings" class="space-y-6">
            <SettingsView
              :user="user"
              :settings="settings"
              :appVersion="APP_VERSION"
              :loading="loadingData"
              @save="handleSaveSettings"
              @disconnect="handleDisconnect"
              @update:settings="handleUpdateSettings"
            />
          </div>
        </transition>

    </template>


    <ConfirmModal
      :visible="showDisconnectConfirm"
      title="确认断开连接"
      message="此操作将清除服务器上保存的所有设置和缓存配置。下次需要重新配置仓库信息。"
      confirmText="确认断开"
      @confirm="confirmDisconnect"
      @cancel="showDisconnectConfirm = false"
    />

    <ConflictModal
      :visible="conflictVisible"
      @reload="handleConflictAction('reload')"
      @overwrite="handleConflictAction('overwrite')"
      @cancel="handleConflictAction('cancel')"
    />

    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import AppShell from './components/layout/AppShell.vue';
import ConnectForm from './components/ConnectForm.vue';
import ProfileEditor from './components/ProfileEditor.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';
import ConflictModal from './components/ui/ConflictModal.vue';
import GlobalToast from './components/ui/GlobalToast.vue';
import TopToolbar from './components/layout/TopToolbar.vue';
import AssetManager from './components/AssetManager.vue';
import SettingsView from './components/SettingsView.vue';
import { useApi } from './composables/useApi';
import type { SetupData, UserSettings, StateData, Profile } from './types';
import draggable from 'vuedraggable';

const APP_VERSION = 'v3.1.0';

const setupData = reactive<SetupData>({ owner: '', repo: '', pat: '' });
const stateData = ref<StateData | null>(null);
const loadingData = ref(false);
const saveStatus = ref<'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error'>('idle');
const statusMessage = ref('');
const refreshing = ref(false);
const isInitializing = ref(true);
const copyStatus = ref<Record<number, boolean>>({});
const showDisconnectConfirm = ref(false);
const expandedIndex = ref<number | null>(null);
const availableAssets = ref<{ nodes: any[], templates: any[], patches: any[], rulesets: any[] }>({ nodes: [], templates: [], patches: [], rulesets: [] });
const assetsLoaded = ref(false);
const assetsLoading = ref(false);
const assetsLastCheckedAt = ref(0);
const ASSET_CHECK_INTERVAL_MS = 60_000;

const activeTab = ref<'config' | 'assets' | 'settings'>('config');
const assetType = ref<'node' | 'template' | 'patch' | 'ruleset'>('node');
const assetManagerRef = ref<any>(null);
const draftProfile = ref<Profile | null>(null);
const draftProfileWasDirty = ref<boolean | null>(null);
const sidebarOverride = ref<boolean | null>(null);
const isWideDesktop = ref(typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches);
const sidebarExpanded = computed({
  get: () => sidebarOverride.value ?? isWideDesktop.value,
  set: (value: boolean) => { sidebarOverride.value = value; },
});

const isDirty = ref(false);
let suppressDirty = false;
let statusTimer: any = null;

const deletedAssets = ref<string[]>([]);

const savingProfileName = ref<string | null>(null);
const lastSaveAttemptName = ref<string | null>(null);
const profileSaveError = ref<string | null>(null);
const globalBusy = computed(() => saveStatus.value !== 'idle' || refreshing.value);

const conflictVisible = ref(false);
let conflictResolver: ((action: 'reload' | 'overwrite' | 'cancel') => void) | null = null;

function resolveConflict(): Promise<'reload' | 'overwrite' | 'cancel'> {
  conflictVisible.value = true;
  return new Promise(resolve => { conflictResolver = resolve; });
}

function handleConflictAction(action: 'reload' | 'overwrite' | 'cancel') {
  conflictVisible.value = false;
  conflictResolver?.(action);
  conflictResolver = null;
}

async function handleAssetConflict(resolver: (action: 'reload' | 'overwrite' | 'cancel') => void) {
  resolver(await resolveConflict());
}

const filteredAssets = computed(() => {
  const type = assetType.value;
  const arr = type === 'node' ? availableAssets.value.nodes 
            : type === 'template' ? availableAssets.value.templates 
            : type === 'patch' ? availableAssets.value.patches
            : availableAssets.value.rulesets;
  return arr.filter((n: any) => !deletedAssets.value.includes(n.path || n));
});

function showStatus(state: 'success' | 'warning' | 'error', msg: string, duration = 3000) {
  if (statusTimer) clearTimeout(statusTimer);
  saveStatus.value = state;
  statusMessage.value = msg;
  statusTimer = setTimeout(() => { saveStatus.value = 'idle'; }, duration);
}

function recomputeOrders() {
  if (!stateData.value?.profiles) return;
  // Update order fields sequentially based on current array position
  stateData.value.profiles.forEach((p, idx) => {
    p.order = idx;
  });
  isDirty.value = true;
}

const { user, settings, login, bootstrap, saveSettings, deleteSettings, getState, saveState, rebuild, getAssets, deleteFile } = useApi();

async function refreshAssets(excludedPaths: Iterable<string> = [], force = false): Promise<boolean> {
  const excluded = new Set(excludedPaths);
  const showInitialLoading = !assetsLoaded.value;
  if (showInitialLoading) assetsLoading.value = true;
  try {
    const data = await getAssets(force);
    availableAssets.value = {
      nodes: data.nodes.filter((item: any) => !excluded.has(item.path || item)),
      templates: data.templates.filter((item: any) => !excluded.has(item.path || item)),
      patches: data.patches.filter((item: any) => !excluded.has(item.path || item)),
      rulesets: data.rulesets.filter((item: any) => !excluded.has(item.path || item)),
    };
    assetsLoaded.value = true;
    assetsLastCheckedAt.value = Date.now();
    pruneStaleReferences();
    return true;
  } catch {
    if (!assetsLoaded.value) {
      availableAssets.value = { nodes: [], templates: [], patches: [], rulesets: [] };
    }
    return false;
  } finally {
    if (showInitialLoading) assetsLoading.value = false;
  }
}

async function ensureAssetsLoaded() {
  if (!assetsLoaded.value || Date.now() - assetsLastCheckedAt.value >= ASSET_CHECK_INTERVAL_MS) {
    await refreshAssets();
  }
}

function handleAssetRefreshRequest(force = false) {
  void refreshAssets([], force);
}

function pruneStaleReferences() {
  if (!stateData.value?.profiles) return;
  const nodePaths = new Set(availableAssets.value.nodes.map((n: any) => n.path || n));
  const templatePaths = new Set(availableAssets.value.templates.map((t: any) => t.path || t));
  const patchPaths = new Set(availableAssets.value.patches.map((p: any) => p.path || p));

  for (const profile of stateData.value.profiles) {
    if (profile.nodesPath && !nodePaths.has(profile.nodesPath)) {
      profile.nodesPath = '';
    }
    if (profile.templateUrl && !profile.templateUrl.startsWith('http') && !templatePaths.has(profile.templateUrl)) {
      profile.templateUrl = '';
    }
    if (profile.patchUrl && !patchPaths.has(profile.patchUrl)) {
      profile.patchUrl = '';
    }
  }
}

function setStateData(state: StateData) {
  suppressDirty = true;
  stateData.value = state;
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

watch(activeTab, (tab) => {
  if (tab === 'assets') void ensureAssetsLoaded();
});



function updateViewportLayout() {
  isWideDesktop.value = window.matchMedia('(min-width: 1280px)').matches;
}

function handleAssetSaved(file: { path: string; oldPath?: string; note: string; type: 'node' | 'template' | 'patch' | 'ruleset' }) {
  const list = availableAssets.value[file.type === 'node' ? 'nodes' : file.type === 'template' ? 'templates' : file.type === 'patch' ? 'patches' : 'rulesets'];
  const oldIndex = file.oldPath ? list.findIndex((item: any) => (item.path || item) === file.oldPath) : -1;
  if (oldIndex >= 0) list.splice(oldIndex, 1);
  const existing = list.find((item: any) => (item.path || item) === file.path);
  const next = { path: file.path, note: file.note };
  if (existing && typeof existing === 'object') Object.assign(existing, next);
  else if (!existing) list.unshift(next);
  assetsLoaded.value = true;
  assetsLastCheckedAt.value = Date.now();
}

onMounted(async () => {
  updateViewportLayout();
  window.addEventListener('resize', updateViewportLayout, { passive: true });
  try {
    const data = await bootstrap();
    if (data.settings && data.state) setStateData(data.state);
  } catch { /* not logged in */ }
  isInitializing.value = false;
});

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportLayout);
});

async function handleSetup() {
  if (!setupData.owner || !setupData.repo || !setupData.pat) return;
  loadingData.value = true;
  try {
    const result = await login(setupData);
    const data = await bootstrap();
    assetsLoaded.value = false;
    assetsLastCheckedAt.value = 0;
    availableAssets.value = { nodes: [], templates: [], patches: [], rulesets: [] };
    if (data.state) setStateData(data.state);
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
    assetsLoaded.value = false;
    assetsLastCheckedAt.value = 0;
    availableAssets.value = { nodes: [], templates: [], patches: [], rulesets: [] };
    const data = await bootstrap();
    if (data.state) setStateData(data.state);
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
  assetsLoaded.value = false;
  assetsLastCheckedAt.value = 0;
  availableAssets.value = { nodes: [], templates: [], patches: [], rulesets: [] };
}

async function handleSave(): Promise<void> {
  if (!stateData.value) return;
  saveStatus.value = 'saving';
  statusMessage.value = '';
  try {
    let failedPaths: string[] = [];

    if (deletedAssets.value.length > 0) {
      const paths = [...new Set(deletedAssets.value)];
      const results = await Promise.allSettled(paths.map(path => deleteFile(path)));
      const deletedPaths = paths.filter((_, index) => results[index].status === 'fulfilled');
      failedPaths = paths.filter((_, index) => results[index].status === 'rejected');
      deletedAssets.value = failedPaths;
      await refreshAssets(deletedPaths);
    }

    const data = await saveState(stateData.value);
    if (failedPaths.length > 0) throw new Error(`删除文件失败: ${failedPaths.join(', ')}`);

    isDirty.value = false;
    if (data.warning) {
      showStatus('warning', '规则已保存，但构建失败: ' + data.warning, 5000);
    } else {
      showStatus('success', '保存成功，配置已更新', 3000);
    }
  } catch (e: any) {
    if (e.status === 409) {
      const action = await resolveConflict();
      if (action === 'reload') {
        const data = await getState();
        setStateData(data.state);
        showStatus('warning', '已重新加载最新版本，请检查改动是否需要重新应用', 5000);
      } else if (action === 'overwrite') {
        return handleSave();
      }
      return;
    }
    showStatus('error', e.message || '保存失败', 5000);
  }
}

async function handleSaveProfile(profileName: string, oldProfileName?: string): Promise<void> {
  if (!stateData.value) return;
  const p = stateData.value.profiles.find(x => x.name === profileName);
  if (p) p.updated_at = Date.now();
  saveStatus.value = 'saving';
  statusMessage.value = '';
  suppressDirty = true;
  savingProfileName.value = profileName;
  lastSaveAttemptName.value = profileName;
  try {
    const data = await saveState(stateData.value, profileName, oldProfileName);
    profileSaveError.value = null;
    if (p === draftProfile.value) {
      draftProfile.value = null;
      draftProfileWasDirty.value = null;
    }
    isDirty.value = false;
    if (data.warning) {
      showStatus('warning', '配置已保存，但构建失败: ' + data.warning, 5000);
    } else {
      showStatus('success', '保存成功，配置已更新', 3000);
    }
  } catch (e: any) {
    if (e.status === 409) {
      const action = await resolveConflict();
      if (action === 'reload') {
        const data = await getState();
        setStateData(data.state);
        profileSaveError.value = null;
        showStatus('warning', '已重新加载最新版本，请检查改动是否需要重新应用', 5000);
      } else if (action === 'overwrite') {
        savingProfileName.value = null;
        nextTick(() => { suppressDirty = false; });
        return handleSaveProfile(profileName);
      } else {
        profileSaveError.value = '已取消';
      }
    } else {
      const msg = e.message || '保存失败';
      profileSaveError.value = msg;
      showStatus('error', msg, 5000);
    }
  } finally {
    savingProfileName.value = null;
    nextTick(() => {
      suppressDirty = false;
    });
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
    deletedAssets.value = [];
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
  const profile: Profile = {
    name: '', note: '', templateUrl: '', nodesPath: '',
    rules: [], inboundRules: [],
    created_at: Date.now(),
    updated_at: Date.now(),
    order: stateData.value.profiles.length
  };
  const wasDirty = isDirty.value;
  draftProfileWasDirty.value = wasDirty;
  draftProfile.value = profile;
  suppressDirty = true;
  stateData.value.profiles.push(profile);
  expandedIndex.value = stateData.value.profiles.length - 1;
  nextTick(() => {
    suppressDirty = false;
    isDirty.value = wasDirty;
  });
  void ensureAssetsLoaded();
}

function removeProfile(index: number) {
  if (!stateData.value) return;
  const removedProfile = stateData.value.profiles[index];
  if (removedProfile === draftProfile.value) {
    draftProfile.value = null;
    draftProfileWasDirty.value = null;
  }
  if (expandedIndex.value === index) expandedIndex.value = null;
  else if (expandedIndex.value !== null && expandedIndex.value > index) expandedIndex.value--;
  stateData.value.profiles.splice(index, 1);
  recomputeOrders();
}

function discardDraftProfile(profile: Profile) {
  if (!stateData.value || draftProfile.value !== profile) return;

  const index = stateData.value.profiles.indexOf(profile);
  const wasDirty = draftProfileWasDirty.value ?? isDirty.value;
  if (index >= 0) {
    stateData.value.profiles.splice(index, 1);
    stateData.value.profiles.forEach((item, itemIndex) => { item.order = itemIndex; });
  }
  if (expandedIndex.value === index) expandedIndex.value = null;
  else if (expandedIndex.value !== null && expandedIndex.value > index) expandedIndex.value--;

  draftProfile.value = null;
  draftProfileWasDirty.value = null;
  nextTick(() => { isDirty.value = wasDirty; });
}

function duplicateProfile(source: Profile) {
  if (!stateData.value) return;
  if (!source) return;
  const index = stateData.value.profiles.findIndex(p => p.name === source.name);
  const copy: Profile = JSON.parse(JSON.stringify(source));
  copy.name = `${source.name || 'untitled'}_copy`;
  copy.created_at = Date.now();
  copy.updated_at = Date.now();
  stateData.value.profiles.splice(index + 1, 0, copy);
  recomputeOrders();
  expandedIndex.value = index + 1;
  void ensureAssetsLoaded();
}

function markAssetForDeletion(file: any) {
  deletedAssets.value.push(file.path);
  isDirty.value = true;
}

function toggleExpand(index: number, forceState?: boolean) {
  if (forceState !== undefined) {
    if (forceState) {
      expandedIndex.value = index;
    } else if (expandedIndex.value === index) {
      expandedIndex.value = null;
    }
  } else {
    expandedIndex.value = expandedIndex.value === index ? null : index;
  }
  if (expandedIndex.value === index) void ensureAssetsLoaded();
}

async function handleGlobalAdd() {
  if (activeTab.value === 'config') {
    addProfile();
  } else if (activeTab.value === 'assets') {
    if (assetManagerRef.value) {
      assetManagerRef.value.createFile();
    }
  }
}

function handleGlobalSave() {
  handleSave();
}

async function handleGlobalRefresh() {
  if (activeTab.value !== 'assets') {
    await handleRefresh();
    return;
  }
  if (refreshing.value) return;
  refreshing.value = true;
  saveStatus.value = 'refreshing';
  statusMessage.value = '';
  try {
    const refreshed = await refreshAssets([], true);
    if (!refreshed) throw new Error('无法从 GitHub 同步组件');
    deletedAssets.value = [];
    showStatus('success', '组件同步成功', 3000);
  } catch (e: any) {
    showStatus('error', '组件同步失败: ' + e.message, 5000);
  } finally {
    refreshing.value = false;
  }
}
</script>

<style>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.25s cubic-bezier(0.2, 0, 0, 1), transform 0.25s cubic-bezier(0.2, 0, 0, 1);
  will-change: opacity, transform;
}

.fade-scale-enter-from {
  opacity: 0;
  transform: scale(0.98) translateY(10px);
}

.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
