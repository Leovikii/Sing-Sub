import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { StateData } from '../../shared';

export const useWorkspaceStore = defineStore('workspace', () => {
  const revision = ref<string | null>(null);
  const state = ref<StateData | null>(null);
  const dirty = ref(false);

  function replace(nextState: StateData | null, nextRevision?: string | null) {
    state.value = nextState;
    if (nextRevision !== undefined) revision.value = nextRevision;
    dirty.value = false;
  }

  function clear() {
    revision.value = null;
    state.value = null;
    dirty.value = false;
  }

  return { revision, state, dirty, replace, clear };
});
