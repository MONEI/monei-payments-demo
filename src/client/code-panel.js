import {events, onEvent} from './events.js';

const el = (id) => document.getElementById(id);

const time = (at) => at.toTimeString().slice(0, 8);

const render = (entries) => {
  const list = el('events-list');
  const empty = el('events-empty');
  if (!list) return;

  if (empty) empty.hidden = entries.length > 0;
  list.innerHTML = entries
    .map(
      ({at, label, detail}) => `
        <li>
          <span class="tabular-nums opacity-50">${time(at)}</span>
          <span class="font-medium">${label}</span>
          ${detail === undefined ? '' : `<pre class="mt-0.5 whitespace-pre-wrap opacity-70">${escape(detail)}</pre>`}
        </li>`
    )
    .join('');
  list.scrollTop = list.scrollHeight;
};

const escape = (detail) =>
  JSON.stringify(detail, null, 1).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The log is rebuilt on every event, so it is only drawn while someone can see it.
const renderIfOpen = (entries) => {
  if (el('code-rail')?.dataset.open === 'true') render(entries);
};

const setOpen = (rail, open) => {
  rail.dataset.open = String(open);
  el('code-toggle')?.setAttribute('aria-expanded', String(open));
  if (open) render(events());

  const url = new URL(location.href);
  if (open) url.searchParams.set('code', '1');
  else url.searchParams.delete('code');
  history.replaceState(history.state, '', url);
};

const wire = () => {
  const panel = el('code-rail');
  if (!panel || panel.dataset.wired === 'true') return;
  panel.dataset.wired = 'true';

  el('code-toggle')?.addEventListener('click', () => setOpen(panel, panel.dataset.open !== 'true'));

  const tabs = [...panel.querySelectorAll('[data-tab]')];
  const accent = getComputedStyle(panel).getPropertyValue('--rail-accent').trim();

  const show = (id) => {
    // A settings change re-renders on the server, which would otherwise reset the tab.
    const url = new URL(location.href);
    if (id === 'client') url.searchParams.delete('tab');
    else url.searchParams.set('tab', id);
    history.replaceState(history.state, '', url);

    for (const tab of tabs) {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.style.background = on ? accent : '';
      tab.style.color = on ? 'white' : '';
    }
    for (const pane of panel.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== id;
  };

  for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.tab));

  el('code-copy')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    // Kept from the first click, so a second one inside the timeout cannot store "Copied".
    button.dataset.label ??= button.textContent;
    const visible = panel.querySelector('[data-pane]:not([hidden])');

    // Clipboard access is refused outright in some contexts, and an unhandled
    // rejection would leave the button claiming it had copied.
    try {
      await navigator.clipboard.writeText(visible?.innerText ?? '');
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Press ⌘/Ctrl+C';
    }
    clearTimeout(Number(button.dataset.timer));
    button.dataset.timer = String(setTimeout(() => (button.textContent = button.dataset.label), 1600));
  });

  render(events());
  return onEvent(renderIfOpen);
};

document.addEventListener('keydown', (event) => {
  const rail = el('code-rail');
  if (event.key === 'Escape' && rail?.dataset.open === 'true') setOpen(rail, false);
});

let stop;
document.addEventListener('astro:page-load', () => {
  stop?.();
  stop = wire();
});
