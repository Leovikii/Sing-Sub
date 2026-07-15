import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../api/endpoints';
import type { RulesetBuildStatusResult } from '../../shared';

export const useRulesetsStore = defineStore('rulesets', () => {
  const builds = ref<Record<string, RulesetBuildStatusResult>>({});
  const retryingId = ref('');

  async function load(rulesetId: string) {
    try {
      const result = await api.getRulesetBuild(rulesetId);
      builds.value[rulesetId] = result;
      return result;
    } catch (error) {
      delete builds.value[rulesetId];
      throw error;
    }
  }

  async function loadMany(rulesetIds: string[]) {
    await Promise.allSettled(rulesetIds.map(load));
  }

  async function retry(rulesetId: string) {
    retryingId.value = rulesetId;
    try {
      await api.retryRulesetBuild(rulesetId);
      return await load(rulesetId);
    } finally {
      retryingId.value = '';
    }
  }

  return { builds, retryingId, load, loadMany, retry };
});
