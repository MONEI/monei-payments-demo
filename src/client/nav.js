import {navigate} from 'astro:transitions/client';

// Astro's router leaves `current` null mid-transition, so a `navigate()` started
// before the last one settles throws in `moveToLocation`. `astro:after-swap` still
// counts as mid-transition, so the flag clears on `astro:page-load`.
let navigating = false;

document.addEventListener('astro:page-load', () => {
  navigating = false;
});

// A settings change re-renders the page, and the server has no idea what the
// shopper typed into the address form, so it is read off the old DOM and written
// back onto the new one.
const readForm = (selector) => [...document.querySelectorAll(`${selector} [name]`)].map((el) => [el.name, el.value]);

const writeForm = (selector, entries) => {
  for (const [name, value] of entries) {
    const el = document.querySelector(`${selector} [name="${name}"]`);
    if (el && value) el.value = value;
  }
};

export const go = (url, options = {}) => {
  if (navigating) return false;
  navigating = true;

  const {preserveForm, ...navOptions} = options;
  const form = preserveForm ? readForm(preserveForm) : null;

  navigate(url, navOptions);
  if (form) {
    // `astro:after-swap` runs before the new DOM paints, so the fields never blank.
    document.addEventListener('astro:after-swap', () => writeForm(preserveForm, form), {once: true});
  }
  return true;
};
