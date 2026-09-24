import {codeToHtml} from 'shiki';

// The server snippet is the same on every request, so its markup is computed once.
// The client snippet varies with the cart, so the cache is bounded.
const cache = new Map();
const MAX_ENTRIES = 200;

/**
 * Highlighted on the server rather than in the browser: the snippets are built from
 * the live config here, so shipping a highlighter to the client would only repeat
 * work already done. Shiki wraps its output in a `<pre><code>` carrying its own
 * background; only the inside is kept, so the panel keeps the page's styling.
 */
export const highlight = async (code, lang) => {
  const key = `${lang}\n${code}`;
  if (!cache.has(key)) {
    if (cache.size >= MAX_ENTRIES) cache.clear();
    const html = await codeToHtml(code, {lang, theme: 'github-light'});
    cache.set(key, html.replace(/^<pre[^>]*><code[^>]*>/, '').replace(/<\/code><\/pre>$/, ''));
  }
  return cache.get(key);
};
