import { dirname, relative, resolve, sep } from 'node:path';
import { referenceTarget, repoRoot } from './reference.mjs';

const docsPage = /^plugins\/concise\/docs\/(?!INDEX\.md$)[^/]+\.md$/;
const patternPage = /^plugins\/concise\/skills\/concise-rules\/references\/ai-speak-patterns[^/]*\.md$/;

// Where a site docs path (with an optional anchor) lands after the split and the Categories merge.
export function docsUrl(slug, hash) {
  if (slug === 'categories') return `/docs/patterns/${hash ? `#${hash}` : ''}`;
  return referenceTarget(slug, hash) ?? `/docs/${slug}/${hash ? `#${hash}` : ''}`;
}

// Relative .md links become site pages when one exists, and GitHub links otherwise.
// Links into split reference docs and the old Categories page are sent to their new pages.
export function documentationLinks() {
  return (tree, file) => {
    const path = file?.path ? relative(repoRoot, file.path).split(sep).join('/') : '';
    const current = docsPage.test(path) ? path.split('/').pop().replace(/\.md$/, '') : null;
    const from = file?.path ? dirname(file.path) : repoRoot;
    const visit = (node) => {
      if (node.type === 'link' && node.url) {
        const [target, hash] = node.url.split('#');
        const site = target.match(/^\/docs\/([a-z-]+)\/$/);
        if (site) node.url = docsUrl(site[1], hash);
        else if (!target && hash && current) node.url = docsUrl(current, hash);
        else if (!/^[a-z][a-z0-9+.-]*:|^[/#]/i.test(node.url) && target.endsWith('.md')) {
          const linked = relative(repoRoot, resolve(from, target)).split(sep).join('/');
          // The pattern library has one page per category; an anchor names the category.
          node.url = patternPage.test(linked)
            ? `/docs/patterns/${hash ? `${hash}/` : ''}`
            : docsPage.test(linked)
              ? docsUrl(linked.split('/').pop().replace(/\.md$/, ''), hash)
              : `https://github.com/yannelli/be-concise/blob/main/${linked}${hash ? `#${hash}` : ''}`;
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export function responsiveTables() {
  return (tree) => {
    const text = (node) => node.type === 'text' ? node.value : (node.children || []).map(text).join('');
    const elements = (node, tag) => (node?.children || []).filter(child => child.type === 'element' && child.tagName === tag);
    const visit = (node) => {
      if (node.type === 'element' && node.tagName === 'table') {
        const row = elements(elements(node, 'thead')[0], 'tr')[0];
        const labels = elements(row, 'th').map(text);
        node.properties ||= {};
        node.properties['data-responsive-table'] = '';
        node.properties['data-columns'] = labels.length;
        for (const body of elements(node, 'tbody')) {
          for (const row of elements(body, 'tr')) {
            elements(row, 'td').forEach((cell, index) => {
              cell.properties ||= {};
              cell.properties['data-label'] = labels[index] || '';
            });
          }
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
