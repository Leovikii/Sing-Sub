import { create } from 'zustand';
import type { AssetSnapshot } from '../../shared';

const emptyAssets = (): AssetSnapshot => ({ nodes: [], templates: [], rulesets: [] });

interface AssetsStore {
  items: AssetSnapshot;
  loaded: boolean;
  loading: boolean;
  lastCheckedAt: number;
  deletedPaths: string[];
  replace: (items: AssetSnapshot) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAssetsStore = create<AssetsStore>((set) => ({
  items: emptyAssets(),
  loaded: false,
  loading: false,
  lastCheckedAt: 0,
  deletedPaths: [],
  replace: (items) => set({ items, loaded: true, loading: false, lastCheckedAt: Date.now() }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({
    items: emptyAssets(),
    loaded: false,
    loading: false,
    lastCheckedAt: 0,
    deletedPaths: [],
  }),
}));
