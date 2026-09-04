#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { ok, bad, summary } from "./lib.mjs";
import { scanAiWriting } from "../hooks/lib/ai-patterns.mjs";
import { loadPacks } from "../hooks/lib/packs.mjs";

const loaded = await loadPacks({ cwd: "/nonexistent-concise-cwd" });
const AI_PACKS = loaded.packs.filter((pack) => pack.feature === "aiWriting");
const scan = (text, options = {}) => scanAiWriting(text, { packs: AI_PACKS, ...options });

const show = (v) => JSON.stringify(v);

function eq(name, actual, expected) {
  if (show(actual) === show(expected)) return ok(name);
  bad(name, `expected ${show(expected)}, got ${show(actual)}`);
}

const matchesOnly = (text, id) => scan(text, { categories: [id] }).map((h) => h.match);

console.log("ai-patterns.mjs tier 2");

eq("one tier-2 word alone passes", scan("The harness runs the suite.", { categories: ["vocabulary"] }), []);
eq(
  "two tier-2 words in one paragraph flag",
  matchesOnly("The harness will foster growth.", "vocabulary"),
  ["harness", "foster"],
);
eq(
  "two tier-2 words in different paragraphs pass",
  matchesOnly("The harness runs the suite.\n\nIt will foster growth.", "vocabulary"),
  [],
);
eq(
  "the same tier-2 word twice is one distinct pattern",
  matchesOnly("The harness feeds the harness.", "vocabulary"),
  [],
);

console.log("\nai-patterns.mjs allow list");

eq("load-bearing as metaphor flags", matchesOnly("This module is load-bearing for the auth flow.", "vocabulary"), ["load-bearing"]);
eq("load bearing without the hyphen flags", matchesOnly("That is a load bearing assumption.", "vocabulary"), ["load bearing"]);
eq("load-bearing before a structural noun passes", matchesOnly("a load-bearing wall and a load-bearing structural beam", "vocabulary"), []);
eq("load bearing down is the literal verb", matchesOnly("the load bearing down on the bridge", "vocabulary"), []);

eq("allow drops a matching hit", scan("A robust parser.", { categories: ["vocabulary"], allow: ["robust"] }), []);
eq("allow is case-insensitive", scan("A Robust parser.", { categories: ["vocabulary"], allow: ["ROBUST"] }), []);
eq(
  "allow only drops the phrase it names",
  matchesOnly("A robust parser that we delve into.", "vocabulary").filter((m) => m !== "delve"),
  ["robust"],
);
eq(
  "allow leaves other hits",
  scan("A robust parser that we delve into.", { categories: ["vocabulary"], allow: ["robust"] }).map((h) => h.match),
  ["delve"],
);

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
