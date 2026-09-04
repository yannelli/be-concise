#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok, bad, withConfig, run, CHECK_EDIT } from "./lib.mjs";
import { loadPacks } from "../hooks/lib/packs.mjs";
import { scanAiWriting } from "../hooks/lib/ai-patterns.mjs";

const dirs = [];
let seq = 0;
const loaded = await loadPacks({ cwd: "/nonexistent-concise-cwd" });

function project(category) {
  const dir = mkdtempSync(join(tmpdir(), "concise-rhet-"));
  dirs.push(dir);
  withConfig(dir, { features: { aiWriting: { enabled: true, categories: [category] } } });
  seq += 1;
  return { dir, sid: `rhet-${process.pid}-${seq}` };
}

const event = (c, content) => ({
  tool_name: "Write",
  tool_input: { file_path: join(c.dir, "doc.md"), content },
  cwd: c.dir,
  session_id: c.sid,
});

const denied = (r) => r.hookSpecificOutput?.permissionDecision === "deny";
const reason = (r) => r.hookSpecificOutput?.permissionDecisionReason || "";
const short = (t) => t.replace(/\s+/g, " ").trim().slice(0, 44);

function fires(category, text) {
  const result = run(CHECK_EDIT, event(project(category), text));
  if (denied(result)) return ok(`${category} flags: ${short(text)}`);
  bad(`${category} flags: ${short(text)}`, "expected a deny");
}

function clean(category, texts, name) {
  const result = run(CHECK_EDIT, event(project(category), `${texts.join("\n\n")}\n`));
  if (!denied(result)) return ok(`${category} passes ${name}`);
  bad(`${category} passes ${name}`, reason(result).slice(0, 240));
}

function unit(id, text, fix) {
  const packs = loaded.packs.filter((p) => p.id === id);
  const first = scanAiWriting(text, { packs, ctx: { path: "d.md", scope: "files" } })[0];
  if (!first) return bad(`${id} scan`, "no finding");
  if (first.category !== id) return bad(`${id} scan`, `category ${first.category}`);
  if (first.fix !== fix) return bad(`${id} scan`, `fix ${JSON.stringify(first.fix)}`);
  ok(`${id} scan reports the category and the fix`);
}

const TECHNICAL = [
  "Worker count is configurable from 2 to 10 workers.",
  "Permissions are read, write, and execute.",
  "This function always returns null when the input list is empty.",
];

console.log("\nrhetorical packs: negative-parallelism");

for (const text of [
  "Not a bug. Not a regression. Just a config file nobody updated.\n",
  "This isn't slow because of the network. It's not slow because of the database. It's slow because of the N+1 query in the loop.\n",
  "No retries, no fallback, just a raw fetch call that fails silently.\n",
  "Not a rewrite. Not a refactor. But a one-line fix to the timeout value.\n",
  "No caching, no batching, just a straight loop over every row.\n",
]) {
  fires("negative-parallelism", text);
}
clean(
  "negative-parallelism",
  [
    "The function does not retry on failure; it throws immediately.",
    "Not every test passes yet, but the core path is covered.",
    "No config file was found, so the defaults apply.",
    "We don't support Python 2. We do support 3.9 and later.",
    "The exclusion list has three entries: not read-only, not write-only, and not executable.",
    ...TECHNICAL,
  ],
  "single negations and technical enumerations",
);
unit("negative-parallelism", "No retries, no fallback, just a raw fetch call.", "state the one claim");

console.log("\nrhetorical packs: overgeneralization");

for (const text of [
  "Everyone knows that global state makes testing harder.\n",
  "The industry agrees that microservices are the right default now.\n",
  "No one can deny that this pattern outperforms the old one.\n",
  "In every case, this approach beats the naive implementation.\n",
  "All developers want faster CI, so this change speeds up the pipeline.\n",
]) {
  fires("overgeneralization", text);
}
clean(
  "overgeneralization",
  [
    "The retry loop never exceeds three attempts.",
    "All tests pass on the current branch.",
    "Some teams prefer trunk-based development; this repo uses feature branches.",
    "Every request is logged with a trace ID.",
    ...TECHNICAL,
  ],
  "checkable claims about code",
);
unit("overgeneralization", "Everyone knows that global state hurts.", "name who agrees");

console.log("\nrhetorical packs: false-ranges");

for (const text of [
  "This library handles everything from parsing to validation to rendering.\n",
  "The refactor touches anything from the router to the database layer.\n",
  "The changelog runs the gamut from bug fixes to a total UI overhaul.\n",
  "It covers the full spectrum of concerns from security to performance.\n",
  "Support spans from the CLI to the web app to the mobile client.\n",
]) {
  fires("false-ranges", text);
}
clean(
  "false-ranges",
  [
    "The timeout ranges from 30 seconds to 5 minutes depending on the endpoint.",
    "Supported versions run from Python 3.9 to 3.12.",
    "Latency dropped from 800ms to 60ms after the fix.",
    "The migration covers rows from ID 1000 to ID 5000.",
    "The score runs from 0 (never kill) to 1000 (always kill) to decide the victim.",
    "It folds the list from left to right to reduce it to a single value.",
    "The loop walks from highest to lowest index to prevent index shifting.",
    ...TECHNICAL,
  ],
  "real two-point ranges",
);
unit("false-ranges", "It handles everything from parsing to rendering.", "list the specific items");

console.log("\nrhetorical packs: superficial-analysis");

for (const text of [
  "This is important because it changes how the whole team works.\n",
  "The fix has significant implications for every downstream consumer.\n",
  "The value of this refactor cannot be overstated.\n",
  "This change underscores its significance for the project's future.\n",
  "This result speaks volumes about the quality of the test suite.\n",
]) {
  fires("superficial-analysis", text);
}
clean(
  "superficial-analysis",
  [
    "This matters: the query ran in 40ms instead of 4 seconds.",
    "The migration touches 12 tables and 3 services.",
    "This bug caused a 20% increase in 500 errors last week.",
    "The change is small: one function, four lines.",
    "This library replaces the old HTTP client with a pooled one.",
    ...TECHNICAL,
  ],
  "measured claims",
);
unit("superficial-analysis", "The value of this refactor cannot be overstated.", "state the fact plainly");

console.log("\nrhetorical packs: promotional");

for (const text of [
  "This update unlocks the full potential of the caching layer.\n",
  "The new SDK is a turnkey, industry-leading solution for auth.\n",
  "This effortless integration will supercharge your workflow.\n",
  "Our landmark release takes your deployment pipeline to the next level.\n",
  "This acclaimed, award-winning approach is the one-stop shop for logging.\n",
]) {
  fires("promotional", text);
}
clean(
  "promotional",
  [
    "This change unlocks a mutex held by the previous request.",
    "The setup takes one command and a config file.",
    "This PR fixes the auth token refresh race condition.",
    "The new client is faster than the old one by about 30%.",
    "This library is a thin wrapper around the vendor's REST API.",
    "The queue holds outstanding requests until the device replies.",
    ...TECHNICAL,
  ],
  "plain change descriptions",
);
unit("promotional", "This update unlocks the full potential of caching.", "name what changes");
fires("promotional", "The reviewer called it outstanding work.\n");

console.log("\nrhetorical packs: vague-attribution");

for (const text of [
  "Experts agree that connection pooling is the right fix here.\n",
  "Studies show that caching reduces load on the database.\n",
  "It is widely believed that this pattern scales better.\n",
  "Many argue that this framework is the industry standard now.\n",
  "Some observers argue that this approach adds unneeded complexity.\n",
]) {
  fires("vague-attribution", text);
}
clean(
  "vague-attribution",
  [
    "Per RFC 7231 section 6.5.1, a 400 response means a malformed request.",
    "The team decided to use trunk-based development for this repo.",
    "The benchmark in bench/results.md shows a 3x speedup.",
    "Alice suggested using a debounce here; this PR does that.",
    "The linked issue #482 explains why this workaround exists.",
    ...TECHNICAL,
  ],
  "named sources",
);
unit("vague-attribution", "Experts agree that pooling is right here.", "name the expert");

console.log("\nrhetorical packs: contrast extension");

for (const text of [
  "This isn't about speed. It's about correctness.\n",
  "It's less about the framework and more about how you structure state.\n",
  "Instead of retrying forever, it's a single attempt with a clear error.\n",
  "This is less about adding features and more about removing footguns.\n",
]) {
  fires("contrast", text);
}
clean(
  "contrast",
  [
    "Use a list rather than an array here for O(1) inserts.",
    "Instead of polling, this uses a webhook.",
    "This isn't finished. There's still one failing test.",
    "Less code means fewer bugs.",
    "This approach favors composition rather than inheritance.",
    "Not a bug. Not a regression. Just a config file nobody updated.",
    ...TECHNICAL,
  ],
  "rather-than and stacked negations",
);
unit("contrast", "This isn't about speed. It's about correctness.", "combine into one claim");

console.log("\nrhetorical packs: formatting extension");

for (const text of [
  "\u{1F680} Performance improvements\n\nThis release is much faster.\n",
  "- \u{1F527} Fix the config loader\n- \u{1F4E6} Bump the dependency\n",
  "Deploy \u{1F680}: run the script.\n",
]) {
  fires("formatting", text);
}
clean(
  "formatting",
  [
    "The fix works great \u{1F389} thanks for the quick review!",
    "Time: 10:30 AM",
    "- Fix the config loader",
    "\u00A9 2026 Acme Corp. All rights reserved.",
    "Acme\u2122: the parser ships under that name.",
    ...TECHNICAL,
  ],
  "mid-sentence emoji, a copyright line, and a plain colon",
);
unit("formatting", "\u{1F680} Performance improvements\n", "remove");

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
