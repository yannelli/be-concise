import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad } from "./lib.mjs";
import { commandFrom, main, render } from "../scripts/concise-config.mjs";
import { operations } from "../tools/operations.mjs";

const CLI = join(ROOT, "scripts", "concise-config.mjs");
const dirs = [];
const show = (value) => JSON.stringify(value);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual).slice(0, 400)));

function project(config) {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-cli-"));
  dirs.push(dir);
  mkdirSync(join(dir, ".claude"));
  if (config) writeFileSync(join(dir, ".claude", "concise.json"), JSON.stringify(config));
  return dir;
}

console.log("\ncoverage: concise-config");

{
  let thrown = "";
  try { commandFrom(["set", "maxRetries"]); } catch (error) { thrown = error.message; }
  check("set without a value is refused", thrown === "A value is required", thrown);
  const dir = project();
  const file = join(dir, "text.md");
  writeFileSync(file, "from the file");
  check("check reads --file", commandFrom(["check", "--file", file]).args.text === "from the file", commandFrom(["check", "--file", file]));
  const preload = join(dir, "tty.mjs");
  writeFileSync(preload, "Object.defineProperty(process.stdin, \"isTTY\", { value: true });\n");
  const child = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, CLI, "check"], { encoding: "utf8", input: "" });
  check("check with no text on a terminal exits 2 and says how to pass it", child.status === 2
    && child.stderr.includes("Pass the text as an argument, with --file, or on stdin"), child);
}

{
  const keys = await main(["keys", "maxRetries"]);
  check("keys prints key, default, and description rows", keys.code === 0 && /^maxRetries \(\d+\): /m.test(keys.text), keys.text);
  const dir = project({ maxRetries: 3 });
  const got = await main(["get", "maxRetries", "--cwd", dir]);
  check("get prints JSON", JSON.parse(got.text).effective === 3, got.text);
}

{
  const dir = project({ bypass: { phrases: ["ship it"] }, maxCommentLines: 1, maxFileLines: 2 });
  const bypassed = await main(["check", "ship it", "--cwd", dir]);
  check("check names the bypass phrase", bypassed.code === 0 && bypassed.text === "Allowed by bypass \"ship it\".", bypassed.text);
  const core = await main(["check", "// a\n// b\nconst x = 1;\n", "--scope", "comments", "--cwd", dir]);
  check("core findings print with and without a line", core.code === 1 && core.text.includes("[concise:comments] line 1: comment run of 2 lines")
    && core.text.includes("[concise:fileSize] 4 lines as a new file"), core.text);
}

{
  const dir = project({});
  const sample = join(dir, "sample.md");
  writeFileSync(sample, "The parser reads each line. It stores the tokens.\n");
  const tuned = await main(["tune", sample, "--cwd", dir, "--kind", "docs"]);
  check("tune prints the sample count and the edit preview", tuned.code === 0 && tuned.text.startsWith("1 sample, ") && tuned.text.includes("kind docs."), tuned.text);
  const text = render("tune", {
    samples: 2, words: 1, kind: "reply", layer: { label: "Project", path: "/p" }, changed: true, applied: true, diff: "+ x",
    evidence: [{ key: "a.b", value: 1, reason: "why", examples: ["eg one"] }, { key: "c", value: true, reason: "plain" }],
    kept: [{ category: "hedging", reason: "rare" }],
    insufficient: [{ pack: "word-frequency", minWords: 200, words: 1 }],
  });
  check("tune text lists evidence, examples, kept, and short packs", text.startsWith("2 samples, 1 word, kind reply.")
    && text.includes("- a.b = 1: why\n    eg one\n- c = true: plain") && text.includes("- kept hedging: rare")
    && text.includes("- word-frequency: needs 200 words, samples have 1") && text.endsWith("Written."), text);
  const bare = render("tune", { samples: 1, words: 2, kind: "docs", evidence: [], layer: { label: "L", path: "/p" }, changed: false });
  check("tune text without kept or insufficient lists", bare === "1 sample, 2 words, kind docs.\n\nL: /p\nNo change.", bare);
}

{
  const dir = project();
  writeFileSync(join(dir, ".claude", "concise.json"), "{ broken");
  const text = render("show", operations.show({ cwd: dir, env: { BEC_MAX_RETRIES: "4" } }));
  check("show lists layers, marks missing files, and the effective settings", text.startsWith("Layers (* marks")
    && /\* project-claude +\S+concise\.json\n/.test(text) && /project-codex +\S+ \(missing\)/.test(text) && text.includes("Effective settings:\n{"), text);
  check("show lists environment overrides and problems", text.includes("Environment overrides:\n  BEC_MAX_RETRIES=4") && text.includes("Problems:\n  "), text);
  const clean = render("show", operations.show({ cwd: project({}), env: {} }));
  check("show omits empty override and problem sections", !clean.includes("Environment overrides:") && !clean.includes("Problems:"), clean);
}

{
  const entries = [
    { id: "re", match: "regex", value: "fo+", fix: "foo", hooks: ["stop"] },
    { id: "plain", match: "exact", value: "bar", fix: "baz", scopes: ["reply", "gh"] },
    { id: "lined", match: "contains", value: "qux", fix: "quux", on: "line" },
    { id: "off-one", enabled: false },
    { id: "bad", match: "exact", value: "x" },
  ];
  const dir = project({ features: { dictionary: { enabled: false, entries } } });
  const text = render("dictionary", operations.dictionary({ cwd: dir, env: {} }));
  const lines = text.split("\n");
  check("dictionary list prints the state and one line per entry", lines[0] === "Dictionary off, mode confirm." && lines.length === 6, lines);
  check("a regex entry has no unit and shows its hooks", lines[1] === "re: regex \"fo+\" -> foo [hooks stop] from project-claude", lines[1]);
  check("an exact entry defaults to word and shows its scopes", lines[2] === "plain: exact on word \"bar\" -> baz [scopes reply,gh] from project-claude", lines[2]);
  check("an entry with a unit prints it", lines[3] === "lined: contains on line \"qux\" -> quux from project-claude", lines[3]);
  check("a disabled entry is marked off", lines[4] === "off-one: from project-claude (off)", lines[4]);
  check("an unusable entry shows why it is skipped", lines[5].startsWith("bad: exact on word \"x\" ->  from project-claude (skipped: fix must be"), lines[5]);
  const none = await main(["dict", "test", "nothing here", "--value", "zorb", "--fix", "zap"]);
  check("dict test with no hit prints No matches.", none.text === "No matches.", none.text);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
