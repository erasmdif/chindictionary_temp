import { defineConfig } from 'astro/config';
import scmsConfig from './astro.config.mjs';

// Temporary configuration used only by GitHub Actions / GitHub Pages.
// The original sCMS astro.config.mjs remains untouched.
export default defineConfig({
  ...scmsConfig,
  site: 'https://erasmdif.github.io',
  base: '/chindictionary_temp',
});
