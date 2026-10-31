import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Long reference docs are split into an overview plus one page per `## ` section.
// The plugin's Markdown stays one file; the site splits it at build time.
export const splitDocs = ['configuration', 'packs', 'host-features', 'tools'];

// Commands run from website/; bundled pages lose their source URL, so resolve from the working directory.
export const repoRoot = resolve(process.cwd(), '..');
export const docsDir = resolve(repoRoot, 'plugins/concise/docs');

const plain = (markdown) => markdown
  .replace(/`([^`]*)`/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, '$1$2')
  .trim();

// The same id that rehypeHeadingIds (github-slugger) gives a heading.
export function slugify(text) {
  return plain(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
}

function counter() {
  const seen = new Map();
  return (base) => {
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

// Split at headings outside fenced code.
function splitAt(markdown, depth) {
  const marker = `${'#'.repeat(depth)} `;
  const parts = [{ heading: null, lines: [] }];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (open) fence = fence === null ? open[1][0] : (open[1][0] === fence ? null : fence);
    if (fence === null && !open && line.startsWith(marker)) parts.push({ heading: line.slice(marker.length).trim(), lines: [] });
    else parts.at(-1).lines.push(line);
  }
  return parts;
}

function firstSentence(markdown) {
  const paragraph = markdown.split(/\n{2,}/).map(block => block.trim())
    .find(block => block && !/^(\||```|~~~|>|#|<|-|\*|\d+\.)/.test(block));
  if (!paragraph) return '';
  // Keep inline code; drop links and emphasis.
  const text = paragraph.replace(/\s+/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
  const end = text.replace(/`[^`]*`/g, match => 'x'.repeat(match.length)).search(/[.!?](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

const cache = new Map();
export function readReference(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const file = resolve(docsDir, `${slug}.md`);
  const [front, ...sections] = splitAt(readFileSync(file, 'utf8'), 2);
  const titleLine = front.lines.find(line => line.startsWith('# '));
  const title = titleLine ? plain(titleLine.slice(2)) : slug;
  const intro = front.lines.filter(line => line !== titleLine).join('\n').trim();
  const global = counter();
  const anchors = {};
  const pages = sections.map(({ heading, lines }) => {
    const section = slugify(heading);
    const id = global(section);
    anchors[id] = `/docs/${slug}/${section}/`;
    // Each section page starts its own heading ids; deeper headings move up one level.
    const local = counter();
    const body = splitAt(lines.join('\n'), 3).map((part, index) => {
      if (index === 0) return part.lines.join('\n');
      const own = local(slugify(part.heading));
      anchors[global(slugify(part.heading))] = `/docs/${slug}/${section}/#${own}`;
      return [`## ${part.heading}`, ...part.lines].join('\n');
    }).join('\n').replace(/^#### /gm, '### ').trim();
    return { slug: section, title: plain(heading), heading, markdown: body, summary: firstSentence(body) };
  });
  const reference = { slug, title, intro, pages, anchors, file: `plugins/concise/docs/${slug}.md` };
  cache.set(slug, reference);
  return reference;
}

// Where a link to a split doc (with an optional anchor) lands now.
export function referenceTarget(slug, hash) {
  if (!splitDocs.includes(slug)) return null;
  const { anchors } = readReference(slug);
  return (hash && anchors[hash]) || `/docs/${slug}/${hash && !anchors[hash] ? `#${hash}` : ''}`;
}

/** The text of a plugin doc, such as `categories`. */
export function readDoc(slug) {
  return readFileSync(resolve(docsDir, `${slug}.md`), 'utf8');
}

/** A file URL for a repo path, so Markdown links resolve relative to their source. */
export function sourceUrl(source) {
  return pathToFileURL(resolve(repoRoot, source));
}
