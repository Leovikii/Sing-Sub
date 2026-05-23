<template>
  <div class="flex-1 overflow-hidden flex flex-col bg-[#121212]">
    <CodeEditor
      v-model="content"
      readonly
      :loading="loading"
      loadingText="构建配置中..."
      :error="error"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useApi } from '../../composables/useApi';
import CodeEditor from '../ui/CodeEditor.vue';

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
