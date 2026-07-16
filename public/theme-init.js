(() => {
  const root = globalThis.document.documentElement;
  let dark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    const appearance = globalThis.localStorage.getItem('sing-sub.appearance');
    if (appearance === 'dark') dark = true;
    if (appearance === 'light') dark = false;
  } catch {
    dark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  root.classList.toggle('app-dark', dark);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.style.backgroundColor = dark ? '#121212' : '#f7f7f8';
  globalThis.document.querySelector('#theme-color')?.setAttribute('content', dark ? '#121212' : '#f7f7f8');
})();
