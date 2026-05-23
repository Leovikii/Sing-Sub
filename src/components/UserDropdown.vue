<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-2 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 -translate-y-2 scale-95"
  >
    <div v-if="visible" ref="panelRef" class="absolute right-0 top-full mt-2 w-80 z-[60] rounded-2xl border border-[#38383a] shadow-2xl glass p-5 space-y-4">
      <div class="flex items-center gap-3">
        <img v-if="user" :src="user.avatar_url" class="w-12 h-12 rounded-full border-2 border-[#38383a]" />
        <div>
          <div class="text-[#f5f5f7] font-medium">{{ user?.login }}</div>
          <div class="text-[#86868b] text-xs">已连接</div>
        </div>
      </div>

      <div class="space-y-3">
        <AppleInput :modelValue="ownerRepo" @update:modelValue="onOwnerRepoChange" placeholder="owner/repo" />
        <AppleInput v-model="editPat" type="password" placeholder="更新 PAT (留空则不修改)" />
        <div class="space-y-1.5">
          <div class="flex gap-2">
            <AppleInput v-model="editToken" placeholder="订阅 Token" class="flex-1" />
            <button
              @click="generateToken"
              class="shrink-0 px-3 rounded-xl bg-[#2c2c2e] text-[#86868b] hover:text-[#F596AA] hover:bg-[#3a3a3c] transition-colors cursor-pointer border border-[#38383a]"
              title="随机生成"
            >
              <Shuffle :size="16" />
            </button>
          </div>
          <p v-if="tokenChanged" class="text-xs text-amber-400 pl-1">修改 Token 会导致旧订阅链接失效</p>
        </div>
      </div>

      <div class="flex items-center justify-between pt-1">
        <button @click="$emit('disconnect')" class="text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer">
          断开连接
        </button>
        <AppleButton @click="handleSave" :loading="loading" variant="primary" class="px-5">
          保存
        </AppleButton>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { Shuffle } from 'lucide-vue-next';
import AppleInput from './ui/AppleInput.vue';
import AppleButton from './ui/AppleButton.vue';
import type { UserSettings, GithubUser } from '../types';

const props = defineProps<{
  visible: boolean;
  user: GithubUser | null;
  settings: UserSettings | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [value: { owner: string; repo: string; pat: string; subToken: string }];
  disconnect: [];
  'update:settings': [value: Partial<UserSettings>];
}>();

const panelRef = ref<HTMLElement>();
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

function onClickOutside(e: MouseEvent) {
  if (panelRef.value && !panelRef.value.contains(e.target as Node)) {
    emit('close');
  }
}

onMounted(() => document.addEventListener('click', onClickOutside, true));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside, true));
</script>
