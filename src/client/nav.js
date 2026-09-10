import {navigate} from 'astro:transitions/client';

// Astro's router leaves `current` null mid-transition, so a `navigate()` started
// before the last one settles throws in `moveToLocation`. `astro:after-swap` still
// counts as mid-transition, so the flag clears on `astro:page-load`.
let navigating = false;

document.addEventListener('astro:page-load', () => {
  navigating = false;
});

// The router scrolls to the top on every navigation and restores a position only
// when going back, so `preserveScroll` covers cart changes made down the page.
export const go = (url, options = {}) => {
  if (navigating) return false;
  navigating = true;

  const {preserveScroll, ...navOptions} = options;
  const {scrollX, scrollY} = window;

  navigate(url, navOptions);
  if (preserveScroll) {
    // The scroll to the top happens after this event, so the restore waits a frame.
    document.addEventListener('astro:page-load', () => requestAnimationFrame(() => window.scrollTo(scrollX, scrollY)), {
      once: true
    });
  }
  return true;
};
