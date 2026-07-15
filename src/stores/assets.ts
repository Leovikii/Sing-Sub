import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { AssetSnapshot } from '../../shared';

const emptyAssets = (): AssetSnapshot => ({ nodes: [], templates: [], adapters: [], rulesets: [] });

export const useAssetsStore = defineStore('assets', () => {
  const items = ref<AssetSnapshot>(emptyAssets());
  const loaded = ref(false);
  const loading = ref(false);
  const lastCheckedAt = ref(0);
  const deletedPaths = ref<string[]>([]);

  function reset() {
    items.value = emptyAssets();
    loaded.value = false;
    loading.value = false;
    lastCheckedAt.value = 0;
    deletedPaths.value = [];
  }

  return { items, loaded, loading, lastCheckedAt, deletedPaths, reset };
});
