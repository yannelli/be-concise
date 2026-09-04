#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { ok, bad, summary } from "./lib.mjs";
import {
  words,
  sentences,
  paragraphs,
  lines,
  listBlocks,
  headings,
  syllables,
  makeStats,
} from "../hooks/lib/text-stats.mjs";

const show = (v) => JSON.stringify(v);

function eq(name, actual, expected) {
  if (show(actual) === show(expected)) return ok(name);
  bad(name, `expected ${show(expected)}, got ${show(actual)}`);
}

function yes(name, condition, detail) {
  if (condition) return ok(name);
  bad(name, detail || "expected true");
}

const texts = (items) => items.map((i) => i.text);
const offsetsMatch = (text, items) => items.every((i) => text.slice(i.start, i.end) === i.text);

console.log("\ntext-stats.mjs words");

{
  const text = "Don't split well-known words: 42 tests, run-tests.mjs.";
  const found = words(text);
  eq("words keep apostrophes, digits, and hyphens", texts(found), [
    "Don't",
    "split",
    "well-known",
    "words",
    "42",
    "tests",
    "run-tests",
    "mjs",
  ]);
  yes("word offsets point at the word", offsetsMatch(text, found));
  eq("a lone dash is not a word", texts(words("-- ok --")), ["ok"]);
  eq("empty text has no words", words(""), []);
}

console.log("\ntext-stats.mjs sentences");

{
  const text = "One two. Three four! Five?";
  const found = sentences(text);
  eq("three sentences", texts(found), ["One two.", "Three four!", "Five?"]);
  yes("sentence offsets point at the sentence", offsetsMatch(text, found));
  eq("second sentence starts after the space", found[1].start, text.indexOf("Three"));
}

eq("e.g. does not split", texts(sentences("Use a short form, e.g. this one. Then stop.")), [
  "Use a short form, e.g. this one.",
  "Then stop.",
]);
eq("i.e. does not split", texts(sentences("The first pass, i.e. the parser, runs.")), ["The first pass, i.e. the parser, runs."]);
eq("etc. does not split", texts(sentences("Tabs, spaces, etc. are stripped.")), ["Tabs, spaces, etc. are stripped."]);
eq("vs. does not split", texts(sentences("Node vs. Deno is not the question.")), ["Node vs. Deno is not the question."]);
eq("initials do not split", texts(sentences("J. R. R. Tolkien wrote it.")), ["J. R. R. Tolkien wrote it."]);
eq("a decimal does not split", texts(sentences("Version 3.14 shipped. Next.")), ["Version 3.14 shipped.", "Next."]);
eq("a trailing fragment is a sentence", texts(sentences("Done. And more")), ["Done.", "And more"]);
eq("empty text has no sentences", sentences("   "), []);

console.log("\ntext-stats.mjs paragraphs, lines, headings");

{
  const text = "one\ntwo\n\nthree\n";
  const found = paragraphs(text);
  eq("paragraph texts", texts(found), ["one\ntwo", "three\n"]);
  yes("paragraph offsets point at the paragraph", offsetsMatch(text, found));
  eq("second paragraph starts at three", found[1].start, text.indexOf("three"));
}

{
  const text = "a\nbb\n";
  const found = lines(text);
  eq("lines split on the newline", texts(found), ["a", "bb", ""]);
  yes("line offsets point at the line", offsetsMatch(text, found));
  eq("second line start", found[1].start, 2);
}

{
  const text = "# Title\n\ntext\n### Deep\n";
  const found = headings(text);
  eq("heading levels", found.map((h) => h.level), [1, 3]);
  eq("heading titles", found.map((h) => h.title), ["Title", "Deep"]);
  yes("heading offsets point at the line", offsetsMatch(text, found));
  eq("a hash without a space is not a heading", headings("#tag\n"), []);
}

console.log("\ntext-stats.mjs listBlocks");

{
  const text = "intro\n- one\n- two\n  wrapped\n\n1. first\n2) second\n";
  const found = listBlocks(text);
  eq("two blocks", found.length, 2);
  eq("first block markers", found[0].items.map((i) => i.marker), ["-", "-"]);
  eq("a wrapped line joins the item above", found[0].items[1].text, "- two\n  wrapped");
  eq("ordered markers", found[1].items.map((i) => i.marker), ["1.", "2)"]);
  yes("block offsets point at the block", offsetsMatch(text, found));
  yes("item offsets point at the item", offsetsMatch(text, found.flatMap((b) => b.items)));
  eq("prose alone has no list blocks", listBlocks("just prose\n"), []);
}

console.log("\ntext-stats.mjs syllables and makeStats");

eq("one syllable", syllables("cat"), 1);
eq("silent e", syllables("parse"), 1);
eq("two syllables", syllables("parser"), 2);
eq("four syllables", syllables("category"), 4);
eq("no letters", syllables("42"), 0);

{
  const stats = makeStats("One two. Three four.\n\n- item\n");
  eq("stats.words counts every word", stats.words().length, 5);
  eq("stats.sentences", stats.sentences().length, 3);
  eq("stats.paragraphs", stats.paragraphs().length, 2);
  eq("stats.listBlocks", stats.listBlocks().length, 1);
  eq("stats.headings", stats.headings(), []);
  eq("stats.syllables", stats.syllables("parser"), 2);
  yes("stats memoizes each helper", stats.words() === stats.words());
  eq("stats carries the text", stats.text.startsWith("One two."), true);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
