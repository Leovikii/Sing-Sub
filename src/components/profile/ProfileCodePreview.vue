<template>
  <div class="flex-1 overflow-auto flex flex-col bg-[#121212]">
    <div v-if="loading" class="flex-1 flex flex-col items-center justify-center">
      <Loader2 class="w-8 h-8 text-[#F596AA] animate-spin mb-4" />
      <span class="text-[#86868b]">构建配置中...</span>
    </div>
    <div v-else-if="error" class="flex-1 p-6 text-[#ff6961]">
      <h3 class="font-bold mb-2">构建失败:</h3>
      <pre class="text-sm whitespace-pre-wrap">{{ error }}</pre>
    </div>
    <pre v-else class="flex-1 p-6 text-[#a1a1aa] font-mono text-sm leading-relaxed overflow-auto selection:bg-[#F596AA]/30 selection:text-[#f5f5f7]">{{ content }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import { useApi } from '../../composables/useApi';

import type { Profile } from '../../types';

const props = defineProps<{
  profile: Profile;
  isActive: boolean;
}>();

const { postPreview } = useApi();
const loading = ref(false);
const error = ref('');
const content = ref('');

async function fetchPreview() {
  if (!props.profile) return;
  loading.value = true;
  error.value = '';
  content.value = '';
  try {
    const data = await postPreview(props.profile);
    content.value = data.content;
  } catch (e: any) {
    error.value = e.message || '构建预览失败，请检查配置。';
  } finally {
    loading.value = false;
  }
}

// Fetch when the component is activated or when name changes
watch(() => props.isActive, (active) => {
  if (active) {
    fetchPreview();
  }
}, { immediate: true });
</script>
