import { useState } from 'react';

export function reconcileOrder(items: string[], preferred: string[]): string[] {
  const available = new Set(items);
  return [...new Set([...preferred.filter(id => available.has(id)), ...items])];
}

export function readOrder(key: string, storage?: Pick<Storage, 'getItem'>): string[] {
  try {
    const value: unknown = JSON.parse((storage ?? window.localStorage).getItem(key) ?? '[]');
    return Array.isArray(value) && value.every(id => typeof id === 'string') ? value : [];
  } catch { return []; }
}

export function useBrowserOrder(key: string) {
  const [order, setOrder] = useState(() => readOrder(key));
  const save = (next: string[]) => {
    window.localStorage.setItem(key, JSON.stringify(next));
    setOrder(next);
    return true;
  };
  return { order, save };
}
