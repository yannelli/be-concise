import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { documentationLinks, responsiveTables } from './src/lib/markdown-plugins.mjs';

export default defineConfig({
  site: 'https://concise.chat',
  output: 'static',
  vite: { server: { fs: { allow: ['..'] } } },
  trailingSlash: 'always',
  markdown: {
    processor: unified({ remarkPlugins: [documentationLinks], rehypePlugins: [responsiveTables] }),
    shikiConfig: { theme: 'github-dark' },
  },
});
