import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ok, bad, withConfig } from "./lib.mjs";
import { EM, EN } from "./features-lib.mjs";
import { parseBool, parseList, parseSize, readEnv } from "../hooks/lib/env.mjs";
import { createLogger, softFailResult } from "../hooks/lib/log.mjs";
import { bumpAttempt, cleanupSession, once, statePath, withStateScope } from "../hooks/lib/state.mjs";
import { mergeFlag } from "../hooks/lib/respond.mjs";
import { contextText } from "../hooks/lib/context.mjs";
import { loadConfig } from "../hooks/lib/config.mjs";
import { listProjects, projectKey, projectName } from "../hooks/lib/projects.mjs";
import { EDIT, firedAny, styleMessage, styleSummary } from "../hooks/lib/style-message.mjs";
import { bypassMatch } from "../hooks/lib/hook-main.mjs";

const dirs = [];
const show = (value) => JSON.stringify(value).slice(0, 400);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual)));
const sha = (value) => createHash("sha256").update(value).digest("hex");

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-lib-"));
  dirs.push(dir);
  return dir;
}

console.log("\ncoverage: env parsing");

{
  check("parseBool returns null for an unknown word", parseBool("maybe") === null, parseBool("maybe"));
  check("parseSize rejects a negative or infinite number", parseSize(-1) === null && parseSize(Infinity) === null, null);
  check("parseSize rejects a zero size", parseSize("0") === null, parseSize("0"));
  check("parseList returns [] for blank text", parseList("   ").length === 0, null);
  const problems = [];
  const broken = parseList("[bad", undefined, problems);
  check("parseList reports unparsable JSON under the env source", broken.length === 0 && problems[0].source === "env" && problems[0].reason.length > 0, problems);
  const array = readEnv({ BEC_CONFIG_JSON: "[1]" });
  check("BEC_CONFIG_JSON holding an array is reported", array.configJson === null
    && array.problems[0].reason === "value is not a JSON object", array.problems);
  const invalid = readEnv({ BEC_CONFIG_JSON: "{bad" });
  check("BEC_CONFIG_JSON holding invalid JSON is reported", invalid.configJson === null
    && invalid.problems[0].source === "BEC_CONFIG_JSON" && invalid.problems[0].reason !== "value is not a JSON object", invalid.problems);
}

console.log("\ncoverage: log writer");

{
  const dir = tempDir();
  const blocker = join(dir, "file");
  writeFileSync(blocker, "");
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = join(blocker, "sub");
  let logger;
  try {
    logger = createLogger({ enabled: true }, { env: {} });
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }
  check("a logger with no home and an unusable tmpdir is off", logger.enabled === false && logger.path === null, logger);
}

{
  const dir = tempDir();
  const path = join(dir, "log.jsonl");
  const logger = createLogger({ enabled: true, path });
  logger.record({ findings: [{}], error: "line one\n  line two" });
  const rec = JSON.parse(readFileSync(path, "utf8"));
  check("a record without hook or decision logs nulls", rec.hook === null && rec.decision === null, rec);
  check("an empty finding logs null fields", show(rec.findings) === show([{ category: null, match: null, line: null }]), rec.findings);
  check("an error is logged on one line", rec.error === "line one line two", rec);
}

{
  const dir = tempDir();
  const path = join(dir, "plain.log");
  const logger = createLogger({ enabled: true, path, format: "plaintext" }, { hook: "h" });
  logger.record({ ts: "2026-01-01T00:00:00.000Z", summary: "given\n summary" });
  logger.record({ ts: "2026-01-01T00:00:00.000Z", counts: { dictionary: 2 }, error: "oops" });
  const lines = readFileSync(path, "utf8").trim().split("\n");
  check("a plaintext line uses the given summary", lines[0] === "2026-01-01T00:00:00.000Z h - - - given summary", lines);
  check("a plaintext summary lists dictionary counts and the error", lines[1].endsWith("dictionary=2 error=oops"), lines);
}

{
  const dir = tempDir();
  const logger = createLogger({ enabled: true, path: dir });
  let threw = false;
  try {
    logger.record({});
  } catch {
    threw = true;
  }
  check("a log path that cannot be appended to is skipped", logger.enabled && !threw, logger);
}

{
  const reason = softFailResult({ decision: "block", reason: "[concise] from reason" });
  const message = softFailResult({ decision: "block", systemMessage: "[concise] from message" });
  const empty = softFailResult({ decision: "block" });
  check("soft fail reads a block reason", reason.systemMessage === "[concise] soft-fail: from reason", reason);
  check("soft fail falls back to the systemMessage", message.systemMessage === "[concise] soft-fail: from message", message);
  check("soft fail with no text keeps the prefix", empty.systemMessage === "[concise] soft-fail:", empty);
}

console.log("\ncoverage: state");

{
  check("a missing session id uses the default session", statePath(undefined) === statePath("default"), statePath(undefined));
  const main = statePath("cov-scope");
  const transcript = withStateScope({ agent_transcript_path: "/t.jsonl" }, () => statePath("cov-scope"));
  check("a transcript path scopes the state file", transcript === join(dirname(main), `${sha("transcript:/t.jsonl")}.json`), transcript);
  const scoped = withStateScope({ agent_id: "a1" }, () => statePath("cov-scope"));
  check("an explicit agent id matches the agent scope", statePath("cov-scope", "a1") === scoped && scoped !== main, scoped);
}

{
  const sid = `cov-lib-state-${process.pid}`;
  const path = statePath(sid);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "[1]");
  check("a state file holding an array reads as empty", bumpAttempt(sid, "k") === 1, readFileSync(path, "utf8"));
  cleanupSession(sid);
}

{
  const sid = `cov-lib-blocked-${process.pid}`;
  const sessionDir = dirname(statePath(sid));
  mkdirSync(dirname(sessionDir), { recursive: true });
  writeFileSync(sessionDir, "");
  try {
    check("a state write that fails leaves no state", bumpAttempt(sid, "k") === 1 && once(sid, "x") && once(sid, "x"), null);
  } finally {
    rmSync(sessionDir, { force: true });
  }
}

{
  const sid = `cov-lib-cleanup-${process.pid}`;
  const sessionDir = dirname(statePath(sid));
  mkdirSync(join(sessionDir, `${"a".repeat(64)}.json`), { recursive: true });
  check("cleanup reports false when an entry cannot be removed", cleanupSession(sid) === false, null);
  rmSync(sessionDir, { recursive: true, force: true });
}

console.log("\ncoverage: respond, context, projects");

{
  const result = { a: 1 };
  check("mergeFlag without flag text returns the result", mergeFlag("", result) === result, null);
}

{
  const dir = tempDir();
  const entries = Array.from({ length: 11 }, (_, i) => ({ id: `w${i}`, match: "exact", value: `word${i}`, fix: "cut" }));
  withConfig(dir, { softFail: true, features: { aiWriting: { enabled: true, preset: "ste" }, dictionary: { entries } } });
  const text = contextText(loadConfig(dir, {}));
  check("context names the aiWriting preset", text.includes("aiWriting: confirm, preset ste;"), text);
  check("context caps the dictionary list at ten ids", text.includes("dictionary: confirm; 11 entries (w0, w1") && text.includes("w9, +1 more)."), text);
  check("context reports soft fail on", text.includes("Soft fail: on."), text);
}

{
  check("projectKey defaults to the process cwd", projectKey().cwd === realpathSync(process.cwd()), projectKey());
  check("a name with no letters or digits becomes project", projectName("/") === "project" && projectName("/tmp/___") === "project", null);
  check("listProjects without a registry dir is empty", listProjects({ XDG_CONFIG_HOME: join(tempDir(), "missing") }).length === 0, null);
}

console.log("\ncoverage: style messages");

{
  const emDash = [{ char: EM, line: 3, snippet: "a" }, { char: EN, line: 1, snippet: "b" }];
  const message = styleMessage({ emDash, aiWriting: [] }, null, EDIT);
  check("mixed dashes are counted by kind", message.includes("2 dashes (1 em, 1 en) on lines 1, 3 of the edit"), message);
  const aiWriting = ["one", "two", "three", "four", "five"].map((match, i) => ({ category: "filler", match, line: i + 1, fix: "cut" }));
  const many = styleMessage({ emDash: [], aiWriting }, "x");
  check("more than four distinct matches are summarized", many.includes("[concise:filler] 5 matches") && many.includes("; +1 more."), many);
  check("findings without a dictionary list fire no dictionary", firedAny({ emDash: [], aiWriting }).dictionary === false, null);
  const dictionary = [{ id: "d", match: "m", line: 1, fix: "f" }, { id: "d", match: "n", line: 2, fix: "f" }];
  check("two dictionary hits are plural", styleSummary({ emDash: [], aiWriting: [], dictionary }, null) === "2 dictionary matches", null);
}

console.log("\ncoverage: bypass matching");

{
  check("a null text in the list is treated as empty", bypassMatch(["x", null], { bypass: { phrases: ["zzz"] } }) === null, null);
  check("no config means no bypass", bypassMatch("anything", null) === null && bypassMatch("anything", {}) === null, null);
  check("a bypass pattern matches after an invalid one is skipped", bypassMatch("ship 42", { bypass: { patterns: ["(", "ship \\d+"] } }) === "ship \\d+", null);
  check("a bypass pattern that does not match returns null", bypassMatch("ship it", { bypass: { patterns: ["ship \\d+"] } }) === null, null);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
