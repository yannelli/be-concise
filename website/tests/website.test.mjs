import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join, relative, sep } from 'node:path';

const dist = resolve('dist');
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? htmlFiles(join(directory, entry.name)) : entry.name.endsWith('.html') ? [join(directory, entry.name)] : []));
  return nested.flat();
}
const files = await htmlFiles(dist);
const pages = await Promise.all(files.map(async file => ({ file, html: await readFile(file, 'utf8') })));

test('homepage and all reference routes are generated', async () => {
  for (const route of ['', 'docs', 'docs/installation', 'docs/console', 'docs/tools', 'docs/host-features', 'docs/configuration', 'docs/categories', 'docs/environment', 'docs/packs']) {
    assert.ok((await stat(join(dist, route, 'index.html'))).isFile(), route);
  }
  assert.ok((await stat(join(dist, '404.html'))).isFile());
});

test('each route has a unique title, description and one h1', () => {
  const titles = new Set();
  for (const { file, html } of pages) {
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
    assert.ok(title, file);
    assert.ok(!titles.has(title), `Duplicate title: ${title}`);
    titles.add(title);
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `One h1: ${file}`);
    assert.match(html, /<html lang="en"/);
    assert.match(html, /id="main"/);
  }
});

test('canonical and social metadata use the production domain', () => {
  for (const { file, html } of pages) {
    assert.match(html, /<meta property="og:image" content="https:\/\/concise\.chat\/social\.png"/);
    assert.match(html, /<meta name="twitter:image" content="https:\/\/concise\.chat\/social\.png"/);
    if (file === join(dist, '404.html')) {
      assert.match(html, /<meta name="robots" content="noindex"/);
      assert.doesNotMatch(html, /rel="canonical"/);
      continue;
    }
    const path = relative(dist, file).split(sep).join('/').replace(/index\.html$/, '');
    const expected = new URL(path, 'https://concise.chat/').href;
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], expected, file);
    assert.equal(html.match(/<meta property="og:url" content="([^"]+)"/)?.[1], expected, file);
  }
});

test('all local navigation links and fragments resolve', async () => {
  for (const { file, html } of pages) {
    const links = [...html.matchAll(/<a\b[^>]*?href="([^"]+)"/g)].map(match => match[1]);
    for (const href of links) {
      if (/^(https?:|mailto:|tel:|javascript:)/.test(href)) continue;
      const [path, fragment] = href.split('#');
      let target = path ? resolve(path.startsWith('/') ? dist : dirname(file), path.replace(/^\//, '')) : file;
      if (path.endsWith('/') || (path && !/\.[a-z0-9]+$/i.test(path))) target = join(target, 'index.html');
      await assert.doesNotReject(stat(target), `${file}: ${href}`);
      if (fragment && target.endsWith('.html')) {
        const targetHTML = target === file ? html : await readFile(target, 'utf8');
        assert.ok(targetHTML.includes(`id="${decodeURIComponent(fragment)}"`), `Missing fragment ${href} in ${file}`);
      }
    }
  }
});

test('homepage presents real defaults and opt-in configuration', () => {
  const home = pages.find(page => page.file === join(dist, 'index.html')).html;
  assert.match(home, /300/);
  assert.match(home, /disabled until you enable them/);
  assert.match(home, /An example, not a live agent/);
  assert.match(home, /0\.152\.0/);
  assert.ok((home.match(/data-ui/g) || []).length >= 4);
  assert.match(home, /role="tablist"/);
  assert.match(home, /aria-live="polite"/);
});

test('reference table values have build-time mobile labels', () => {
  const config = pages.find(page => page.file === join(dist, 'docs/configuration/index.html')).html;
  assert.match(config, /data-responsive-table/);
  assert.match(config, /data-label="Key"/);
  assert.match(config, /data-label="Default"/);
  assert.match(config, /data-label="What it does"/);
});

test('Cloudflare deploys static assets and enables branch previews', async () => {
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.equal(config.main, undefined);
  assert.deepEqual(config.previews, {});
});

test('web console is documented with real screenshots', async () => {
  const home = pages.find(page => page.file === join(dist, 'index.html')).html;
  const guide = pages.find(page => page.file === join(dist, 'docs', 'console', 'index.html'));
  assert.ok(guide, 'docs/console page exists');
  const images = [...new Set([...home.matchAll(/\/console\/([a-z]+-(?:light|dark))\.webp/g), ...guide.html.matchAll(/\/console\/([a-z]+-(?:light|dark))\.webp/g)].map(match => match[1]))];
  assert.ok(images.length >= 5);
  for (const view of ['overview', 'activity', 'playground', 'configuration', 'rules']) {
    for (const theme of ['light', 'dark']) await assert.doesNotReject(stat(join(dist, 'console', `${view}-${theme}.webp`)));
  }
  assert.match(home, /npm install -g @yannelli\/be-concise/);
  assert.match(guide.html.replace(/<[^>]+>/g, ""), /concise-web --all/);
});

test('copy matches the current plugin release', () => {
  const home = pages.find(page => page.file === join(dist, 'index.html')).html;
  assert.match(home, /omp plugin install concise@be-concise/);
  for (const page of pages) {
    assert.doesNotMatch(page.html, /\b44 (writing )?categor/, page.file);
    assert.doesNotMatch(page.html, /claude-test-last\.log/, page.file);
  }
});

test('hero film ships with a poster, a text description, and no autoplay attribute', async () => {
  const home = pages.find(page => page.file === join(dist, 'index.html')).html;
  assert.match(home, /<video[^>]*data-film-video[^>]*>/);
  assert.doesNotMatch(home.match(/<video[^>]*>/)[0], /autoplay/);
  assert.match(home, /aria-describedby="film-description"/);
  assert.match(home, /Read the film transcript/);
  assert.match(home, /AI-writing checks are disabled by default/);
  assert.match(home, /Concise does not rewrite files or commit messages/);
  assert.match(home, /id="film-description"[^>]*>[^<]*Concise checks it first/);
  for (const file of ['concise-promo.mp4', 'concise-promo-poster.webp']) {
    const size = (await stat(join(dist, 'promo', file))).size;
    assert.ok(size > 1000 && size < 8 * 1024 * 1024, `${file} ${size}`);
  }
});
