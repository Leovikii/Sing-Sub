import { Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatResourceTime } from './resource-time';

export function ResourceTime({ value, now, labelKey = 'assets.lastModified', full = false, compact = false }: {
  value?: string;
  now: number;
  labelKey?: string;
  full?: boolean;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const time = formatResourceTime(value, i18n.resolvedLanguage ?? i18n.language, now);
  if (!time) return <Text size="xs" c="dimmed">{compact ? t('assets.timeNotRecorded') : t(labelKey, { time: t('assets.timeUnknown') })}</Text>;
  const absolute = t(labelKey, { time: time.absolute });
  return (
    <Tooltip label={absolute} events={{ hover: true, focus: true, touch: true }} multiline maw="90vw">
      <Text
        component="time" dateTime={value} tabIndex={0} aria-label={absolute}
        size="xs" c="dimmed" pos="relative" style={{ zIndex: 2 }}
      >{full ? absolute : compact ? time.label : t(labelKey, { time: time.label })}</Text>
    </Tooltip>
  );
}
