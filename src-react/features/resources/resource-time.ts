export function formatResourceTime(value: string | undefined, locale: string, now: number) {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  };
  const absolute = new Intl.DateTimeFormat(locale, {
    ...options, second: '2-digit', timeZoneName: 'shortOffset',
  }).format(date);
  const elapsed = Math.floor((now - timestamp) / 1000);
  let label: string;
  if (elapsed < 0 || elapsed >= 30 * 86400) {
    label = new Intl.DateTimeFormat(locale, options).format(date);
  } else {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    label = elapsed < 60 ? relative.format(0, 'second')
      : elapsed < 3600 ? relative.format(-Math.floor(elapsed / 60), 'minute')
      : elapsed < 86400 ? relative.format(-Math.floor(elapsed / 3600), 'hour')
      : new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-Math.floor(elapsed / 86400), 'day');
  }
  return { label, absolute };
}
