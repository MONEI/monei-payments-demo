import {go as navigateOnce} from './nav.js';

/**
 * The rail's open state lives in the URL so the server renders it already open.
 * Restoring it client-side made it flash closed on every navigation, since the
 * fresh markup starts at zero width until JS corrects it.
 */
const isOpen = () => new URLSearchParams(location.search).get('panel') === '1';

const setOpen = (open) => {
  const rail = document.getElementById('rail');
  rail.dataset.open = String(open);
  document.getElementById('rail-toggle').setAttribute('aria-expanded', String(open));

  const url = new URL(location.href);
  if (open) url.searchParams.set('panel', '1');
  else url.searchParams.delete('panel');
  history.replaceState(history.state, '', url);
};

const go = (mutate) => {
  const url = new URL(location.href);
  mutate(url.searchParams);
  return navigateOnce(url.toString());
};

const wire = () => {
  const rail = document.getElementById('rail');
  const toggle = document.getElementById('rail-toggle');
  if (!rail || !toggle || rail.dataset.wired === 'true') return;
  rail.dataset.wired = 'true';

  toggle.addEventListener('click', () => setOpen(rail.dataset.open !== 'true'));

  for (const input of rail.querySelectorAll('[data-param]')) {
    input.addEventListener('change', () => {
      if (go((q) => q.set(input.dataset.param, input.value))) {
        input.closest('label')?.classList.add('is-pending');
      }
    });
  }

  const methods = [...rail.querySelectorAll('[data-method]')].filter((i) => !i.disabled);
  for (const input of methods) {
    input.addEventListener('change', () => {
      const chosen = methods.filter((i) => i.checked).map((i) => i.value);
      const started = go((q) => {
        // All available methods checked is the default, so the param comes off
        // and the shared link stays short.
        if (chosen.length === methods.length) q.delete('methods');
        else q.set('methods', chosen.join(','));
      });
      if (started) input.closest('label')?.classList.add('is-pending');
    });
  }
};

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isOpen()) setOpen(false);
});

document.addEventListener('astro:page-load', wire);
wire();
