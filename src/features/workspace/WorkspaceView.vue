<template>
  <AppShell :user="user" :show-navigation="!!stateData" @logout="handleDisconnect">
    <div class="mx-auto max-w-7xl space-y-10 p-6 md:p-12">

    <div v-if="isInitializing" class="flex justify-center items-center py-32">
      <Loader2 :size="32" class="animate-spin text-brand-pink" />
    </div>

    <ConnectForm
      v-else-if="!settings"
      :setupData="setupData"
      :loading="loadingData"
      :setupRequired="setupRequired"
      @update:setupData="Object.assign(setupData, $event)"
      @save="handleSetup"
    />

    <template v-else-if="stateData">
      <TopToolbar
        v-if="isProfilesRoute || isResourceRoute"
        :saveStatus="saveStatus"
        :isDirty="isDirty"
        :showSave="true"
        @add="handleGlobalAdd"
        @save="handleSave"
      />

      <transition name="page-fade" mode="out-in">
        <div v-if="isProfilesRoute" key="profiles" class="space-y-6">
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
                :availableNodes="availableAssets.nodes.map(asset => asset.path)"
                :availableTemplates="availableAssets.templates.map(asset => asset.path)"
                :availablePatches="availableAssets.patches.map(asset => asset.path)"
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
        <div v-else-if="isResourceRoute" :key="route.path" class="space-y-6">
            <AssetManager
              ref="assetManagerRef"
              :type="assetType"
              :files="filteredAssets"
              :loading="assetsLoading"
              :globalBusy="globalBusy"
              :revision="workspaceRevision"
              @refresh="handleAssetRefreshRequest"
              @status="(t, m) => showStatus(t, m, 5000)"
              @delete="markAssetForDeletion"
              @saved="handleAssetSaved"
              @conflict="handleAssetConflict"
            />
          </div>
        <SyncPage
          v-else-if="isSyncRoute"
          key="sync"
          :revision="workspaceRevision || ''"
          @revision="workspaceRevision = $event"
        />
        <GeneralSettings v-else-if="settingsSection === 'general'" key="settings-general" />
        <SubscriptionSettings
          v-else-if="settingsSection === 'subscription'"
          key="settings-subscription"
          :token="settings.subToken"
          :loading="loadingData"
          @rotate="handleSaveSettings({ rotateSubscriptionToken: true })"
        />
        <RepositorySettings
          v-else-if="settingsSection === 'repository'"
          key="settings-repository"
          @revision="workspaceRevision = $event"
        />
        <AboutSettings v-else-if="settingsSection === 'about'" key="settings-about" :version="APP_VERSION" />
        </transition>

    </template>

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
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { Loader2 } from 'lucide-vue-next';
import AppShell from '../../components/layout/AppShell.vue';
import ConnectForm from '../../components/ConnectForm.vue';
import ProfileEditor from '../../components/ProfileEditor.vue';
import ConflictModal from '../../components/ui/ConflictModal.vue';
import TopToolbar from '../../components/layout/TopToolbar.vue';
import AssetManager from '../../components/AssetManager.vue';
import GeneralSettings from '../settings/GeneralSettings.vue';
import SubscriptionSettings from '../settings/SubscriptionSettings.vue';
import RepositorySettings from '../settings/RepositorySettings.vue';
import AboutSettings from '../settings/AboutSettings.vue';
import SyncPage from '../sync/SyncPage.vue';
import { useApi } from '../../composables/useApi';
import { useAssetsStore } from '../../stores/assets';
import { useSessionStore } from '../../stores/session';
import { useWorkspaceStore } from '../../stores/workspace';
import type { SetupData, StateData, Profile } from '../../types';
import draggable from 'vuedraggable';

const APP_VERSION = 'v3.0.0-beta.1';
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();
const { t } = useI18n();
const sessionStore = useSessionStore();
const workspaceStore = useWorkspaceStore();
const assetsStore = useAssetsStore();
const { bootstrap, login, logout, saveSettings } = sessionStore;
const { settings, setupRequired, initializing: isInitializing, loading: loadingData, user } = storeToRefs(sessionStore);
const { revision: workspaceRevision, state: stateData, dirty: isDirty } = storeToRefs(workspaceStore);
const {
  items: availableAssets,
  loaded: assetsLoaded,
  loading: assetsLoading,
  lastCheckedAt: assetsLastCheckedAt,
  deletedPaths: deletedAssets,
} = storeToRefs(assetsStore);

const setupData = reactive<SetupData>({ adminPassword: '', owner: '', repo: '', pat: '' });
const saveStatus = ref<'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error'>('idle');
const statusMessage = ref('');
const copyStatus = ref<Record<number, boolean>>({});
const expandedIndex = ref<number | null>(null);
const ASSET_CHECK_INTERVAL_MS = 60_000;

const isProfilesRoute = computed(() => route.name === 'profiles');
const isResourceRoute = computed(() => String(route.name || '').startsWith('resource-'));
const isSyncRoute = computed(() => route.name === 'sync');
const settingsSection = computed(() => String(route.name || '').startsWith('settings-')
  ? String(route.name).slice('settings-'.length)
  : null);
const assetType = computed<'node' | 'template' | 'patch' | 'ruleset'>(() => {
  if (route.name === 'resource-templates') return 'template';
  if (route.name === 'resource-patches') return 'patch';
  if (route.name === 'resource-rulesets') return 'ruleset';
  return 'node';
});
const assetManagerRef = ref<any>(null);
const draftProfile = ref<Profile | null>(null);
const draftProfileWasDirty = ref<boolean | null>(null);

let suppressDirty = false;
let statusTimer: any = null;


const savingProfileName = ref<string | null>(null);
const lastSaveAttemptName = ref<string | null>(null);
const profileSaveError = ref<string | null>(null);
const globalBusy = computed(() => saveStatus.value !== 'idle');

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
  toast.add({ severity: state === 'warning' ? 'warn' : state, summary: msg, life: duration });
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

const {
  getState,
  saveState,
  getAssets,
  deleteFile,
} = useApi();

async function refreshAssets(excludedPaths: Iterable<string> = []): Promise<number | false> {
  const excluded = new Set(excludedPaths);
  const showInitialLoading = !assetsLoaded.value;
  if (showInitialLoading) assetsLoading.value = true;
  try {
    const data = await getAssets();
    availableAssets.value = {
      nodes: data.nodes.filter((item: any) => !excluded.has(item.path || item)),
      templates: data.templates.filter((item: any) => !excluded.has(item.path || item)),
      patches: data.patches.filter((item: any) => !excluded.has(item.path || item)),
      rulesets: data.rulesets.filter((item: any) => !excluded.has(item.path || item)),
    };
    assetsLoaded.value = true;
    assetsLastCheckedAt.value = Date.now();
    return pruneStaleReferences();
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

function handleAssetRefreshRequest() {
  void refreshAssets();
}

function pruneStaleReferences() {
  if (!stateData.value?.profiles) return 0;
  const nodePaths = new Set(availableAssets.value.nodes.map((n: any) => n.path || n));
  const templatePaths = new Set(availableAssets.value.templates.map((t: any) => t.path || t));
  const patchPaths = new Set(availableAssets.value.patches.map((p: any) => p.path || p));
  let removedCount = 0;

  for (const profile of stateData.value.profiles) {
    if (profile.nodesPath && !nodePaths.has(profile.nodesPath)) {
      profile.nodesPath = '';
      removedCount++;
    }
    if (profile.templateUrl && !profile.templateUrl.startsWith('http') && !templatePaths.has(profile.templateUrl)) {
      profile.templateUrl = '';
      removedCount++;
    }
    if (profile.patchUrl && !patchPaths.has(profile.patchUrl)) {
      profile.patchUrl = '';
      removedCount++;
    }
  }

  if (removedCount > 0) {
    isDirty.value = true;
    showStatus('warning', t('workspace.staleReferences', { count: removedCount }), 5000);
  }
  return removedCount;
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

watch(() => route.path, () => {
  if (isResourceRoute.value || isProfilesRoute.value) void ensureAssetsLoaded();
});

function handleAssetSaved(file: { path: string; oldPath?: string; note: string; type: 'node' | 'template' | 'patch' | 'ruleset'; revision: string }) {
  workspaceRevision.value = file.revision;
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
  try {
    const data = await bootstrap();
    setupRequired.value = data.setupRequired;
    if (data.settings && data.state) {
      workspaceRevision.value = data.revision || null;
      setStateData(data.state);
      if (route.name === 'connect') await router.replace('/profiles');
      if (isResourceRoute.value || isProfilesRoute.value) await ensureAssetsLoaded();
    } else if (route.name !== 'connect') {
      await router.replace('/connect');
    }
  } catch {
    if (route.name !== 'connect') await router.replace('/connect');
  }
  isInitializing.value = false;
});

onUnmounted(() => {
  if (statusTimer) clearTimeout(statusTimer);
});

async function handleSetup() {
  if (!setupData.adminPassword) return;
  const githubFields = [setupData.owner, setupData.repo, setupData.pat];
  const importingFromGithub = githubFields.some(Boolean);
  if (setupRequired.value && importingFromGithub && !githubFields.every(Boolean)) return;
  loadingData.value = true;
  try {
    const loginRequest = setupRequired.value && importingFromGithub
      ? { ...setupData }
      : { adminPassword: setupData.adminPassword };
    const result = await login(loginRequest);
    const data = await bootstrap();
    setupRequired.value = data.setupRequired;
    assetsLoaded.value = false;
    assetsLastCheckedAt.value = 0;
    availableAssets.value = { nodes: [], templates: [], patches: [], rulesets: [] };
    if (data.state) {
      workspaceRevision.value = data.revision || result.revision;
      setStateData(data.state);
    }
    await router.replace('/profiles');
    setupData.adminPassword = '';
    setupData.pat = '';
    if (result.warning) {
      showStatus('warning', t('workspace.loginWarning', { message: result.warning }), 5000);
    }
  } catch (e: any) {
    showStatus('error', t('workspace.loginFailed', { message: e.message }), 5000);
  } finally {
    loadingData.value = false;
  }
}

async function handleSaveSettings(newSettings: { rotateSubscriptionToken: boolean }) {
  loadingData.value = true;
  try {
    if (!workspaceRevision.value) throw new Error(t('workspace.revisionMissing'));
    const result = await saveSettings({ ...newSettings, expectedRevision: workspaceRevision.value });
    workspaceRevision.value = result.revision;
    assetsLoaded.value = false;
    assetsLastCheckedAt.value = 0;
    availableAssets.value = { nodes: [], templates: [], patches: [], rulesets: [] };
    const data = await bootstrap();
    if (data.state) setStateData(data.state);
    if (result.warning) {
      showStatus('warning', t('workspace.settingsWarning', { message: result.warning }), 5000);
    } else {
      showStatus('success', t('workspace.settingsSaved'), 3000);
    }
  } catch (e: any) {
    showStatus('error', t('workspace.settingsFailed', { message: e.message }), 5000);
  } finally {
    loadingData.value = false;
  }
}

function handleDisconnect() {
  confirm.require({
    header: t('workspace.logoutTitle'),
    message: t('workspace.logoutMessage'),
    rejectLabel: t('common.cancel'),
    acceptLabel: t('nav.logout'),
    acceptClass: 'p-button-danger',
    accept: () => { void confirmDisconnect(); },
  });
}

async function confirmDisconnect() {
  await logout();
  stateData.value = null;
  assetsLoaded.value = false;
  assetsLastCheckedAt.value = 0;
  availableAssets.value = { nodes: [], templates: [], patches: [], rulesets: [] };
  await router.replace('/connect');
}

async function handleSave(): Promise<void> {
  if (!stateData.value) return;
  saveStatus.value = 'saving';
  statusMessage.value = '';
  try {
    const failedPaths: string[] = [];

    if (deletedAssets.value.length > 0) {
      const paths = [...new Set(deletedAssets.value)];
      const deletedPaths: string[] = [];
      for (const path of paths) {
        if (!workspaceRevision.value) throw new Error(t('workspace.revisionMissing'));
        try {
          const result = await deleteFile(path, workspaceRevision.value);
          workspaceRevision.value = result.revision;
          deletedPaths.push(path);
        } catch {
          failedPaths.push(path);
        }
      }
      deletedAssets.value = failedPaths;
      await refreshAssets(deletedPaths);
    }

    if (!workspaceRevision.value) throw new Error(t('workspace.revisionMissing'));
    const data = await saveState(stateData.value, workspaceRevision.value);
    workspaceRevision.value = data.revision;
    if (failedPaths.length > 0) throw new Error(t('workspace.deleteFailed', { paths: failedPaths.join(', ') }));

    isDirty.value = false;
    if (data.warning) {
      showStatus('warning', t('workspace.stateWarning', { message: data.warning }), 5000);
    } else {
      showStatus('success', t('workspace.saved'), 3000);
    }
  } catch (e: any) {
    if (e.status === 409) {
      const action = await resolveConflict();
      if (action === 'reload') {
        const data = await getState();
        workspaceRevision.value = data.revision;
        setStateData(data.state);
        showStatus('warning', t('workspace.reloadNotice'), 5000);
      } else if (action === 'overwrite') {
        const latest = await getState();
        workspaceRevision.value = latest.revision;
        return handleSave();
      }
      return;
    }
    showStatus('error', e.message || t('workspace.saveFailed'), 5000);
  }
}

async function handleSaveProfile(profileDraft: Profile, profileIndex: number, oldProfileName?: string): Promise<void> {
  if (!stateData.value) return;
  const wasDraft = stateData.value.profiles[profileIndex] === draftProfile.value;
  const profile = JSON.parse(JSON.stringify(profileDraft)) as Profile;
  profile.updated_at = Date.now();
  stateData.value.profiles.splice(profileIndex, 1, profile);
  const profileName = profile.name || '';
  saveStatus.value = 'saving';
  statusMessage.value = '';
  suppressDirty = true;
  savingProfileName.value = profileName;
  lastSaveAttemptName.value = profileName;
  try {
    if (!workspaceRevision.value) throw new Error(t('workspace.revisionMissing'));
    const data = await saveState(stateData.value, workspaceRevision.value, profileName, oldProfileName);
    workspaceRevision.value = data.revision;
    profileSaveError.value = null;
    if (wasDraft) {
      draftProfile.value = null;
      draftProfileWasDirty.value = null;
    }
    isDirty.value = false;
    if (data.warning) {
      showStatus('warning', t('workspace.profileWarning', { message: data.warning }), 5000);
    } else {
      showStatus('success', t('workspace.saved'), 3000);
    }
  } catch (e: any) {
    if (e.status === 409) {
      const action = await resolveConflict();
      if (action === 'reload') {
        const data = await getState();
        workspaceRevision.value = data.revision;
        setStateData(data.state);
        profileSaveError.value = null;
        showStatus('warning', t('workspace.reloadNotice'), 5000);
      } else if (action === 'overwrite') {
        const latest = await getState();
        workspaceRevision.value = latest.revision;
        savingProfileName.value = null;
        nextTick(() => { suppressDirty = false; });
        return handleSaveProfile(profile, profileIndex, oldProfileName);
      } else {
        profileSaveError.value = t('workspace.cancelled');
      }
    } else {
      const msg = e.message || t('workspace.saveFailed');
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
    showStatus('error', t('workspace.copyFailed'), 3000);
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
  if (isProfilesRoute.value) {
    addProfile();
  } else if (isResourceRoute.value) {
    if (assetManagerRef.value) {
      assetManagerRef.value.createFile();
    }
  }
}
</script>

<style>
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 150ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .page-fade-enter-active,
  .page-fade-leave-active {
    transition: none;
  }
}
</style>
