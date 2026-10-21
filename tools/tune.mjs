import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadConfig } from "../hooks/lib/config.mjs";
import { aiConfig, inScope } from "../hooks/lib/packs.mjs";
import { resolveCategories } from "../hooks/lib/ai-patterns.mjs";
import { prepareStyle, styleFindings } from "../hooks/lib/style-check.mjs";
import { PROSE_EXTENSIONS, extOf, proseSpans } from "../hooks/lib/prose.mjs";
import { scanComments } from "../hooks/lib/comment-scan.mjs";
import { isVerbose } from "../hooks/lib/pr-body.mjs";
import { makeStats } from "../hooks/lib/text-stats.mjs";
import { wordCount } from "../hooks/lib/stats-shared.mjs";

export const KINDS = ["docs", "reply", "commit", "gh", "comments"];

const SCAN = {
  docs: { scope: "files", hook: "edit" },
  reply: { scope: "reply", hook: "stop" },
  commit: { scope: "commit", hook: "bash" },
  gh: { scope: "gh", hook: "bash" },
  comments: { scope: "comments", hook: "edit" },
};
const VIRTUAL_PATH = "sample.md";
const DENSITY_WORDS = 500;
const AI_ENABLE_WORDS = 300;
const DASH_ENABLE_WORDS = 1000;
const SEARCH_STEPS = 400;
const EN_DASH = "\u2013";
const EXAMPLES = 3;

// The option a statistical pack is tuned by, and the step that moves it toward passing.
// A negative step lowers a lower-bound option such as minCv.
const THRESHOLDS = {
  "passive-voice": ["maxRatio", 0.01],
  "rare-words": ["maxRatio", 0.01],
  "transition-density": ["maxDensity", 0.01],
  "word-frequency": ["maxShare", 0.001],
  "readability-grade": ["maxGrade", 1],
  "sentence-variation": ["minCv", -0.01],
  "lexical-diversity": ["minRatio", -0.01],
};

// comment-scan.mjs keeps its extension table private; a text in every comment style asks it instead.
const COMMENT_PROBE = "# x\n// x\n/* x */";
const isCodePath = (path) => scanComments(COMMENT_PROBE, path).length > 0;
const wanted = (path, kind) => (kind === "comments" ? isCodePath(path) : PROSE_EXTENSIONS.includes(extOf(path)));
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const sum = (nums) => nums.reduce((a, b) => a + b, 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const decimals = (n) => (String(n).split(".")[1] || "").length;
const isStatistical = (pack) => Boolean(pack.detect) && typeof pack.options.minWords === "number";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** Reads files and walked directories into samples. A walk keeps code files for "comments" and prose files for the other kinds. */
export function readSamples(paths, kind = "docs") {
  const samples = [];
  for (const given of [].concat(paths || [])) {
    const root = resolve(given);
    if (!statSync(root).isDirectory()) {
      samples.push({ name: given, text: readFileSync(root, "utf8"), path: root });
      continue;
    }
    for (const path of walk(root).filter((file) => wanted(file, kind))) {
      samples.push({ name: join(given, relative(root, path)), text: readFileSync(path, "utf8"), path });
    }
  }
  return samples;
}

function scanConfig(config) {
  const features = config.features || {};
  const aiWriting = {
    ...features.aiWriting,
    enabled: true,
    preset: "all",
    categories: null,
    enablePatterns: [],
    disablePatterns: [],
    allow: [],
  };
  return {
    ...config,
    ignoreGlobs: [],
    styleIgnoreGlobs: [],
    features: {
      ...features,
      aiWriting,
      emDash: { ...features.emDash, enabled: true, enDash: true },
      dictionary: { ...features.dictionary, enabled: false },
    },
  };
}

function scan(samples, kind, config) {
  const { scope, hook } = SCAN[kind];
  return samples.map((sample) => {
    const path = kind === "comments" ? sample.path || sample.name : VIRTUAL_PATH;
    const spans = proseSpans(sample.text, path);
    return {
      sample,
      path,
      spans,
      words: sum(spans.map((span) => wordCount(span.text))),
      found: styleFindings(sample.text, path, config, scope, hook),
    };
  });
}

function recorder() {
  const delta = {};
  const evidence = [];
  const put = (key, value, reason, examples = [], list = false) => {
    const parts = key.split(".");
    const last = parts.pop();
    let node = delta;
    for (const part of parts) node = node[part] ??= {};
    if (list && (node[last] || []).includes(value)) return;
    node[last] = list ? [...(node[last] || []), value].sort() : value;
    evidence.push({ key, value, reason, examples: examples.slice(0, EXAMPLES) });
  };
  return { delta, evidence, put };
}

function hitsByCategory(scanned, allow) {
  const allowed = allow.map((phrase) => String(phrase).toLowerCase()).filter(Boolean);
  const out = new Map();
  scanned.forEach((entry, sample) => {
    for (const hit of entry.found.aiWriting) {
      if (allowed.some((phrase) => hit.match.toLowerCase().includes(phrase))) continue;
      if (!out.has(hit.category)) out.set(hit.category, []);
      out.get(hit.category).push({ ...hit, sample, name: entry.sample.name });
    }
  });
  return out;
}

const quoted = (hits) => hits.map((hit) => `"${hit.match}" (${hit.name}:${hit.line})`);

function decide(category, hits, phraseLike, run) {
  const { scanned, words, kept } = run;
  const phrases = new Set(hits.map((hit) => hit.match.toLowerCase()));
  const sampleCount = new Set(hits.map((hit) => hit.sample)).size;
  const spread = `${category} fired ${plural(hits.length, "time")} in ${sampleCount} of ${plural(scanned.length, "sample")}`;
  if (phraseLike && phrases.size === 1 && hits.length >= 2) {
    const [phrase] = phrases;
    run.put("features.aiWriting.allow", phrase, `${spread}, each time on "${phrase}".`, quoted(hits), true);
  } else if (sampleCount >= 2 || hits.length * DENSITY_WORDS >= words) {
    run.put("features.aiWriting.disablePatterns", category, `${spread} over ${words} words.`, quoted(hits), true);
  } else {
    kept.push({ category, reason: `${spread} over ${words} words; left on.` });
  }
}

function tuneOption(pack, hits, run) {
  const [option, step] = THRESHOLDS[pack.id] || [];
  const start = pack.options[option];
  if (typeof start !== "number") return false;
  const { scanned, scope } = run;
  const fired = [...new Set(hits.map((hit) => hit.sample))];
  const spans = fired.flatMap((sample) =>
    scanned[sample].spans.map((span) => ({
      sample,
      text: span.text,
      ctx: { path: scanned[sample].path, scope, stats: makeStats(span.text) },
    })),
  );
  const places = Math.max(decimals(step), decimals(start));
  const round = (n) => Number(n.toFixed(places));
  const firesAt = (value) => (span) => (pack.detect(span.text, { ...span.ctx, options: { ...pack.options, [option]: value } }) || []).length > 0;
  try {
    for (let k = 1; k <= SEARCH_STEPS; k += 1) {
      const value = round(start + k * step);
      if (value < 0) return false;
      if (spans.some(firesAt(value))) continue;
      const binding = spans.find(firesAt(round(value - step))) || spans[0];
      const worst = hits.find((hit) => hit.sample === binding.sample) || hits[0];
      const reason = `${pack.id} fired in ${fired.length} of ${plural(scanned.length, "sample")}, worst at ${worst.match}; ${option} ${value} passes all of them.`;
      run.put(`features.aiWriting.options.${pack.id}.${option}`, value, reason, quoted(hits));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function aiChanges(run, base, hits) {
  for (const category of [...hits.keys()].sort()) {
    if (!base.ids.has(category)) continue;
    const packs = base.packs.filter((pack) => pack.categoryId === category);
    const stat = packs.find(isStatistical);
    if (stat && run.words < stat.options.minWords) continue;
    if (stat && tuneOption(stat, hits.get(category), run)) continue;
    decide(category, hits.get(category), packs.some((pack) => pack.patterns.length > 0), run);
  }
}

function dashChanges(run, dash) {
  const { scanned, words } = run;
  const hits = scanned.flatMap((entry) => entry.found.emDash.map((hit) => ({ ...hit, name: entry.sample.name })));
  const em = hits.filter((hit) => hit.char !== EN_DASH);
  const en = hits.filter((hit) => hit.char === EN_DASH);
  const shown = (list) => list.map((hit) => `"${hit.snippet}" (${hit.name}:${hit.line})`);
  const where = (list) => `${new Set(list.map((hit) => hit.name)).size} of ${plural(scanned.length, "sample")}`;
  if (em.length > 0 && dash.enabled) {
    run.put("features.emDash.enabled", false, `${plural(em.length, "em dash")} in ${where(em)}.`, shown(em));
  } else if (hits.length === 0 && words >= DASH_ENABLE_WORDS && !dash.enabled) {
    run.put("features.emDash.enabled", true, `No dashes in ${words} words over ${plural(scanned.length, "sample")}.`);
  } else if (em.length === 0 && en.length > 0 && dash.enabled && dash.enDash !== false) {
    run.put("features.emDash.enDash", false, `${plural(en.length, "en dash")} and no em dash in ${where(en)}.`, shown(en));
  }
}

function p90(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.ceil(sorted.length * 0.9) - 1];
}

function smallest(fits) {
  let n = 0;
  while (!fits(n)) n += 1;
  return n;
}

function raise(run, key, entries, current, what, unit) {
  const value = p90(entries.map((entry) => entry.value));
  if (typeof current !== "number" || value <= current) return;
  const top = [...entries].sort((a, b) => b.value - a.value).map((entry) => entry.label);
  run.put(key, value, `The p90 of ${what} is ${value} over ${plural(entries.length, unit)} (limit ${current}).`, top);
}

function limitChanges(run, kind, config) {
  const { scanned } = run;
  if (kind === "gh") {
    const count = (body, limits) => smallest((n) => !isVerbose(body, { maxParagraphs: Infinity, maxSentences: Infinity, ...limits(n) }).verbose);
    const per = (limits, unit) =>
      scanned.map((entry) => {
        const value = count(entry.sample.text, limits);
        return { value, label: `${entry.sample.name}: ${plural(value, unit)}` };
      });
    raise(run, "maxPrBodyParagraphs", per((n) => ({ maxParagraphs: n }), "paragraph"), config.maxPrBodyParagraphs, "prose paragraphs per body", "sample");
    raise(run, "maxPrBodySentences", per((n) => ({ maxSentences: n }), "sentence"), config.maxPrBodySentences, "sentences in the longest paragraph", "sample");
  }
  if (kind === "comments") {
    const runs = scanned.flatMap((entry) =>
      scanComments(entry.sample.text, entry.path).map((block) => ({
        value: block.length,
        label: `${entry.sample.name}:${block.startLine} (${plural(block.length, "line")})`,
      })),
    );
    raise(run, "maxCommentLines", runs, config.maxCommentLines, "comment run lengths", "run");
  }
}

/** Proposes a config delta from writing samples. It returns the delta and writes no files. */
export async function tune({ samples = [], kind = "docs", cwd = process.cwd(), config, preset } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`unknown kind "${kind}", expected one of ${KINDS.join(", ")}`);
  const effective = config || loadConfig(cwd);
  const ai = aiConfig(effective);
  const target = preset || ai.preset;
  const scanCfg = scanConfig(effective);
  const loaded = await prepareStyle(cwd, scanCfg);
  const scanned = scan(samples, kind, scanCfg);
  const words = sum(scanned.map((entry) => entry.words));
  const base = resolveCategories({ ...ai, preset: target }, loaded);
  const { scope } = SCAN[kind];
  const run = { scanned, words, scope, ...recorder(), kept: [] };
  const hits = hitsByCategory(scanned, base.allow);

  if (target !== ai.preset) run.put("features.aiWriting.preset", target, `Preset ${target} was asked for in place of ${ai.preset}.`);
  if (!ai.enabled && words >= AI_ENABLE_WORDS) {
    const active = [...new Set(base.packs.filter((pack) => inScope(pack, scope)).map((pack) => pack.categoryId))];
    const clean = active.filter((id) => !hits.has(id)).length;
    run.put("features.aiWriting.enabled", true, `The samples pass ${clean} of ${active.length} active categories with no hit over ${words} words.`);
  }
  aiChanges(run, base, hits);
  dashChanges(run, (effective.features || {}).emDash || {});
  limitChanges(run, kind, effective);

  const insufficient = base.packs
    .filter((pack) => isStatistical(pack) && inScope(pack, scope) && words < pack.options.minWords)
    .map((pack) => ({ pack: pack.id, words, minWords: pack.options.minWords }))
    .sort((a, b) => (a.pack < b.pack ? -1 : 1));
  const kept = run.kept.sort((a, b) => (a.category < b.category ? -1 : 1));
  return { kind, samples: scanned.length, words, delta: run.delta, evidence: run.evidence, kept, insufficient };
}
