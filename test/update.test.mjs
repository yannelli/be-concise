import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hubPath, monitorPath } from "../plugins/concise/hooks/lib/monitor.mjs";
import { pluginVersion } from "../plugins/concise/web/packs.mjs";
import { update } from "../plugins/concise/web/update.mjs";

const CHECKOUT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const VERSION = pluginVersion();
const NEXT = VERSION.replace(/^(\d+)\./, (_, major) => `${Number(major) + 1}.`);
const DEAD_PID = 2147483000;

const npm = `#!/bin/sh
echo "npm $*" >> "$LOG"
case "$1" in
  view) [ -n "$NPM_VIEW" ] && { echo "$NPM_VIEW"; exit 0; }; echo "npm error 404 Not Found" >&2; exit 1;;
  install) [ "$NPM_INSTALL" = ok ] && exit 0; echo "npm error EACCES" >&2; exit 1;;
esac
`;
const host = `#!/bin/sh
name=\${0##*/}
echo "$name $*" >> "$LOG"
eval "mode=\\$HOST_$name"
case "$2" in
  list) [ "$mode" = absent ] && { echo "No plugins installed"; exit 0; }; echo "  concise@be-concise (0.1.0) (user)"; exit 0;;
  marketplace) [ "$mode" = refresh-fail ] && { echo "Error: marketplace is not a Git marketplace" >&2; exit 1; }; exit 0;;
  *) [ "$mode" = update-fail ] && { echo "Error: plugin is not installed at user scope" >&2; exit 1; }; [ "$mode" = quiet ] && exit 0; echo "Updated to 9.9.9"; exit 0;;
esac
`;
const systemctl = `#!/bin/sh
echo "systemctl $*" >> "$LOG"
case "$2" in
  whoami) [ -n "$UNIT" ] || { echo "No unit" >&2; exit 1; }; echo "$UNIT";;
  show) echo "$MAINPID";;
  restart) [ "$RESTART" = fail ] && { echo "Unit be-concise.service not found." >&2; exit 1; }; exit 0;;
esac
`;

async function fixture(t, tools = { npm, claude: host, codex: host, omp: host, systemctl }) {
  const root = await mkdtemp(join(tmpdir(), "concise-update-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  const pkg = join(root, "package");
  await Promise.all([mkdir(bin), mkdir(pkg)]);
  await Promise.all(Object.entries(tools).map(([name, body]) => writeFile(join(bin, name), body, { mode: 0o755 })));
  const env = { PATH: bin, LOG: join(root, "log"), XDG_CACHE_HOME: join(root, "cache"), HOME: join(root, "home") };
  const lines = [];
  const call = async (extra = {}, options = {}) => {
    lines.length = 0;
    await rm(env.LOG, { force: true });
    const ok = await update({ env: { ...env, ...extra }, root: pkg, write: (line) => lines.push(line), ...options });
    const log = await readFile(env.LOG, "utf8").catch(() => "");
    return { ok, lines: [...lines], log: log.trim().split("\n").filter(Boolean) };
  };
  const register = async (path, entry) => {
    await mkdir(join(root, "cache", "concise", "monitor"), { recursive: true });
    await writeFile(path, typeof entry === "string" ? entry : JSON.stringify(entry));
  };
  return { root, env, call, register };
}

test("package step skips a git checkout and reports npm failures", async (t) => {
  const space = await fixture(t, {});
  const lines = [];
  assert.equal(await update({ env: space.env, root: CHECKOUT, write: (line) => lines.push(line) }), true);
  assert.deepEqual(lines, [`Package: ${CHECKOUT} is a git checkout, skipped. Update it with git pull.`]);

  const missing = await space.call();
  assert.equal(missing.ok, false);
  assert.match(missing.lines[0], /^Package: version check failed: spawn npm ENOENT$/);
});

test("package step checks, installs, and reports the npm result", async (t) => {
  const space = await fixture(t, { npm });
  const notFound = await space.call();
  assert.equal(notFound.ok, false);
  assert.deepEqual(notFound.lines, ["Package: version check failed: npm error 404 Not Found"]);

  const garbled = await space.call({ NPM_VIEW: "latest" });
  assert.deepEqual(garbled.lines, ["Package: version check failed: latest"]);

  const current = await space.call({ NPM_VIEW: VERSION });
  assert.equal(current.ok, true);
  assert.deepEqual(current.lines, [`Package: @yannelli/be-concise ${VERSION} is current.`]);
  assert.deepEqual(current.log, ["npm view @yannelli/be-concise version"]);

  const available = await space.call({ NPM_VIEW: NEXT }, { check: true });
  assert.deepEqual(available.lines, [`Package: @yannelli/be-concise ${VERSION} -> ${NEXT} is available.`]);
  assert.deepEqual(available.log, ["npm view @yannelli/be-concise version"]);

  const denied = await space.call({ NPM_VIEW: NEXT });
  assert.equal(denied.ok, false);
  assert.deepEqual(denied.lines, ["Package: npm install failed: npm error EACCES"]);

  const installed = await space.call({ NPM_VIEW: NEXT, NPM_INSTALL: "ok" });
  assert.equal(installed.ok, true);
  assert.deepEqual(installed.lines, [`Package: updated @yannelli/be-concise ${VERSION} -> ${NEXT}.`]);
  assert.equal(installed.log.at(-1), `npm install -g @yannelli/be-concise@${NEXT}`);
});

test("host step updates installed plugins and reports skips and failures", async (t) => {
  const space = await fixture(t);
  const base = { NPM_VIEW: VERSION };
  const result = await space.call({ ...base, HOST_claude: "ok", HOST_codex: "refresh-fail", HOST_omp: "update-fail" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.lines.slice(1), [
    "claude: Updated to 9.9.9",
    "codex: skipped, Error: marketplace is not a Git marketplace",
    "omp: update failed: Error: plugin is not installed at user scope",
    "Start new agent sessions to load the plugin. Codex asks you to trust changed hooks again.",
  ]);
  assert.deepEqual(result.log.slice(1), [
    "claude plugin list", "claude plugin marketplace update be-concise", "claude plugin update concise@be-concise",
    "codex plugin list", "codex plugin marketplace upgrade be-concise",
    "omp plugin list", "omp plugin marketplace update be-concise", "omp plugin upgrade concise@be-concise",
  ]);

  const quiet = await space.call({ ...base, HOST_claude: "absent", HOST_codex: "quiet", HOST_omp: "absent" });
  assert.equal(quiet.ok, true);
  assert.deepEqual(quiet.lines.slice(1), ["codex: updated concise@be-concise", "Start new agent sessions to load the plugin. Codex asks you to trust changed hooks again."]);
  assert.equal(quiet.log.includes("codex plugin add concise@be-concise"), true);

  const check = await space.call({ ...base, HOST_claude: "absent", HOST_omp: "update-fail" }, { check: true });
  assert.equal(check.ok, true);
  assert.deepEqual(check.lines.slice(1), [
    "codex: concise@be-concise is installed. Run without --check to update it.",
    "omp: concise@be-concise is installed. Run without --check to update it.",
  ]);
  assert.deepEqual(check.log.slice(1), ["claude plugin list", "codex plugin list", "omp plugin list"]);

  const none = await space.call({ ...base, HOST_claude: "absent", HOST_codex: "absent", HOST_omp: "absent" });
  assert.deepEqual(none.lines.slice(1), []);
});

test("console step restarts the systemd unit whose main process runs another version", async (t) => {
  const space = await fixture(t, { npm, systemctl });
  const base = { NPM_VIEW: VERSION };
  const none = await space.call(base);
  assert.deepEqual(none.lines.slice(1), []);

  const hub = hubPath(space.env);
  await space.register(hub, { url: "http://127.0.0.1:14373", token: "t", pid: process.pid });
  await space.register(monitorPath(space.root, space.env), { url: "http://127.0.0.1:1", token: "t", pid: process.pid, version: VERSION });
  await space.register(join(hub, "..", "dead.json"), { url: "http://127.0.0.1:2", pid: DEAD_PID });
  await space.register(join(hub, "..", "bad-pid.json"), { url: "http://127.0.0.1:3", pid: "1" });
  await space.register(join(hub, "..", "broken.json"), "{");
  const label = `Console http://127.0.0.1:14373 (pid ${process.pid}, version unknown)`;
  const unit = { UNIT: "be-concise.service", MAINPID: String(process.pid) };

  const manual = await space.call(base);
  assert.equal(manual.ok, true);
  assert.deepEqual(manual.lines.slice(1), [`${label}: stop it and start concise-web again to load ${VERSION}.`]);
  assert.deepEqual(manual.log.slice(1), [`systemctl --user whoami ${process.pid}`]);

  const scope = await space.call({ ...base, UNIT: "session-1.scope" });
  assert.deepEqual(scope.lines.slice(1), [`${label}: stop it and start concise-web again to load ${VERSION}.`]);

  const child = await space.call({ ...base, UNIT: "paseo.service", MAINPID: "1" });
  assert.deepEqual(child.lines.slice(1), [`${label}: stop it and start concise-web again to load ${VERSION}.`]);
  assert.equal(child.log.at(-1), "systemctl --user show -p MainPID --value paseo.service");

  const check = await space.call({ ...base, ...unit }, { check: true });
  assert.deepEqual(check.lines.slice(1), [`${label}: be-concise.service would restart.`]);
  assert.equal(check.log.some((line) => line.includes("restart")), false);

  const restarted = await space.call({ ...base, ...unit });
  assert.equal(restarted.ok, true);
  assert.deepEqual(restarted.lines.slice(1), [`${label}: restarted be-concise.service.`]);
  assert.equal(restarted.log.at(-1), "systemctl --user restart be-concise.service");

  const failed = await space.call({ ...base, ...unit, RESTART: "fail" });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.lines.slice(1), [`${label}: restart of be-concise.service failed: Unit be-concise.service not found.`]);

  const updated = await space.call({ NPM_VIEW: NEXT, NPM_INSTALL: "ok", ...unit });
  assert.deepEqual(updated.lines.slice(1).sort(), [
    `Console http://127.0.0.1:1 (pid ${process.pid}, version ${VERSION}): restarted be-concise.service.`,
    `${label}: restarted be-concise.service.`,
  ].sort());
});
