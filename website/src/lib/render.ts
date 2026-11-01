import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { documentationLinks, responsiveTables } from './markdown-plugins.mjs';
import { sourceUrl } from './reference.mjs';

const processor = createMarkdownProcessor({
  remarkPlugins: [documentationLinks],
  rehypePlugins: [responsiveTables],
  shikiConfig: { theme: 'github-dark' },
});

/** Renders plugin Markdown with the site's link and table rules. `source` is the repo path it came from. */
export async function renderMarkdown(markdown: string, source?: string) {
  const result = await (await processor).render(markdown, source ? { fileURL: sourceUrl(source) } : undefined);
  return { html: result.code, headings: result.metadata.headings };
}
