const rail = document.getElementById('rail');
const toggle = document.getElementById('rail-toggle');

const setOpen = (open) => {
  rail.dataset.open = String(open);
  toggle.setAttribute('aria-expanded', String(open));
};

toggle.addEventListener('click', () => setOpen(rail.dataset.open !== 'true'));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && rail.dataset.open === 'true') setOpen(false);
});

/**
 * Theme and language change what the server renders, so they navigate. Cart and
 * shipping are handled in place elsewhere.
 */
const navigateWith = (param, value) => {
  const url = new URL(location.href);
  url.searchParams.set(param, value);
  location.assign(url);
};

for (const input of document.querySelectorAll('[data-param]')) {
  input.addEventListener('change', () => navigateWith(input.dataset.param, input.value));
}

const methodInputs = [...document.querySelectorAll('[data-method]')];

for (const input of methodInputs) {
  input.addEventListener('change', () => {
    const chosen = methodInputs.filter((i) => i.checked && !i.disabled).map((i) => i.value);
    const url = new URL(location.href);
    // Every available method checked is the default, so the param comes off and
    // the shared link stays short.
    const available = methodInputs.filter((i) => !i.disabled);
    if (chosen.length === available.length) url.searchParams.delete('methods');
    else url.searchParams.set('methods', chosen.join(','));
    location.assign(url);
  });
}

export const openRail = () => setOpen(true);
