import { ok, bad } from "./lib.mjs";
import { makeStats } from "../hooks/lib/text-stats.mjs";
import paragraphCoherence from "../hooks/lib/patterns/ai/paragraph-coherence.mjs";
import readabilityGrade from "../hooks/lib/patterns/ai/readability-grade.mjs";
import outlineConclusion from "../hooks/lib/patterns/ai/outline-conclusion.mjs";
import ruleOfThree from "../hooks/lib/patterns/ai/rule-of-three.mjs";
import passiveVoice from "../hooks/lib/patterns/ai/passive-voice.mjs";
import terminalPunctuation from "../hooks/lib/patterns/ai/terminal-punctuation.mjs";
import punctuationPatterns from "../hooks/lib/patterns/ai/punctuation-patterns.mjs";
import praiseSandwich from "../hooks/lib/patterns/git/praise-sandwich.mjs";

const show = (value) => JSON.stringify(value);
const eq = (name, actual, expected) => (show(actual) === show(expected) ? ok(name) : bad(name, `expected ${show(expected)}, got ${show(actual)}`));
const detect = (pack, text, options = {}) => pack.detect(text, { options: { ...pack.options, ...options }, stats: makeStats(text) });

console.log("\ncoverage-libs: paragraph-coherence");

const coherence = { minWords: 0, minParagraphWords: 0, minParagraphs: 99, minPairs: 1 };
eq("paragraph-coherence passes when no paragraph is kept",
  detect(paragraphCoherence, "Short.", { ...coherence, minRepeatParagraphs: 0 }), []);
eq("paragraph-coherence passes paragraphs without word tokens",
  detect(paragraphCoherence, "42 7. 99 3.\n\n18 4. 66 5.", { ...coherence, minRepeatParagraphs: 2 }), []);

{
  const openers = ["The", "A", "An", "So", "Then"];
  const tails = ["It runs.", "It runs fine today.", "It runs fine on every host we own.", "Ok.", "It runs fine on most hosts."];
  const paras = openers.map((word, i) => `${word} cache layer stores session tokens. ${tails[i]}`);
  const text = paras.join("\n\n");
  eq("paragraph-coherence flags repeated topic sentences", detect(paragraphCoherence, text, { ...coherence, minRepeatParagraphs: 5 }), [{
    index: paras[0].length + 2,
    match: "topic sentences 100% similar across 10 pairs (max 60%)",
    fix: "vary topic sentences",
  }]);
}

console.log("\ncoverage-libs: readability-grade");

eq("readability-grade points at the text start when no sentence is dense",
  detect(readabilityGrade, "42. Go now. Run it.", { minWords: 0, minSentences: 1, maxGrade: -100 }).map((f) => f.index), [0]);

console.log("\ncoverage-libs: outline-conclusion");

{
  const outline = { minWords: 0 };
  const sections = "## Caching\n\nCaching text.\n\n## Retries\n\nRetry text.\n\n## Logging\n\nLog text.\n\n";
  const closer = "To recap, caching, retries, and logging.";
  const text = `${sections}## Summary\n${closer}`;
  eq("outline-conclusion reads a closing paragraph that shares the heading's block", detect(outlineConclusion, text, outline), [{
    index: text.length - closer.length,
    match: "closing paragraph re-lists 3 of 3 headings: Caching, Retries, Logging",
    fix: "end on the last new fact",
  }]);
  eq("outline-conclusion passes a closing heading with nothing after it", detect(outlineConclusion, `${sections}## Summary`, outline), []);
  eq("outline-conclusion passes a long last paragraph",
    detect(outlineConclusion, `${sections}${closer}`, { ...outline, maxParagraphWords: 3 }), []);
}

console.log("\ncoverage-libs: rule-of-three");

{
  const triad = { minWords: 0, minTriads: 1 };
  eq("rule-of-three counts a bullet triad with an empty item",
    detect(ruleOfThree, "- \n- a\n- b", triad), [{ index: 0, match: "1 three-item constructions: -", fix: "vary the count, or cut to two" }]);
  eq("rule-of-three skips a bullet triad with uneven items", detect(ruleOfThree, "- a\n- b c d e f\n- g", triad), []);
}

console.log("\ncoverage-libs: passive-voice, terminal-punctuation, punctuation-patterns, praise-sandwich");

eq("passive-voice asks for active voice when no agent is named",
  detect(passiveVoice, "The file was deleted.", { minWords: 0, minSentences: 1 }).map((f) => f.fix), ["use active voice"]);
eq("terminal-punctuation passes text under minWords", detect(terminalPunctuation, "- a.\n- b.", { minWords: 5, minBlocks: 1, minItems: 1 }), []);
eq("punctuation-patterns passes text that is only a table", detect(punctuationPatterns, "| a | b |\n| c | d |", { minWords: 0 }), []);
eq("praise-sandwich passes praise without a middle critique",
  detect(praiseSandwich, "Great work on this change, it reads well.\n\nThe parser now runs in one pass over the input.\n\nNice job overall here.", {}), []);
