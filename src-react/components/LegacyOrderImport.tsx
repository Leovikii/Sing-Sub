import { Button, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readOrder, reconcileOrder } from './entity-order';

export function LegacyOrderImport({ storageKey, items, onImport }: {
  storageKey: string; items: string[]; onImport: (paths: string[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(() => readOrder(storageKey).length > 0);
  const [saving, setSaving] = useState(false);
  if (!available) return null;
  return <Button h={44} variant="subtle" loading={saving} onClick={() => modals.openConfirmModal({
    title: t('sorting.importLocal'), children: <Text size="sm">{t('sorting.importMessage')}</Text>,
    labels: { confirm: t('sorting.importLocal'), cancel: t('common.cancel') },
    onConfirm: async () => {
      setSaving(true);
      try {
        if (await onImport(reconcileOrder(items, readOrder(storageKey)))) {
          try { window.localStorage.removeItem(storageKey); } catch { /* Never import automatically. */ }
          setAvailable(false);
        }
      } finally { setSaving(false); }
    },
  })}>{t('sorting.importLocal')}</Button>;
}
