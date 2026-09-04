#!/usr/bin/env node
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ok, bad, summary } from "./lib.mjs";
import { createLogger, softFailResult } from "../hooks/lib/log.mjs";
import { deny, ask } from "../hooks/lib/respond.mjs";

const dirs = [];
const show = (value) => JSON.stringify(value);

function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function eq(name, actual, expected) {
  if (show(actual) === show(expected)) return ok(name);
  bad(name, `expected ${show(expected)}, got ${show(actual)}`);
}

function truthy(name, value, detail) {
  if (value) return ok(name);
  bad(name, detail || `expected a truthy value, got ${show(value)}`);
}

const lines = (path) => readFileSync(path, "utf8").trim().split("\n");
const entry = (extra = {}) => ({
  event: "PreToolUse",
  tool: "Write",
  session: "s1",
  cwd: "/work",
  key: "style:a.md",
  scope: "files",
  decision: "deny",
  mode: "confirm",
  counts: { emDash: 1, aiWriting: 2 },
  durationMs: 12,
  ...extra,
});

console.log("log: records");

{
  const dir = temp("concise-log-");
  const path = join(dir, "concise.log");
  const logger = createLogger({ enabled: true, path, rotate: "none" }, { hook: "check-edit" });
  logger.record(entry({ findings: [{ category: "filler", match: "very\nlong", line: 3 }] }));
  const record = JSON.parse(lines(path)[0]);
  eq("hook comes from the logger options", record.hook, "check-edit");
  eq("the decision is written", record.decision, "deny");
  eq("counts are written", record.counts, { emDash: 1, aiWriting: 2 });
  eq("a finding keeps category, match, line", record.findings, [{ category: "filler", match: "very long", line: 3 }]);
  eq("softFail defaults to false", record.softFail, false);
  eq("error defaults to null", record.error, null);
  truthy("ts is filled in", /^\d{4}-\d{2}-\d{2}T/.test(record.ts), record.ts);
  eq("every field is present", Object.keys(record).length, 15);
}

{
  const dir = temp("concise-log-cap-");
  const path = join(dir, "concise.log");
  const logger = createLogger({ enabled: true, path, rotate: "none" }, { hook: "check-reply" });
  const findings = Array.from({ length: 25 }, (item, index) => ({ category: "filler", match: `m${index}`, line: index }));
  logger.record(entry({ findings }));
  eq("findings are capped at 20", JSON.parse(lines(path)[0]).findings.length, 20);
}

{
  const dir = temp("concise-log-txt-");
  const path = join(dir, "concise.log");
  const logger = createLogger({ enabled: true, path, format: "plaintext", rotate: "none" }, { hook: "check-bash" });
  logger.record(entry({ ts: "2026-01-02T03:04:05.000Z", tool: "Bash", decision: "ask", key: "pr:1" }));
  logger.record({ ts: "2026-01-02T03:04:06.000Z", decision: "allow" });
  const written = lines(path);
  eq("plaintext holds the six cells", written[0], "2026-01-02T03:04:05.000Z check-bash Bash ask pr:1 emDash=1 aiWriting=2");
  eq("plaintext fills empty cells", written[1], "2026-01-02T03:04:06.000Z check-bash - allow -");
}

{
  const dir = temp("concise-log-off-");
  const path = join(dir, "concise.log");
  const logger = createLogger({ enabled: false, path }, { hook: "check-edit" });
  logger.record(entry());
  eq("a disabled logger reports enabled false", logger.enabled, false);
  eq("a disabled logger writes nothing", readdirSync(dir), []);
}

console.log("\nlog: paths and rotation");

{
  const home = temp("concise-log-home-");
  const logger = createLogger({ enabled: true }, { hook: "check-edit", env: { HOME: home } });
  eq("the default path sits under the cache dir", logger.path, join(home, ".cache", "concise", "concise.log"));
  const fallback = createLogger({ enabled: true }, { hook: "check-edit", env: {} });
  eq("a missing home falls back to the temp dir", fallback.path, join(tmpdir(), "concise", "concise.log"));
}

{
  const dir = temp("concise-log-rot-");
  const path = join(dir, "concise.log");
  const logger = createLogger({ enabled: true, path, maxSize: "1", maxFiles: 2, rotate: "size" }, { hook: "check-edit" });
  for (let i = 0; i < 4; i += 1) logger.record(entry({ key: `k${i}` }));
  const names = readdirSync(dir).sort();
  eq("size rotation keeps the current file plus maxFiles", names, ["concise.log", "concise.log.1", "concise.log.2"]);
  eq("the newest rotated file holds the previous record", JSON.parse(lines(`${path}.1`)[0]).key, "k2");
  eq("the current file holds the last record", JSON.parse(lines(path)[0]).key, "k3");
}

{
  const dir = temp("concise-log-day-");
  const path = join(dir, "concise.log");
  const logger = createLogger({ enabled: true, path, maxFiles: 2, rotate: "daily" }, { hook: "check-edit" });
  logger.record(entry({ ts: "2026-01-01T10:00:00.000Z" }));
  logger.record(entry({ ts: "2026-01-02T10:00:00.000Z" }));
  eq("daily writes a dated file", readdirSync(dir).sort(), ["concise.2026-01-01.log", "concise.2026-01-02.log"]);
  logger.record(entry({ ts: "2026-01-03T10:00:00.000Z" }));
  eq("daily keeps maxFiles newest", readdirSync(dir).sort(), ["concise.2026-01-02.log", "concise.2026-01-03.log"]);
}

{
  const dir = temp("concise-log-both-");
  const path = join(dir, "concise.log");
  const logger = createLogger({ enabled: true, path, maxSize: "1", maxFiles: 2, rotate: "both" }, { hook: "check-edit" });
  logger.record(entry({ ts: "2026-02-01T10:00:00.000Z" }));
  logger.record(entry({ ts: "2026-02-01T11:00:00.000Z" }));
  eq("both rotates the dated file by size", readdirSync(dir).sort(), ["concise.2026-02-01.log", "concise.2026-02-01.log.1"]);
}

{
  const dir = temp("concise-log-bad-");
  const file = join(dir, "blocker");
  writeFileSync(file, "x");
  const logger = createLogger({ enabled: true, path: join(file, "concise.log") }, { hook: "check-edit" });
  logger.record(entry());
  eq("an unwritable path turns the logger off", logger.enabled, false);
}

console.log("\nlog: soft fail");

{
  const soft = softFailResult(deny("[concise] 5-line comment, keep it to 2."));
  eq("a deny loses its decision", soft.hookSpecificOutput.permissionDecision, undefined);
  eq("a deny becomes a flag", soft.systemMessage, "[concise] soft-fail: 5-line comment, keep it to 2.");
  eq("the flag also rides in additionalContext", soft.hookSpecificOutput.additionalContext, soft.systemMessage);
  eq("the payload stays a PreToolUse one", soft.hookSpecificOutput.hookEventName, "PreToolUse");

  const asked = softFailResult(ask("[concise] confirm this reply."));
  eq("an ask becomes a flag", asked.systemMessage, "[concise] soft-fail: confirm this reply.");

  const blocked = softFailResult({ decision: "block", reason: "[concise] the reply is long." });
  eq("a stop block becomes a system message", blocked, { systemMessage: "[concise] soft-fail: the reply is long." });

  eq("given text wins over the result", softFailResult(deny("x"), "own text").systemMessage, "[concise] soft-fail: own text");
  eq("an allow passes through", softFailResult({}), {});
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

const main = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === main) process.exit(summary());
