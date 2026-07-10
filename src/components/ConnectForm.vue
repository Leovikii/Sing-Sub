<template>
  <div class="max-w-md mx-auto mt-20">
    <div class="glass p-8 space-y-8 shadow-2xl">
      <div class="text-center space-y-2">
        <h2 class="text-2xl font-semibold text-text-primary">连接 GitHub 仓库</h2>
        <p class="text-sm text-text-muted">关联私有仓库以管理订阅配置</p>
      </div>
      <form @submit.prevent="$emit('save')" class="space-y-6">
        <div class="space-y-4">
          <Input :modelValue="ownerRepo" @update:modelValue="onOwnerRepoChange" placeholder="owner/repo (如: user/singbox-private)" />
          <Input :modelValue="setupData.pat" @update:modelValue="update('pat', $event)" type="password" placeholder="GitHub PAT (repo 读写权限)" />
        </div>
        <Button type="submit" :loading="loading" variant="primary" class="w-full !py-3">
          登录
        </Button>
      </form>
      <div class="border-t border-border-base pt-4 space-y-2">
        <p class="text-xs text-text-muted leading-relaxed">
          本站不存储您的 GitHub 密码，PAT 仅用于访问您指定的仓库。
          建议为 PAT 设置最小权限范围（仅 repo）并定期轮换。
        </p>
        <p class="text-xs text-text-muted leading-relaxed">
          本项目完全开源，建议自行部署使用。
          <a href="https://github.com/Leovikii/Sing-Sub" target="_blank" rel="noopener" class="text-brand-pink hover:underline">查看源码</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Input from './ui/Input.vue';
import Button from './ui/Button.vue';
import type { SetupData } from '../types';

const props = defineProps<{
  setupData: SetupData;
  loading: boolean;
}>();

const emit = defineEmits<{
  save: [];
  'update:setupData': [value: SetupData];
}>();

const ownerRepo = ref('');

watch(() => [props.setupData.owner, props.setupData.repo], ([o, r]) => {
  const combined = o && r ? `${o}/${r}` : o || r;
  if (combined !== ownerRepo.value) ownerRepo.value = combined;
}, { immediate: true });

function onOwnerRepoChange(value: string) {
  ownerRepo.value = value;
  const slash = value.indexOf('/');
  const owner = slash >= 0 ? value.slice(0, slash) : value;
  const repo = slash >= 0 ? value.slice(slash + 1) : '';
  emit('update:setupData', { ...props.setupData, owner, repo });
}

function update(key: keyof SetupData, value: string) {
  emit('update:setupData', { ...props.setupData, [key]: value });
}
</script>
