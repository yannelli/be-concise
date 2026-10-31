import { dirname, relative, resolve, sep } from 'node:path';

// Commands run from website/, and bundled pages lose their source URL, so resolve from the working directory.
const repoRoot = resolve(process.cwd(), '..');
const docsPage = /^plugins\/concise\/docs\/(?!INDEX\.md$)[^/]+\.md$/;
const patternPage = /^plugins\/concise\/skills\/concise-rules\/references\/ai-speak-patterns[^/]*\.md$/;

// Relative .md links become site pages when one exists, and GitHub links otherwise.
export function documentationLinks() {
  return (tree, file) => {
    const from = file?.path ? dirname(file.path) : repoRoot;
    const visit = (node) => {
      if (node.type === 'link' && node.url && !/^[a-z][a-z0-9+.-]*:|^[/#]/i.test(node.url)) {
        const [target, hash] = node.url.split('#');
        if (target.endsWith('.md')) {
          const path = relative(repoRoot, resolve(from, target)).split(sep).join('/');
          const anchor = hash ? `#${hash}` : '';
          // The pattern library has one page per category; an anchor names the category.
          node.url = patternPage.test(path)
            ? `/docs/patterns/${hash ? `${hash}/` : ''}`
            : docsPage.test(path)
              ? `/docs/${path.split('/').pop().replace(/\.md$/, '')}/${anchor}`
              : `https://github.com/yannelli/be-concise/blob/main/${path}${anchor}`;
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
