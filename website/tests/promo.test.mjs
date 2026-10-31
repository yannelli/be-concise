import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = (path) => readFileSync(new URL(`../promo/${path}`, import.meta.url), 'utf8');
const index = source('index.html');
const fps = 30;

function attributes(id) {
  const tag = index.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0];
  assert.ok(tag, `Missing timeline element ${id}`);
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
}

// Execute authored timelines with a recording GSAP substitute. Browser checks
// remain responsible for interpolation, font metrics, and the final pixels.
function timeline(scene) {
  const calls = [];
  const tl = {
    fromTo(target, from, to, at) { calls.push({ target, from, to, at }); return this; },
    to(target, to, at) { calls.push({ target, to, at }); return this; },
    set(target, to, at) { calls.push({ target, to, at, set: true }); return this; },
  };
  const context = {
    gsap: { timeline: () => tl, set: () => {} },
    document: {
      querySelectorAll: (selector) => Array.from({ length: 4 }, (_, index) => ({ selector, index })),
    },
    window: { __timelines: {} },
  };
  const script = source(`compositions/${scene}.html`).match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, `Missing script for ${scene}`);
  vm.runInNewContext(script, context, { timeout: 1000 });
  assert.equal(context.window.__timelines[scene], tl);
  return calls;
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

test('proof starts on frame 241 with a continuous noise handoff', () => {
  const noise = attributes('noise');
  const proof = attributes('proof');
  near(Number(proof['data-start']) * fps, 241);
  near(Number(noise['data-duration']), Number(proof['data-start']));
  near(Number(proof['data-start']) + Number(proof['data-duration']), 21.7);
});

test('proof camera moves start and land on measured pulse frames', () => {
  const calls = timeline('proof');
  const start = Number(attributes('proof')['data-start']);
  for (const [x, first, last] of [[-4200, 361, 376], [-8400, 496, 511]]) {
    const move = calls.find((call) => call.target === '#pf-world' && call.to.x === x);
    assert.ok(move);
    near((start + move.at) * fps, first);
    near((start + move.at + move.to.duration) * fps, last);
  }
});

test('denial cues stay fixed and repairs have time to read before camera moves', () => {
  const calls = timeline('proof');
  const start = Number(attributes('proof')['data-start']);
  for (const [target, seconds] of [['#pf-d1', 9.2], ['#pf-c1b', 10.47], ['#pf-d2', 13.5], ['#pf-d3', 17.5], ['#pf-p-fix', 556 / fps]]) {
    const reveal = calls.find((call) => call.target === target && call.to.opacity === 1);
    assert.ok(reveal, target);
    near(start + reveal.at, seconds);
  }
  const commitFix = calls.find((call) => call.target?.selector === '#pf-s2 .pf-cf' && call.target.index === 0);
  assert.ok(commitFix);
  near(start + commitFix.at, 436 / fps);
});

test('the console plane waits for the flood and settles on frame 661', () => {
  const calls = timeline('console');
  const start = Number(attributes('console')['data-start']);
  const flood = calls.find((call) => call.target === '#cs-ground');
  const plane = calls.find((call) => call.target === '#cs-plane' && call.to.z === 0);
  const opacity = calls.find((call) => call.target === '#cs-plane' && call.to.opacity === 1);
  assert.ok(plane.at >= flood.at + flood.to.duration);
  near((start + plane.at + plane.to.duration) * fps, 661);
  near((start + opacity.at + opacity.to.duration) * fps, 646);
});

test('repairs land on the bed: strike on 10.03 s, buzzword burst on the 14.03 s re-entry', () => {
  const calls = timeline('proof');
  const start = Number(attributes('proof')['data-start']);
  const strike = calls.find((call) => call.target?.[0]?.selector === '#pf-s1 .pf-strike');
  near((start + strike.at) * fps, 301);
  const burst = calls.filter((call) => call.target?.selector === '#pf-s2 .pf-w' && call.to.scale);
  assert.equal(burst.length, 3);
  near((start + burst[0].at) * fps, 421);
  const strikeCss = source('compositions/proof.html').match(/\.pf-strike\s*\{([^}]*)\}/)[1];
  assert.match(strikeCss, /background: #ff4a24;/);
});

test('the console cuts through four more real views, one per beat after the hold', () => {
  const calls = timeline('console');
  const start = Number(attributes('console')['data-start']);
  const cuts = calls.filter((call) => call.set && call.to.opacity === 1);
  assert.deepEqual(cuts.map((call) => call.target), ['#cs-overview', '#cs-configuration', '#cs-playground', '#cs-rules']);
  cuts.forEach((call, i) => near((start + call.at) * fps, 691 + 15 * i));
  const html = source('compositions/console.html');
  for (const view of ['activity', 'overview', 'configuration', 'playground', 'rules']) {
    assert.match(html, new RegExp(`src="assets/img/${view}-dark\\.webp" alt="Concise console, `));
  }
});

test('the claim lands one word per beat and the stroke becomes the end square on frame 856', () => {
  const calls = timeline('outro');
  const start = Number(attributes('outro')['data-start']);
  const words = calls.filter((call) => call.target?.selector === '.ot-w' && call.to.opacity === 1);
  words.forEach((call, i) => near((start + call.at) * fps, 766 + 15 * i));
  const stroke = calls.find((call) => call.target === '#ot-bar' && call.to.scaleX === 1);
  near((start + stroke.at) * fps, 27.967 * fps);
  const morph = calls.find((call) => call.target === '#ot-bar' && call.to.x === 783);
  near((start + morph.at + morph.to.duration) * fps, 856);
  const square = calls.find((call) => call.target === '#ot-sq' && call.set);
  near((start + square.at) * fps, 856);
  const ink = calls.find((call) => call.target === '#ot-ink');
  near((start + ink.at) * fps, 856);
});

test('the measured stroke and end-lock SFX offsets stay unchanged', () => {
  near(Number(attributes('sfx-stroke')['data-start']), 5.96);
  near(Number(attributes('sfx-lock')['data-start']), 28.46);
  near(Number(attributes('sfx-move1')['data-start']), 12.12);
  near(Number(attributes('sfx-move2')['data-start']) * fps, 496);
  near(Number(attributes('sfx-payoff')['data-start']), 21.423);
  assert.equal(attributes('sfx-payoff').src, 'assets/sfx/impact-bass-1.mp3');
});

test('proof titles share tighter metrics and identify default versus optional checks', () => {
  const proof = source('compositions/proof.html');
  assert.match(proof, /\.pf-label h2\s*\{[^}]*font-size: 112px;[^}]*line-height: 0\.92;/);
  assert.match(proof, /Default: 2 lines\./);
  assert.match(proof, /Optional style checks\./);
  assert.match(proof, /Off by default\./);
  assert.match(proof, /Default: 1 paragraph,/);
});

const px = (css, selector, key) => {
  const rule = css.match(new RegExp(`${selector.replace(/[.#]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const value = rule.match(new RegExp(`(?:^|[\\s;])${key}:\\s*(-?[\\d.]+)px`))?.[1];
  assert.ok(value !== undefined, `${selector} ${key}`);
  return Number(value);
};

test('proof slides use one even grid: margin, gutter and right margin are equal', () => {
  const proof = source('compositions/proof.html');
  const margin = px(proof, '.pf-label', 'left');
  const labelRight = margin + px(proof, '.pf-label', 'width');
  const card = px(proof, '.pf-plane', 'left');
  const cardRight = card + px(proof, '.pf-plane', 'width');
  assert.equal(card - labelRight, margin, 'gutter equals the outer margin');
  assert.equal(1920 - cardRight, margin, 'right margin equals the outer margin');
  assert.equal(px(proof, '.pf-slab', 'width'), px(proof, '.pf-plane', 'width'));
  assert.equal(px(proof, '.pf-body', 'width'), px(proof, '.pf-plane', 'width') - 2 * px(proof, '.pf-body', 'left'));
  for (const [scene, selector] of [['noise', '#nz-title'], ['console', '#cs-title'], ['console', '#cs-plane'], ['outro', '#ot-claim']]) {
    assert.equal(px(source(`compositions/${scene}.html`), selector, 'left'), margin, `${selector} shares the film anchor`);
  }
  assert.match(source('compositions/console.html'), new RegExp(`#cs-cmd\\s*\\{[^}]*right: ${margin}px;`));
});

test('proof motifs are hand-drawn, decorative and cropped by the frame', () => {
  const proof = source('compositions/proof.html');
  assert.doesNotMatch(proof, /Lucide|assets\/icons/);
  assert.equal([...proof.matchAll(/<svg\b/g)].length, 3);
  for (const id of ['comments', 'commits', 'pull-requests']) {
    const svg = proof.match(new RegExp(`<svg\\b[^>]*id="pf-motif-${id}"[^>]*>[\\s\\S]*?<\\/svg>`))?.[0];
    assert.ok(svg, id);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    const numbers = [...svg.replace(/<svg\b[^>]*>/, '').matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
    assert.ok(numbers.some((n) => n < 0) && numbers.some((n) => n > 1080), `${id} bleeds past the frame edge`);
    const station = proof.indexOf(`id="pf-motif-${id}"`);
    assert.ok(station < proof.indexOf('class="pf-label"', station), `${id} paints behind its label`);
  }
  assert.match(proof, /\.pf-motif\s*\{[^}]*stroke: #eeefeb;/);
});

test('the wall barrage accelerates through the last 1.5 s before the stroke', () => {
  const noise = source('compositions/noise.html');
  const frames = JSON.parse(noise.match(/const slamFrames = (\[[^\]]*\])/)[1]);
  assert.equal(frames.length, [...noise.matchAll(/class="nz-w"/g)].length);
  const late = frames.filter((frame) => frame >= 135);
  assert.ok(late.length >= 15, `${late.length} slams in the last 1.5 s`);
  const gaps = late.slice(1).map((frame, i) => frame - late[i]);
  gaps.slice(1).forEach((gap, i) => assert.ok(gap <= gaps[i], 'gaps never widen'));
  assert.equal(gaps.at(-1), 1);
  assert.ok(frames.at(-1) < 180, 'the last slam lands before the stroke');
  assert.match(noise, /fromTo\("#nz-bar", \{ scaleX: 0 \}[^\n]*, 6\);/);
});
