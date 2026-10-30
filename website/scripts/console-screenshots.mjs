// Regenerates public/console/*.webp from the real console and real hook runs.
// Usage (from website/): npm run screenshots   Needs Chromium; set CHROME to override.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checkout = resolve(import.meta.dirname, '../..');
const out = resolve(import.meta.dirname, '../public/console');
const chrome = process.env.CHROME || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(path => spawnSync(path, ['--version']).status === 0);
if (!chrome) throw new Error('Set CHROME to a Chromium or Chrome binary.');

const root = mkdtempSync(join(tmpdir(), 'concise-shots-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('BEC_')));
Object.assign(env, { HOME: join(root, 'home'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'), TMPDIR: join(root, 'tmp') });
for (const dir of ['home', 'config', 'cache', 'state', 'tmp']) mkdirSync(join(root, dir), { recursive: true });
// Run from a copy inside the throwaway home so paths in hook messages read ~/be-concise/...
const repo = join(root, 'home', 'be-concise');
for (const part of ['bin', 'plugins', 'package.json']) cpSync(join(checkout, part), join(repo, part), { recursive: true });

const projects = { billing: join(root, 'home', 'code', 'billing-api'), docs: join(root, 'home', 'code', 'docs-site') };
for (const cwd of Object.values(projects)) {
  mkdirSync(join(cwd, '.claude'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd });
}
writeFileSync(join(projects.billing, '.claude', 'concise.json'), JSON.stringify({
  features: { emDash: { enabled: true }, aiWriting: { enabled: true, preset: 'default', mode: 'confirm' } },
}, null, 2));
writeFileSync(join(projects.docs, '.claude', 'concise.json'), JSON.stringify({
  maxFileLines: 400, features: { emDash: { enabled: true }, aiWriting: { enabled: true, preset: 'technical' } },
}, null, 2));

function hook(script, cwd, session, input) {
  const payload = JSON.stringify({ session_id: session, cwd, ...input });
  const run = spawnSync('node', [join(repo, 'plugins/concise/hooks', script)], { input: payload, env: { ...env, BEC_MONITOR_PERSIST: '1' }, cwd, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`${script} failed: ${run.stderr}`);
}
const write = (cwd, session, file, content) => hook('check-edit.mjs', cwd, session, { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(cwd, file), content } });
const bash = (cwd, session, command) => hook('check-bash.mjs', cwd, session, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
const reply = (cwd, session, message) => hook('check-reply.mjs', cwd, session, { hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: message });

const b = projects.billing, d = projects.docs;
write(d, '7f02', 'guides/webhooks.md', '# Webhooks\n\nWebhooks are a powerful tool — they let you react to events in real time.\n');
write(d, '7f02', 'guides/webhooks.md', '# Webhooks\n\nWebhooks send an HTTP request to your endpoint when an event occurs.\n');
bash(d, '7f02', 'npm run build');
write(d, '7f02', 'guides/retries.md', '# Retries\n\nFailed deliveries are retried five times with exponential backoff.\n');

write(b, 'a41c', 'src/invoice.ts', '// This function delves into the invoice totals.\n// It carefully iterates over every line item\n// and then sums them to produce a total value\n// which is returned to the caller.\nexport const total = (lines) => lines.reduce((sum, line) => sum + line.amount, 0);\n');
write(b, 'a41c', 'src/invoice.ts', '// Amounts are integer cents; never floats.\nexport const total = (lines) => lines.reduce((sum, line) => sum + line.amount, 0);\n');
write(b, 'a41c', 'src/tax.ts', Array.from({ length: 340 }, (_, i) => `export const rate${i} = ${i / 100};`).join('\n'));
bash(b, 'a41c', 'git commit -m "Leverage a robust, seamless approach to streamline invoice rounding"');
bash(b, 'a41c', 'git commit -m "Round invoice totals to whole cents"');
bash(b, 'a41c', 'gh pr create --title "Round invoice totals" --body "This PR rounds invoice totals to whole cents.\n\nIt also updates the tests.\n\nOverall, this change makes billing more reliable and robust."');
bash(b, 'a41c', 'gh pr create --title "Round invoice totals" --body "Rounds invoice totals to whole cents and updates the rounding tests."');
reply(b, 'a41c', 'Great question! I hope this helps. In summary, the invoice totals now round to whole cents, which ensures accuracy across the board.');
reply(b, 'a41c', 'Invoice totals now round to whole cents. Tests pass.');
const port = 4300 + Math.floor(Math.random() * 600);
const server = spawn('node', [join(repo, 'bin/concise-web.mjs'), '--all', '--no-open', '--port', String(port)], { env, cwd: b });
const consoleUrl = await new Promise((done, fail) => {
  let text = '';
  server.stdout.on('data', chunk => { text += chunk; const match = text.match(/http:\/\/\S+#token=[0-9a-f]+/); if (match) done(match[0]); });
  server.on('exit', code => fail(new Error(`concise-web exited ${code}: ${text}`)));
});

const debugPort = port + 1000;
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${join(root, 'chrome')}`, 'about:blank']);
const wait = ms => new Promise(done => setTimeout(done, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await wait(200);
  target = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).then(list => list.find(t => t.type === 'page')).catch(() => undefined);
}
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(done => socket.addEventListener('open', done));
let id = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => { const message = JSON.parse(data); pending.get(message.id)?.(message); });
const send = (method, params = {}) => new Promise((done, fail) => { const n = ++id; pending.set(n, m => m.error ? fail(new Error(m.error.message)) : done(m.result)); socket.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

const pages = ['overview', 'configuration', 'playground', 'activity', 'rules'];
try {
  mkdirSync(out, { recursive: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: consoleUrl });
  await wait(2500);
  for (const theme of ['light', 'dark']) {
    await evaluate(`(() => { const s = document.querySelector('#theme'); s.value = '${theme}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    for (const page of pages) {
      await evaluate(`document.querySelector('[data-page="${page}"]').click()`);
      if (page === 'playground') await evaluate(`document.querySelector('button')?.ownerDocument && [...document.querySelectorAll('button')].find(b => /Load example/.test(b.textContent))?.click()`);
      await wait(400);
      if (page === 'playground') { await evaluate(`[...document.querySelectorAll('button')].find(b => /Run hooks/.test(b.textContent))?.click()`); await wait(2500); }
      if (page === 'activity') await evaluate(`(() => { const deny = [...document.querySelectorAll('details.record')].find(d => /deny/.test(d.querySelector('summary').textContent) && /leverage/i.test(d.textContent)); if (deny) { deny.open = true; deny.querySelectorAll('details').forEach(inner => { inner.open = /Response/.test(inner.textContent.slice(0, 40)); }); deny.scrollIntoView({ block: 'start' }); scrollBy(0, -16); } })()`);
      // Show the home directory as ~ instead of the throwaway temp path.
      await evaluate(`(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) n.nodeValue = n.nodeValue.split(${JSON.stringify(join(root, 'home'))}).join('~'); })()`);
      if (page === 'playground') await evaluate(`(() => { const h = [...document.querySelectorAll('h2, h3')].find(n => /Inspection result/.test(n.textContent)); h?.scrollIntoView({ block: 'start' }); scrollBy(0, -330); })()`);
      else if (page !== 'activity') await evaluate('scrollTo(0, 0); document.querySelectorAll("main, .content, [data-scroll]").forEach(n => n.scrollTop = 0)');
      await wait(400);
      const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 88 });
      writeFileSync(join(out, `${page}-${theme}.webp`), Buffer.from(data, 'base64'));
      console.log(`captured ${page}-${theme}.webp`);
    }
  }
} finally {
  socket.close();
  browser.kill();
  server.kill('SIGINT');
  await wait(300);
  rmSync(root, { recursive: true, force: true });
}
