import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { documentationLinks, responsiveTables } from './markdown-plugins.mjs';

// The plugin keeps its pattern reference in 300-line parts so an agent can read one part at a time.
// The website splits the same generated Markdown into one page per category.
const parts = import.meta.glob<string>('../../../plugins/concise/skills/concise-rules/references/ai-speak-patterns*.md', { query: '?raw', import: 'default', eager: true });

export const sourceDir = 'plugins/concise/skills/concise-rules/references';

export interface PatternCategory {
  id: string;
  label: string;
  title: string;
  presets: string[];
  source: string;
  description: string;
  body: string;
  rows: number;
  file: string;
}

const partOrder = (file: string) => Number(file.match(/ai-speak-patterns-(\d+)\.md$/)?.[1] ?? 1);
const files = Object.keys(parts).sort((a, b) => partOrder(a) - partOrder(b));
const ticks = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map(match => match[1]);

// The category index in part 1 fixes the order and the labels.
const index = new Map<string, string>();
for (const line of parts[files[0]].split(/^## /m)[0].split('\n')) {
  const cells = line.split('|').map(cell => cell.trim());
  const id = cells[1]?.match(/^`([^`]+)`$/)?.[1];
  if (id && cells[2] && id !== 'Category') index.set(id, cells[2]);
}

const sections = new Map<string, PatternCategory>();
for (const file of files) {
  for (const chunk of parts[file].split(/^## /m).slice(1)) {
    const [heading, ...rest] = chunk.split('\n');
    const id = heading.trim();
    const blocks = rest.join('\n').trim().split(/\n{2,}/);
    const meta = blocks[0].match(/^Presets: (.*?)\.(?: Source: (.*))?$/s);
    if (!meta) throw new Error(`Pattern section ${id} has no "Presets: …" line`);
    const label = index.get(id) ?? id;
    sections.set(id, {
      id, label,
      title: label.charAt(0).toUpperCase() + label.slice(1),
      presets: ticks(meta[1]),
      source: meta[2]?.trim() ?? '',
      description: blocks[1]?.startsWith('|') ? '' : blocks[1] ?? '',
      body: blocks.slice(blocks[1]?.startsWith('|') ? 1 : 2).join('\n\n'),
      rows: rest.filter(line => /^\| /.test(line)).length - 1,
      file: `${sourceDir}/${file.split('/').pop()}`,
    });
  }
}

const missing = [...index.keys()].filter(id => !sections.has(id));
if (missing.length) throw new Error(`Pattern index lists categories with no section: ${missing.join(', ')}`);
// Alphabetical by title, so the index reads as a directory.
export const categories: PatternCategory[] = [...index.keys()].map(id => sections.get(id)!).sort((a, b) => a.title.localeCompare(b.title));
export const presets = ['default', 'technical', 'ryan', 'minimal', 'git', 'ste', 'statistical', 'all'];

const processor = createMarkdownProcessor({
  remarkPlugins: [documentationLinks],
  rehypePlugins: [responsiveTables],
  shikiConfig: { theme: 'github-dark' },
});
export async function renderMarkdown(markdown: string) {
  return (await (await processor).render(markdown)).code;
}
