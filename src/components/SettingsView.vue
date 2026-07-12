<template>
  <div class="mx-auto max-w-5xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 md:space-y-6">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section class="glass flex min-h-24 items-center justify-between gap-4 rounded-xl border border-border-base p-5 md:p-6">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-pink/10 text-brand-pink">
            <Info :size="20" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-text-primary">关于</h2>
            <p class="mt-0.5 text-sm text-text-muted">{{ appVersion }}</p>
          </div>
        </div>
        <a
          href="https://github.com/Leovikii/Sing-Sub"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-bg-elevated px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink"
        >
          <Github :size="16" />
          GitHub
          <ExternalLink :size="14" aria-hidden="true" />
        </a>
      </section>

      <section class="glass flex min-h-24 items-center justify-between gap-4 rounded-xl border border-border-base p-5 md:p-6">
        <div class="flex min-w-0 items-center gap-3">
          <img v-if="user" :src="user.avatar_url" :alt="user.login" class="h-12 w-12 shrink-0 rounded-full border-2 border-border-base" />
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-text-primary">{{ user?.login || 'GitHub' }}</h2>
            <p class="mt-0.5 flex items-center gap-1.5 text-sm text-text-muted">
              <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              已连接
            </p>
          </div>
        </div>
        <ToolbarButton
          :icon="LogOut"
          label="断开连接"
          variant="danger"
          size="touch"
          class="shrink-0"
          @click="$emit('disconnect')"
        />
      </section>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
      <section class="glass space-y-4 rounded-xl border border-border-base p-5 md:space-y-6 md:p-6">
        <div class="flex items-center gap-3">
          <div class="rounded-lg bg-blue-500/10 p-2.5 text-blue-400">
            <Database :size="20" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-text-primary">仓库设置</h3>
            <p class="text-sm text-text-muted">配置数据存储位置</p>
          </div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-muted">Repository (Owner/Repo)</label>
            <Input :modelValue="ownerRepo" placeholder="owner/repo" @update:modelValue="onOwnerRepoChange" />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text-muted">Personal Access Token (PAT)</label>
            <Input v-model="editPat" type="password" placeholder="留空则不修改" />
            <p class="mt-2 text-xs text-text-muted">用于通过 GitHub API 读写配置文件</p>
          </div>
        </div>
      </section>

      <section class="glass flex flex-col space-y-4 rounded-xl border border-border-base p-5 md:space-y-6 md:p-6">
        <div class="flex items-center gap-3">
          <div class="rounded-lg bg-brand-pink/10 p-2.5 text-brand-pink">
            <Key :size="20" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-text-primary">订阅访问</h3>
            <p class="text-sm text-text-muted">管理客户端拉取权限</p>
          </div>
        </div>

        <div class="flex-1">
          <label class="mb-1.5 block text-sm font-medium text-text-muted">Subscription Token</label>
          <div class="flex gap-2">
            <Input v-model="editToken" placeholder="订阅 Token" class="min-w-0 flex-1" />
            <ToolbarButton
              :icon="Shuffle"
              label="随机生成订阅 Token"
              size="touch"
              iconOnly
              showTooltip
              class="shrink-0"
              @click="generateToken"
            />
          </div>
          <div class="mt-2 min-h-5">
            <Transition name="fade">
              <p v-if="tokenChanged" class="flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle :size="13" /> 修改后旧链接将失效
              </p>
            </Transition>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <Button :loading="loading" variant="primary" class="w-full px-8 md:w-auto" @click="handleSave">
            保存更改
          </Button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertTriangle, Database, ExternalLink, Github, Info, Key, LogOut, Shuffle } from 'lucide-vue-next';
import Input from './ui/Input.vue';
import Button from './ui/Button.vue';
import ToolbarButton from './ui/ToolbarButton.vue';
import type { GithubUser, UserSettings } from '../types';

const props = defineProps<{
  user: GithubUser | null;
  settings: UserSettings | null;
  appVersion: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  save: [value: { owner: string; repo: string; pat: string; subToken: string }];
  disconnect: [];
  'update:settings': [value: Partial<UserSettings>];
}>();

const ownerRepo = ref('');
const editPat = ref('');
const editToken = ref('');

const tokenChanged = computed(() => props.settings != null && editToken.value !== props.settings.subToken);

watch(() => props.settings, (settings) => {
  if (settings) {
    ownerRepo.value = `${settings.owner}/${settings.repo}`;
    editToken.value = settings.subToken;
  }
}, { immediate: true });

function generateToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  editToken.value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function onOwnerRepoChange(value: string) {
  ownerRepo.value = value;
}

function handleSave() {
  const slash = ownerRepo.value.indexOf('/');
  const owner = slash >= 0 ? ownerRepo.value.slice(0, slash) : ownerRepo.value;
  const repo = slash >= 0 ? ownerRepo.value.slice(slash + 1) : '';
  emit('save', { owner, repo, pat: editPat.value, subToken: editToken.value });
  editPat.value = '';
}
</script>
