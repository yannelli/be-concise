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
  const dir = mkdtempSync(join(tmpdir(), "concise-rhet2-"));
  dirs.push(dir);
  withConfig(dir, { features: { aiWriting: { enabled: true, categories: [category] } } });
  seq += 1;
  return { dir, sid: `rhet2-${process.pid}-${seq}` };
}

const event = (c, content) => ({
  tool_name: "Write",
  tool_input: { file_path: join(c.dir, "doc.md"), content },
  cwd: c.dir,
  session_id: c.sid,
});

const denied = (r) => r.hookSpecificOutput?.permissionDecision === "deny";
const reason = (r) => r.hookSpecificOutput?.permissionDecisionReason || "";

function fires(category, name, text) {
  const result = run(CHECK_EDIT, event(project(category), text));
  if (denied(result)) return ok(`${category} flags ${name}`);
  bad(`${category} flags ${name}`, "expected a deny");
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

const FILLER = "The parser reads one token at a time from the input buffer.";
const pad = (n) => `${FILLER} `.repeat(n).trim();
const section = (title, body) => `## ${title}\n\n${body} ${pad(9)}\n\n`;
const TECHNICAL = [
  "Worker count is configurable from 2 to 10 workers.",
  "Permissions are read, write, and execute.",
  "This function always returns null when the input list is empty.",
];

console.log("\nrhetorical packs: outline-conclusion");

const GUIDE =
  section("Setup", "Install the package and configure the token.") +
  section("Usage", "Call run() with the input path.") +
  section("Troubleshooting", "Check the log file for stack traces.") +
  "## Conclusion\n\nAs we've seen, setup takes one command, usage is a single function call, and troubleshooting just means reading the log file.\n";
const PLAN =
  section("Migration steps", "Drop the old column first.") +
  section("Rollback plan", "Restore the snapshot from the nightly job.") +
  section("Testing", "Run the suite twice.") +
  "In conclusion, we've walked through the migration steps, the rollback plan, and the testing approach.\n";

fires("outline-conclusion", "a conclusion that re-lists every heading", GUIDE);
fires("outline-conclusion", "a closing paragraph with no heading of its own", PLAN);
clean(
  "outline-conclusion",
  [
    section("Background", "The service used polling.") +
      section("Change", "It now uses webhooks.") +
      section("Result", "The queue drains faster.") +
      "Latency dropped from 800ms to 60ms after the switch.",
  ],
  "a closing paragraph that adds a new fact",
);
clean(
  "outline-conclusion",
  [
    section("API", "The public surface.") +
      section("Examples", "One per method.") +
      section("FAQ", "Common questions.") +
      "The FAQ answers questions the API and examples do not cover, like rate limits and auth scopes.",
  ],
  "a cross-reference between two sections",
);
clean(
  "outline-conclusion",
  [
    section("Setup", "Install it.") +
      section("Usage", "Call it.") +
      section("Troubleshooting", "Read the logs.") +
      "## Conclusion\n\nThe retry budget is now three attempts with jitter.",
  ],
  "a conclusion that states one new fact",
);
clean("outline-conclusion", ["## Setup\n\nInstall the package.\n\n## Usage\n\nCall run()."], "a short two-section doc");
clean("outline-conclusion", ["In conclusion, the fix was a one-line null check.", ...TECHNICAL], "a one-line conclusion");
unit("outline-conclusion", GUIDE, "end on the last new fact");

console.log("\nrhetorical packs: elegant-variation");

const ROTATES = `${pad(20)}\n\nThe helper function is small. This routine handles one case. The method never touches global state.\n`;
const ROLES = `${pad(20)}\n\nTwo engineers reviewed the change. The developers agreed the approach was sound, and the programmers merged it.\n`;
const DEFECTS = `${pad(20)}\n\nThe bug was easy to reproduce. The defect only appeared under load. The flaw was in the retry logic.\n`;

fires("elegant-variation", "three words for one function", ROTATES);
fires("elegant-variation", "three words for one group of people", ROLES);
fires("elegant-variation", "three words for one defect", DEFECTS);
fires("elegant-variation", "aforementioned", "The aforementioned config file controls all of this.\n");
fires("elegant-variation", "the eponymous", "Improved caching, the eponymous feature of this release, cuts latency in half.\n");
clean(
  "elegant-variation",
  [
    pad(20),
    "The parse function is small. It handles one case. It never touches global state.",
    "The bug was easy to reproduce. It only appeared under load, in the retry logic.",
    "This config file controls startup, logging, and shutdown.",
    "Two reviewers approved the change, then a third merged it.",
    "The test suite covers unit tests, integration tests, and end-to-end tests.",
    ...TECHNICAL,
  ],
  "pronoun reuse and a deliberate glossary",
);
unit("elegant-variation", ROTATES, "reuse one term, or a pronoun");

console.log("\nrhetorical packs: undue-emphasis");

for (const [name, text] of [
  ["a stress word in bold", "This is **critical** to understand before deploying.\n"],
  ["a rare intensifier", "This change is extremely important and highly impactful for every user.\n"],
  ["a stress word in capitals", "You must NEVER call this function from a signal handler.\n"],
  ["two rare intensifiers", "The fix is remarkably elegant and utterly transformative for performance.\n"],
  ["two stacked intensifiers", "This is very small and very late, so it waits.\n"],
]) {
  fires("undue-emphasis", name, text);
}
clean(
  "undue-emphasis",
  [
    "This is important: run the migration before deploying.",
    "WARNING: this command deletes all local branches.",
    "The API is a JSON, REST-based interface over HTTPS.",
    "The fix is small and easy to review.",
    "This is a very small change to one config value.",
    ...TECHNICAL,
  ],
  "an admonition label and one intensifier",
);
unit("undue-emphasis", "This is very small and very late, so it waits.", "cut the intensifiers");

console.log("\nrhetorical packs: rule-of-three");

const TRIADS = `The new client is fast, reliable, and easy to use. It's also secure, scalable, and simple to deploy. First, install it. Second, configure it. Third, run it.\n\n${pad(9)}\n`;
const RELEASE = `This release is faster, safer, and more predictable than the last one, and the docs are clearer, shorter, and better organized too. The plan has three parts: first, freeze the schema; second, migrate the data; third, cut over traffic.\n\n${pad(9)}\n`;
const APIS = `The API is simple, consistent, and well-documented, and the SDK is lightweight, typed, and dependency-free.\n\n${pad(9)}\n`;

fires("rule-of-three", "two word triads and an ordinal triad", TRIADS);
fires("rule-of-three", "two word triads and a semicolon triad", RELEASE);
fires("rule-of-three", "two word triads in one paragraph", APIS);
clean(
  "rule-of-three",
  [
    "The pipeline has two stages: build and deploy.",
    "First, install the CLI. Then configure your credentials.",
    "The server exposes CPU, memory, and disk metrics on one dashboard.",
    "- Fast setup\n- Clear docs",
    ...TECHNICAL,
    pad(10),
  ],
  "two accurate triads in a long text",
);
unit("rule-of-three", TRIADS, "vary the count, or cut to two");

console.log("\nrhetorical packs: parallel-bullets");

for (const [name, text] of [
  ["bold lead-ins", "- **Speed**: 3x faster on cold start\n- **Safety**: type-checked end to end\n- **Simplicity**: one config file\n"],
  ["one repeated opening word", "- Improved caching\n- Improved logging\n- Improved error handling\n"],
  ["gerunds and one opening word", "- Adding retry logic\n- Adding backoff\n- Adding circuit breakers\n"],
  ["a repeated opening clause", "- This fixes the login bug\n- This fixes the timeout bug\n- This fixes the memory leak\n"],
  ["bold labels with a colon", "- **Fast**: sub-second response\n- **Reliable**: 99.9% uptime\n- **Cheap**: half the cost\n"],
]) {
  fires("parallel-bullets", name, text);
}
clean(
  "parallel-bullets",
  [
    "- Fixed the login timeout\n- Added a retry with backoff\n- Removed the unused dependency",
    "- **API**: the public interface\n- Internals are in src/\n- See CONTRIBUTING.md for setup",
    "- Fast\n- Reliable",
    "A Chicago technical writer should be proficient in: **Finding** great pizza, **Riding** the L, **Standing** on the Skydeck.",
    "- Read the docs\n- File an issue if something's unclear\n- Send a PR when you're ready",
    ...TECHNICAL,
  ],
  "varied openings and a two-item list",
);
unit("parallel-bullets", "- Improved caching\n- Improved logging\n- Improved error handling\n", "vary the openings, or use prose");

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
