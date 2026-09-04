#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ok, bad, summary } from "./lib.mjs";
import { loadConfig, defaultConfig } from "../hooks/lib/config.mjs";
import { readEnv, parseSize } from "../hooks/lib/env.mjs";

const dirs = [];
const show = (value) => JSON.stringify(value);

function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

function eq(name, actual, expected) {
  if (show(actual) === show(expected)) return ok(name);
  bad(name, `expected ${show(expected)}, got ${show(actual)}`);
}

function has(name, list, value) {
  if (Array.isArray(list) && list.includes(value)) return ok(name);
  bad(name, `expected ${show(value)} in ${show(list)}`);
}

const ai = (config) => config.features.aiWriting;

console.log("config: env parsing");

{
  const env = {
    BEC_CONFIG_JSON: '{"maxRetries":4}',
    BEC_CONFIG_PATH: "/tmp/x.json",
    BEC_FEATURE_ENABLE: "aiWriting, emDash",
    BEC_FEATURE_DISABLE: "comments",
    BEC_FEATURE_ALWAYS_ENABLE: "prBody",
    BEC_FEATURE_ALWAYS_DISABLE: "fileSize",
    BEC_ENABLE_PATTERNS: "vocabulary,tag:git",
    BEC_DISABLE_PATTERNS: "chatbot",
    BEC_ALWAYS_ENABLE_PATTERNS: "filler",
    BEC_ALWAYS_DISABLE_PATTERNS: "closers",
    BEC_LOAD_LIB_PATHS: ["/a", "/b"].join(delimiter),
    BEC_HOOK_SOFT_FAIL: "YES",
    BEC_DISABLE_STOP_HOOK: "off",
    BEC_LOG_ENABLED: "1",
    BEC_LOG_PATH: "/tmp/c.log",
    BEC_LOG_MAX_SIZE: "5m",
    BEC_LOG_MAX_FILES: "3",
    BEC_LOG_ROTATE: "Daily",
    BEC_LOG_USE_JSON: "true",
    BEC_LOG_USE_PLAINTEXT: "true",
    BEC_ALLOW_PHRASES: '["one phrase","two"]',
    BEC_ALLOW_PATTERNS: "a.b,c",
    BEC_BYPASS_PHRASES: "hand written",
    BEC_BYPASS_PATTERNS: "^ok$",
  };
  const vars = readEnv(env);
  eq("BEC_CONFIG_JSON parses to an object", vars.configJson, { maxRetries: 4 });
  eq("BEC_CONFIG_PATH kept as a path", vars.configPath, "/tmp/x.json");
  eq("BEC_FEATURE_ENABLE splits on commas", vars.featureEnable, ["aiWriting", "emDash"]);
  eq("BEC_FEATURE_DISABLE parses", vars.featureDisable, ["comments"]);
  eq("BEC_FEATURE_ALWAYS_ENABLE parses", vars.alwaysEnableFeatures, ["prBody"]);
  eq("BEC_FEATURE_ALWAYS_DISABLE parses", vars.alwaysDisableFeatures, ["fileSize"]);
  eq("BEC_ENABLE_PATTERNS keeps tag ids", vars.enablePatterns, ["vocabulary", "tag:git"]);
  eq("BEC_DISABLE_PATTERNS parses", vars.disablePatterns, ["chatbot"]);
  eq("BEC_ALWAYS_ENABLE_PATTERNS parses", vars.alwaysEnablePatterns, ["filler"]);
  eq("BEC_ALWAYS_DISABLE_PATTERNS parses", vars.alwaysDisablePatterns, ["closers"]);
  eq("BEC_LOAD_LIB_PATHS splits on the path delimiter", vars.loadLibPaths, ["/a", "/b"]);
  eq("BEC_HOOK_SOFT_FAIL reads yes as true", vars.softFail, true);
  eq("BEC_DISABLE_STOP_HOOK reads off as false", vars.disableStopHook, false);
  eq("BEC_LOG_ENABLED reads 1 as true", vars.log.enabled, true);
  eq("BEC_LOG_PATH kept", vars.log.path, "/tmp/c.log");
  eq("BEC_LOG_MAX_SIZE kept as written", vars.log.maxSize, "5m");
  eq("BEC_LOG_MAX_FILES parses to a number", vars.log.maxFiles, 3);
  eq("BEC_LOG_ROTATE lowercased", vars.log.rotate, "daily");
  eq("BEC_LOG_USE_JSON parses", vars.log.useJson, true);
  eq("BEC_LOG_USE_PLAINTEXT parses", vars.log.usePlaintext, true);
  eq("BEC_ALLOW_PHRASES reads a JSON array", vars.allowPhrases, ["one phrase", "two"]);
  eq("BEC_ALLOW_PATTERNS reads a comma list", vars.allowPatterns, ["a.b", "c"]);
  eq("BEC_BYPASS_PHRASES parses", vars.bypassPhrases, ["hand written"]);
  eq("BEC_BYPASS_PATTERNS parses", vars.bypassPatterns, ["^ok$"]);
  eq("an unset variable reads as null", readEnv({}).softFail, null);
  eq("an empty boolean reads as false", readEnv({ BEC_LOG_ENABLED: "" }).log.enabled, false);
  eq("parseSize reads a suffix", parseSize("5m"), 5 * 1024 * 1024);
  eq("parseSize reads plain bytes", parseSize("2048"), 2048);
  eq("parseSize rejects a word", parseSize("big"), null);
}

console.log("\nconfig: layers");

{
  const home = temp("concise-home-");
  const xdg = temp("concise-xdg-");
  const project = temp("concise-proj-");
  writeJson(join(home, ".config", "concise", "concise.json"), { maxCommentLines: 8, maxPrBodyParagraphs: 7 });
  writeJson(join(xdg, "concise", "concise.json"), { maxCommentLines: 5 });
  writeJson(join(project, ".claude", "concise.json"), { maxFileLines: 120 });
  const env = {
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    BEC_CONFIG_JSON: '{"maxPrBodySentences":9,"maxFileLines":900}',
    BEC_HOOK_SOFT_FAIL: "1",
  };
  const config = loadConfig(project, env);
  eq("defaults survive", config.maxRetries, 2);
  eq("BEC_CONFIG_JSON applies", config.maxPrBodySentences, 9);
  eq("the user config beats BEC_CONFIG_JSON", config.maxCommentLines, 5);
  eq("only the first user config file is read", config.maxPrBodyParagraphs, 1);
  eq("the project config beats BEC_CONFIG_JSON", config.maxFileLines, 120);
  eq("env overrides set softFail", config.softFail, true);
  eq("no problems on clean layers", config.problems, []);

  const pinned = writeJson(join(project, "other.json"), { maxFileLines: 55 });
  eq("BEC_CONFIG_PATH replaces the project file", loadConfig(project, { ...env, BEC_CONFIG_PATH: pinned }).maxFileLines, 55);
  eq("loadConfig with one argument still reads the project file", loadConfig(project).maxFileLines, 120);
}

console.log("\nconfig: features and patterns");

{
  const project = temp("concise-feat-");
  writeJson(join(project, ".claude", "concise.json"), { features: { aiWriting: { enabled: true } } });
  const off = loadConfig(project, { BEC_FEATURE_ALWAYS_DISABLE: "aiWriting" });
  eq("BEC_FEATURE_ALWAYS_DISABLE beats the project config", ai(off).enabled, false);

  const project2 = temp("concise-feat2-");
  writeJson(join(project2, ".claude", "concise.json"), { features: { aiWriting: { enabled: false } } });
  const on = loadConfig(project2, { BEC_FEATURE_ENABLE: "aiWriting" });
  eq("BEC_FEATURE_ENABLE loses to the project config", ai(on).enabled, false);

  const checks = loadConfig(temp("concise-chk-"), {
    BEC_FEATURE_DISABLE: "comments,fileSize",
    BEC_FEATURE_ALWAYS_DISABLE: "stopHook",
  });
  eq("feature ids map to checks", checks.checks, { comments: false, fileSize: false, prBody: true });
  eq("stopHook maps to the top level", checks.stopHook, false);
  eq("BEC_DISABLE_STOP_HOOK turns the stop hook off", loadConfig(".", { BEC_DISABLE_STOP_HOOK: "1" }).stopHook, false);
}

{
  const project = temp("concise-pat-");
  writeJson(join(project, ".claude", "concise.json"), {
    features: { aiWriting: { enablePatterns: ["chatbot", "twice"], disablePatterns: ["vocabulary", "twice"] } },
  });
  const env = {
    BEC_CONFIG_JSON: '{"features":{"aiWriting":{"enablePatterns":["vocabulary","filler"],"disablePatterns":["chatbot"]}}}',
  };
  const config = loadConfig(project, env);
  eq("a higher enable clears a lower disable", ai(config).enablePatterns, ["filler", "chatbot"]);
  eq("a higher disable clears a lower enable", ai(config).disablePatterns, ["vocabulary", "twice"]);

  const always = loadConfig(project, { ...env, BEC_ALWAYS_DISABLE_PATTERNS: "chatbot" });
  eq("BEC_ALWAYS_DISABLE_PATTERNS beats the project enable", ai(always).enablePatterns, ["filler"]);
  has("BEC_ALWAYS_DISABLE_PATTERNS lands in disablePatterns", ai(always).disablePatterns, "chatbot");

  const baseline = loadConfig(temp("concise-pat2-"), { BEC_ENABLE_PATTERNS: "tag:git", BEC_DISABLE_PATTERNS: "closers" });
  eq("BEC_ENABLE_PATTERNS reaches aiWriting", ai(baseline).enablePatterns, ["tag:git"]);
  eq("BEC_DISABLE_PATTERNS reaches aiWriting", ai(baseline).disablePatterns, ["closers"]);
}

console.log("\nconfig: lists and problems");

{
  const project = temp("concise-list-");
  writeJson(join(project, ".claude", "concise.json"), {
    ignoreGlobs: ["**/only/**"],
    styleIgnoreGlobs: ["**/docs/**"],
    allowList: { phrases: ["from file"] },
    bypass: { patterns: ["^skip"] },
    features: { aiWriting: { allow: ["robust"], packs: ["./packs"], excludePacks: ["ste"], options: { rare: { minWords: 50 } } } },
  });
  const env = {
    BEC_LOAD_LIB_PATHS: "/env/pack",
    BEC_ALLOW_PHRASES: "from env",
    BEC_BYPASS_PATTERNS: "^also",
    BEC_CONFIG_JSON: '{"features":{"aiWriting":{"allow":["seamless"],"options":{"rare":{"minRatio":0.4}}}}}',
  };
  const config = loadConfig(project, env);
  eq("ignoreGlobs is replaced", config.ignoreGlobs, ["**/only/**"]);
  has("styleIgnoreGlobs keeps the default entries", config.styleIgnoreGlobs, "**/.claude/**");
  has("styleIgnoreGlobs keeps CLAUDE.md", config.styleIgnoreGlobs, "**/CLAUDE.md");
  has("styleIgnoreGlobs unions the project entry", config.styleIgnoreGlobs, "**/docs/**");
  eq("allow is unioned across layers", ai(config).allow, ["seamless", "robust"]);
  eq("packs union BEC_LOAD_LIB_PATHS with the project list", ai(config).packs, ["/env/pack", "./packs"]);
  eq("excludePacks carries over", ai(config).excludePacks, ["ste"]);
  eq("options merge per pack id", ai(config).options, { rare: { minRatio: 0.4, minWords: 50 } });
  eq("allowList phrases union", config.allowList.phrases, ["from file", "from env"]);
  eq("bypass patterns union", config.bypass.patterns, ["^skip", "^also"]);
  eq("styleIgnoreGlobs default holds 28 globs", defaultConfig().styleIgnoreGlobs.length, 28);
  eq("log defaults", defaultConfig().log, { enabled: false, path: null, maxSize: "5m", maxFiles: 5, rotate: "size", format: "json" });
}

{
  const project = temp("concise-bad-");
  const path = writeJson(join(project, ".claude", "concise.json"), "{ not json");
  const config = loadConfig(project, { BEC_CONFIG_JSON: "{oops", BEC_LOG_USE_JSON: "1", BEC_LOG_USE_PLAINTEXT: "1" });
  eq("a bad project file leaves the defaults", config.maxFileLines, 300);
  eq("both bad layers are recorded", config.problems.map((problem) => problem.source), ["BEC_CONFIG_JSON", path]);
  eq("every problem carries a reason", config.problems.every((problem) => Boolean(problem.reason)), true);
  eq("plaintext wins over json", config.log.format, "plaintext");
}

{
  const example = JSON.parse(readFileSync(new URL("../.claude/concise.json.example", import.meta.url), "utf8"));
  const defaults = defaultConfig();
  const drift = Object.keys(example).filter((key) => show(example[key]) !== show(defaults[key]));
  eq("the example config matches the defaults", drift, []);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
