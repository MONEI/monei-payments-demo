const MAX = 60;
const entries = [];
const listeners = new Set();

/**
 * Buffers from page load rather than from when the code panel opens, so the panel
 * can show what already happened. Wallet callbacks fire before anyone thinks to
 * look at a log.
 */
// The console outlives the page, so the shopper's own details stay out of it.
const PERSONAL = new Set(['customer', 'address', 'billing', 'shippingDetails', 'billingDetails', 'phoneNumber']);

const forConsole = (detail) => {
  if (!detail || typeof detail !== 'object') return detail ?? '';
  return Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, PERSONAL.has(k) ? '[redacted]' : v]));
};

export const emit = (label, detail) => {
  entries.push({at: new Date(), label, detail});
  if (entries.length > MAX) entries.shift();
  for (const listener of listeners) listener(entries);
  // The panel's log dies with the page, and paying navigates away.
  console.info(`[monei] ${label}`, forConsole(detail));
};

export const events = () => entries;

export const onEvent = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
