const MAX = 60;
const entries = [];
const listeners = new Set();

/**
 * Buffers from page load rather than from when the code panel opens, so the panel
 * can show what already happened. Wallet callbacks fire before anyone thinks to
 * look at a log.
 */
export const emit = (label, detail) => {
  entries.push({at: new Date(), label, detail});
  if (entries.length > MAX) entries.shift();
  for (const listener of listeners) listener(entries);
};

export const events = () => entries;

export const onEvent = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
