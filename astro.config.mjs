import {defineConfig} from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Server-rendered: the store reads its config from the query string on every
  // request, and the /api routes create payments with the secret API key.
  output: 'server',
  adapter: vercel(),
  site: 'https://payments-demo.monei.com',
  vite: {
    plugins: [tailwindcss()],
    // The card iframes fetch the font stylesheet from this origin, so it has to be
    // readable cross-origin. Production sets the same header in vercel.json.
    server: {headers: {'Access-Control-Allow-Origin': '*'}}
  }
});
