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
  };
  const context = {
    gsap: { timeline: () => tl },
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
  for (const [target, seconds] of [['#pf-d1', 9.2], ['#pf-c1b', 10.4], ['#pf-d2', 13.5], ['#pf-d3', 17.5], ['#pf-p-fix', 18.75]]) {
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

test('the end square settles and name wipe starts together on frame 856', () => {
  const calls = timeline('outro');
  const start = Number(attributes('outro')['data-start']);
  const square = calls.find((call) => call.target === '#ot-sq');
  const word = calls.find((call) => call.target === '#ot-word');
  near((start + square.at + square.to.duration) * fps, 856);
  near((start + word.at) * fps, 856);
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
  assert.match(proof, /\.pf-label\s*\{[^}]*left: 160px;[^}]*width: 500px;/);
  assert.match(proof, /\.pf-label h2\s*\{[^}]*font-size: 112px;[^}]*line-height: 0\.92;/);
  assert.match(proof, /Default: 2 lines\./);
  assert.match(proof, /Optional style checks\./);
  assert.match(proof, /Off by default\./);
  assert.match(proof, /Default: 1 paragraph,/);
});

test('proof motifs are faint, decorative, and use credited Lucide geometry', () => {
  const proof = source('compositions/proof.html');
  const shapes = (svg) => [...svg.matchAll(/<(?:path|circle|line)\b[^>]*\/>/g)]
    .map(([shape]) => shape.replace(/\s+/g, ' ').trim());
  assert.equal([...proof.matchAll(/<svg\b/g)].length, 3);
  for (const [id, asset] of [
    ['comments', 'message-square-text'],
    ['commits', 'git-commit-horizontal'],
    ['pull-requests', 'git-pull-request'],
  ]) {
    const icon = proof.match(new RegExp(`<svg\\b[^>]*id="pf-motif-${id}"[^>]*>[\\s\\S]*?<\\/svg>`))?.[0];
    assert.ok(icon, id);
    assert.match(icon, /aria-hidden="true"/);
    assert.match(icon, /focusable="false"/);
    assert.match(icon, /data-layout-ignore/);
    assert.deepEqual(shapes(icon), shapes(source(`assets/icons/${asset}.svg`)));
  }
  const opacity = Number(proof.match(/\.pf-motif\s*\{[^}]*opacity:\s*([\d.]+)/)?.[1]);
  assert.ok(opacity > 0 && opacity <= 0.1, `Motif opacity ${opacity} must remain faint`);
  assert.match(source('assets/icons/LICENSE'), /ISC License[\s\S]*Lucide/);
});
