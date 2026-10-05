import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad, withConfig } from "./lib.mjs";
import { EM } from "./features-lib.mjs";
import { monitorPath, publishMonitor } from "../hooks/lib/monitor.mjs";
import { projectKey, recordsPath } from "../hooks/lib/projects.mjs";
import { completedOutput, filteredFeedback, filterSettings } from "../hooks/lib/test-filter.mjs";
import { compileRegexList, packWarnings, prepareStyle, styleDecisionForText, styleFindings, withPackWarnings } from "../hooks/lib/style-check.mjs";
import { cleanupSession } from "../hooks/lib/state.mjs";
import { loadConfig } from "../hooks/lib/config.mjs";

const LIB = (name) => pathToFileURL(join(ROOT, "hooks", "lib", name)).href;
const dirs = [];
const show = (value) => JSON.stringify(value).slice(0, 400);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual)));

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-io-"));
  dirs.push(dir);
  return dir;
}

function child(source) {
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`child exited ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

function fakeBin(name, body) {
  const bin = tempDir();
  writeFileSync(join(bin, name), `#!/bin/sh\ncat >/dev/null\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
  return bin;
}

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function thrown(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err.message;
  }
}

console.log("\ncoverage: processes without getuid");

{
  const out = child(`delete process.getuid;
const { statePath } = await import(${JSON.stringify(LIB("state.mjs"))});
const { monitorPath } = await import(${JSON.stringify(LIB("monitor.mjs"))});
console.log(JSON.stringify({ state: statePath("s"), monitor: monitorPath("/", {}) }));`);
  check("state falls back to a user root without getuid", out.state.includes(`${tmpdir()}/concise-state-user/`), out);
  check("the monitor falls back to the user name without getuid", out.monitor.startsWith(join(tmpdir(), `concise-${userInfo().username}`, "monitor")), out);
}

{
  const out = child(`import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
fs.opendirSync = () => ({ readSync() { throw Object.assign(new Error("read"), { code: "EIO" }); }, closeSync() { throw new Error("close"); } });
syncBuiltinESMExports();
const { cleanupSession } = await import(${JSON.stringify(LIB("state.mjs"))});
console.log(JSON.stringify(cleanupSession("cov-io-dir")));`);
  check("cleanup reports false when the directory cannot be read or closed", out === false, out);
}

console.log("\ncoverage: monitor");

{
  const home = tempDir();
  const cwd = tempDir();
  check("the monitor dir sits under HOME/.cache", monitorPath(cwd, { HOME: home }) === join(home, ".cache", "concise", "monitor", `${projectKey(cwd).key}.json`), null);
}

{
  const dir = tempDir();
  const blocker = join(dir, "file");
  writeFileSync(blocker, "");
  const env = { XDG_CONFIG_HOME: join(blocker, "config"), XDG_CACHE_HOME: join(dir, "cache"), XDG_STATE_HOME: join(dir, "state") };
  await publishMonitor({ cwd: 5 }, { env });
  await publishMonitor({ cwd: dir }, { env });
  check("a record that cannot be registered is dropped quietly", !existsSync(recordsPath(dir, env)), null);
}

{
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.url);
    req.resume();
    res.writeHead(200, { "content-length": "1000" });
    res.write("x");
    setTimeout(() => res.socket.destroy(), 10);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const dir = tempDir();
  const env = { XDG_CACHE_HOME: join(dir, "cache"), BEC_MONITOR_PERSIST: "0" };
  const registry = monitorPath(dir, env);
  mkdirSync(join(dir, "cache", "concise", "monitor"), { recursive: true });
  writeFileSync(registry, JSON.stringify({ url }));
  await publishMonitor({ cwd: dir }, { env });
  check("a registry without a token gets no request", seen.length === 0, seen);
  writeFileSync(registry, JSON.stringify({ url, token: "t" }));
  await publishMonitor({ cwd: dir }, { env });
  check("a response cut off mid-body still resolves", show(seen) === show(["/api/ingest"]), seen);
  await new Promise((resolve) => server.close(resolve));
}

console.log("\ncoverage: test filter");

{
  const input = { tool_name: "Bash", tool_input: { command: "pytest" } };
  const bash = fakeBin("bash", 'case "$FAKE_MODE" in\n  fail) echo boom >&2; exit 3;;\n  silent) exit 4;;\nesac\nexit 0');
  const path = `${bash}:${process.env.PATH}`;
  check("a failing settings call throws its stderr", withEnv({ PATH: path, FAKE_MODE: "fail" }, () => thrown(() => filterSettings(input))) === "boom", null);
  check("a silent failing settings call throws its exit code", withEnv({ PATH: path, FAKE_MODE: "silent" }, () => thrown(() => filterSettings(input))) === "Bash exited 4", null);
  check("empty settings output means no filter", withEnv({ PATH: path, FAKE_MODE: "" }, () => filterSettings(input)) === null, null);
  const missing = withEnv({ PATH: tempDir() }, () => thrown(() => filterSettings(input)));
  check("a missing bash throws the spawn error", /ENOENT/.test(missing || ""), missing);
}

{
  check("stderr follows output on a new line", completedOutput({ output: "out", exit_code: 0, stderr: "err" }).output === "out\nerr", null);
  check("stderr follows a newline-terminated output directly", completedOutput({ output: "out\n", exitCode: 1, stderr: "err" }).output === "out\nerr", null);
  check("stderr alone is the output when output is empty", completedOutput({ stdout: "", exitCode: 1, stderr: "err" }).output === "err", null);
}

{
  const settings = { runner: "js", pattern: "NOMATCH", failurePattern: "FAILZ", lines: 5, context: 0, tail: 0 };
  const feedbackDirs = [];
  const feedback = (output, extra = {}) => {
    const text = filteredFeedback({}, { output, exitCode: 0 }, { ...settings, ...extra });
    const match = /cat '([^']+)\/output\.log'/.exec(text);
    if (match) feedbackDirs.push(match[1]);
    return text;
  };
  const text = feedback("ok\nfine\n");
  check("no matched lines and no tail show nothing", text.endsWith("<cmd>\n"), text);
  const grep = fakeBin("grep", 'case "$FAKE_MODE" in\n  fail) echo bad grep >&2; exit 2;;\nesac\nexit 5');
  const path = `${grep}:${process.env.PATH}`;
  check("a grep error throws its stderr", withEnv({ PATH: path, FAKE_MODE: "fail" }, () => thrown(() => feedback("ok\n"))) === "bad grep", null);
  check("a silent grep error throws its exit code", withEnv({ PATH: path, FAKE_MODE: "" }, () => thrown(() => feedback("ok\n"))) === "grep exited 5", null);
  const missing = withEnv({ PATH: tempDir() }, () => thrown(() => feedback("ok\n")));
  check("a missing grep throws the spawn error", /ENOENT/.test(missing || ""), missing);
  for (const dir of feedbackDirs) rmSync(dir, { recursive: true, force: true });
}

console.log("\ncoverage: style checks");

{
  const sid = `cov-io-style-${process.pid}`;
  await prepareStyle(tempDir(), loadConfig(tempDir(), {}));
  check("an empty regex list compiles to nothing", compileRegexList(undefined, "x").length === 0, null);
  compileRegexList(["("], "allow list");
  compileRegexList(["("], "allow list");
  const warned = withPackWarnings({ systemMessage: "base" }, sid);
  check("a bad regex is warned once and appended to the message", warned.systemMessage.startsWith('base [concise] allow list pattern "(" ignored:')
    && warned.systemMessage.split("[concise]").length === 2, warned);
  check("the warning is not repeated in the session", packWarnings(sid).length === 0, null);
  cleanupSession(sid);
}

{
  const dir = tempDir();
  await prepareStyle(dir, loadConfig(dir, {}));
  const text = `One ${EM} two.\n`;
  check("a config without features finds nothing", styleFindings(text, "a.md", {}).emDash.length === 0, null);
  const bare = styleFindings(text, "a.md", { features: { emDash: { enabled: true } } });
  check("a config without lists or globs still scans", bare.emDash.length === 1, bare);
  const emptyAllow = styleFindings(text, "a.md", { features: { emDash: { enabled: true } }, allowList: {} });
  check("an empty allow list keeps every finding", emptyAllow.emDash.length === 1, emptyAllow);
  const sid = `cov-io-mode-${process.pid}`;
  const config = { features: { emDash: { enabled: true } }, maxRetries: 2 };
  const input = { session_id: sid };
  const first = styleDecisionForText(text, "style:cov", "your reply", input, config);
  const second = styleDecisionForText(text, "style:cov", "your reply", input, config);
  check("a feature without a mode uses confirm", first.hookSpecificOutput?.permissionDecision === "deny"
    && second.systemMessage?.includes("Kept after confirmation"), [first, second]);
  cleanupSession(sid);
}

{
  const dir = tempDir();
  mkdirSync(join(dir, ".claude", "concise", "patterns"), { recursive: true });
  writeFileSync(join(dir, ".claude", "concise", "patterns", "gap.mjs"), `export default {
  id: "gap",
  feature: "aiWriting",
  category: { id: "gap", label: "gap" },
  detect(text) {
    const at = text.indexOf("\\n\\n");
    return at === -1 ? [] : [{ index: at + 1, match: "gap", fix: "join" }];
  },
};
`);
  withConfig(dir, { features: { aiWriting: { enabled: true } } });
  const config = loadConfig(dir, {});
  await prepareStyle(dir, config);
  const found = styleFindings("First.\n\nSecond.\n", join(dir, "a.md"), config);
  check("a finding on an empty line is kept", found.aiWriting.some((hit) => hit.category === "gap" && hit.line === 2), found.aiWriting);
}

await prepareStyle(tempDir(), loadConfig(tempDir(), {}));
for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
