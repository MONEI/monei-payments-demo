import {navigate} from 'astro:transitions/client';

/**
 * Astro's router leaves `current` null while a transition is in flight, so a second
 * `navigate()` started before the first settles throws inside `moveToLocation`. The
 * rail and the cart can both trigger one, and a re-render re-runs their wiring.
 */
let navigating = false;

// `astro:after-swap` fires while the router is still mid-transition, so releasing
// there lets a second navigation start too early and hit the same null `current`.
document.addEventListener('astro:page-load', () => {
  navigating = false;
});

/**
 * The router scrolls to the top on every navigation and only restores a position
 * when going back, so a cart change made halfway down the page throws the shopper
 * back to the header. `preserveScroll` puts them where they were.
 */
export const go = (url, options = {}) => {
  if (navigating) return false;
  navigating = true;

  const {preserveScroll, ...navOptions} = options;
  const {scrollX, scrollY} = window;

  navigate(url, navOptions);
  if (preserveScroll) {
    // The router scrolls to the top after this event, so the restore has to wait
    // for the frame after it rather than run inside the handler.
    document.addEventListener('astro:page-load', () => requestAnimationFrame(() => window.scrollTo(scrollX, scrollY)), {
      once: true
    });
  }
  return true;
};
