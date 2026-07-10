<template>
  <div class="max-w-3xl mx-auto space-y-5 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Profile Card -->
    <div class="glass border border-[#38383a] rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-4 md:gap-6 relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-[#F596AA]/10 to-transparent pointer-events-none"></div>
      
      <div class="relative">
        <img v-if="user" :src="user.avatar_url" class="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-[#1c1c1e] shadow-xl" />
        <div class="absolute bottom-0 right-0 w-5 h-5 md:w-6 md:h-6 bg-emerald-500 rounded-full border-[3px] md:border-4 border-[#1c1c1e]"></div>
      </div>
      
      <div class="text-center md:text-left z-10 flex-1">
        <h2 class="text-xl md:text-2xl font-bold text-[#f5f5f7]">{{ user?.login || '未登录' }}</h2>
        <p class="text-[#86868b] mt-1 flex items-center justify-center md:justify-start gap-1.5 text-sm md:text-base">
          <Github :size="14" class="md:w-4 md:h-4" /> GitHub 账号已连接
        </p>
      </div>

      <div class="z-10 mt-2 md:mt-0">
        <button @click="$emit('disconnect')" class="px-4 py-2 md:px-5 md:py-2.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm md:text-base font-medium transition-colors border border-red-500/20 flex items-center gap-1.5 cursor-pointer">
          <LogOut :size="14" class="md:w-4 md:h-4" />
          断开连接
        </button>
      </div>
    </div>

    <!-- Configuration Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      
      <!-- Repository Settings -->
      <div class="glass border border-[#38383a] rounded-3xl p-5 md:p-6 space-y-4 md:space-y-6">
        <div class="flex items-center gap-3">
          <div class="p-2 md:p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
            <Database :size="20" class="md:w-6 md:h-6" />
          </div>
          <div>
            <h3 class="text-base md:text-lg font-semibold text-[#f5f5f7]">仓库设置</h3>
            <p class="text-xs md:text-sm text-[#86868b]">配置数据存储位置</p>
          </div>
        </div>

        <div class="space-y-3 md:space-y-4">
          <div>
            <label class="block text-xs md:text-sm font-medium text-[#a1a1a6] mb-1.5">Repository (Owner/Repo)</label>
            <Input :modelValue="ownerRepo" @update:modelValue="onOwnerRepoChange" placeholder="owner/repo" />
          </div>
          <div>
            <label class="block text-xs md:text-sm font-medium text-[#a1a1a6] mb-1.5">Personal Access Token (PAT)</label>
            <Input v-model="editPat" type="password" placeholder="留空则不修改" />
            <p class="text-[11px] md:text-xs text-[#86868b] mt-1.5 md:mt-2">用于通过 GitHub API 读写配置文件</p>
          </div>
        </div>
      </div>

      <!-- Access Settings -->
      <div class="glass border border-[#38383a] rounded-3xl p-5 md:p-6 space-y-4 md:space-y-6 flex flex-col">
        <div class="flex items-center gap-3">
          <div class="p-2 md:p-2.5 rounded-xl bg-[#F596AA]/10 text-[#F596AA]">
            <Key :size="20" class="md:w-6 md:h-6" />
          </div>
          <div>
            <h3 class="text-base md:text-lg font-semibold text-[#f5f5f7]">订阅访问</h3>
            <p class="text-xs md:text-sm text-[#86868b]">管理客户端拉取权限</p>
          </div>
        </div>

        <div class="space-y-3 md:space-y-4 flex-1">
          <div>
            <label class="block text-xs md:text-sm font-medium text-[#a1a1a6] mb-1.5">Subscription Token</label>
            <div class="flex gap-2">
              <Input v-model="editToken" placeholder="订阅 Token" class="flex-1" />
              <button
                @click="generateToken"
                class="shrink-0 px-3 md:px-4 rounded-xl bg-[#2c2c2e] text-[#86868b] hover:text-[#F596AA] hover:bg-[#3a3a3c] transition-colors cursor-pointer border border-[#38383a]"
                title="随机生成"
              >
                <Shuffle :size="16" class="md:w-[18px] md:h-[18px]" />
              </button>
            </div>
            <div class="h-6 mt-1.5">
              <Transition name="fade">
                <p v-if="tokenChanged" class="text-[11px] md:text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle :size="12" /> 修改后旧链接将失效！
                </p>
              </Transition>
            </div>
          </div>
        </div>

        <div class="pt-2 md:pt-4 flex justify-end">
          <Button @click="handleSave" :loading="loading" variant="primary" class="px-6 md:px-8 w-full md:w-auto shadow-lg shadow-[#F596AA]/20">
            保存更改
          </Button>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Github, LogOut, Database, Key, Shuffle, AlertTriangle } from 'lucide-vue-next';
import Input from './ui/Input.vue';
import Button from './ui/Button.vue';
import type { UserSettings, GithubUser } from '../types';

const props = defineProps<{
  user: GithubUser | null;
  settings: UserSettings | null;
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

const tokenChanged = computed(() =>
  props.settings != null && editToken.value !== props.settings.subToken
);

watch(() => props.settings, (s) => {
  if (s) {
    ownerRepo.value = `${s.owner}/${s.repo}`;
    editToken.value = s.subToken;
  }
}, { immediate: true });

function generateToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  editToken.value = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
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
