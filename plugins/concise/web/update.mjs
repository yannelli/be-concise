import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hubPath } from "../hooks/lib/monitor.mjs";
import { compareVersions, pluginVersion } from "./packs.mjs";

const PACKAGE = "@yannelli/be-concise";
const PLUGIN = "concise@be-concise";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const HOSTS = [
  { id: "claude", refresh: ["plugin", "marketplace", "update", "be-concise"], update: ["plugin", "update", PLUGIN] },
  { id: "codex", refresh: ["plugin", "marketplace", "upgrade", "be-concise"], update: ["plugin", "add", PLUGIN] },
  { id: "omp", refresh: ["plugin", "marketplace", "update", "be-concise"], update: ["plugin", "upgrade", PLUGIN] },
];

/** Runs a command to completion. A command that cannot start resolves with code null. */
function run(command, args, env) {
  return new Promise((done) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => done({ code: null, stdout, stderr: err.message }));
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

const lastLine = (result) => (result.stderr.trim() || result.stdout.trim()).split("\n").pop();

async function updatePackage({ env, check, root, write }) {
  const current = pluginVersion();
  if (existsSync(join(root, ".git"))) {
    write(`Package: ${root} is a git checkout, skipped. Update it with git pull.`);
    return { version: current, failed: false };
  }
  const view = await run("npm", ["view", PACKAGE, "version"], env);
  const latest = view.stdout.trim();
  if (view.code !== 0 || !/^\d+\.\d+\.\d+$/.test(latest)) {
    write(`Package: version check failed: ${lastLine(view) || "npm printed no version"}`);
    return { version: current, failed: true };
  }
  if (compareVersions(latest, current) <= 0) write(`Package: ${PACKAGE} ${current} is current.`);
  else if (check) write(`Package: ${PACKAGE} ${current} -> ${latest} is available.`);
  else {
    const install = await run("npm", ["install", "-g", `${PACKAGE}@${latest}`], env);
    if (install.code !== 0) {
      write(`Package: npm install failed: ${lastLine(install)}`);
      return { version: current, failed: true };
    }
    write(`Package: updated ${PACKAGE} ${current} -> ${latest}.`);
    return { version: latest, failed: false };
  }
  return { version: current, failed: false };
}

async function updateHosts({ env, check, write }) {
  let failed = false;
  let updated = false;
  for (const host of HOSTS) {
    const list = await run(host.id, ["plugin", "list"], env);
    if (list.code !== 0 || !list.stdout.includes(PLUGIN)) continue;
    if (check) {
      write(`${host.id}: ${PLUGIN} is installed. Run without --check to update it.`);
      continue;
    }
    const refresh = await run(host.id, host.refresh, env);
    if (refresh.code !== 0) {
      write(`${host.id}: skipped, ${lastLine(refresh)}`);
      continue;
    }
    const result = await run(host.id, host.update, env);
    if (result.code === 0) {
      updated = true;
      write(`${host.id}: ${lastLine(result) || `updated ${PLUGIN}`}`);
    } else {
      failed = true;
      write(`${host.id}: update failed: ${lastLine(result)}`);
    }
  }
  if (updated) write("Start new agent sessions to load the plugin. Codex asks you to trust changed hooks again.");
  return failed;
}

/** Returns the systemd user unit whose main process is pid, or null. */
async function serviceUnit(pid, env) {
  const who = await run("systemctl", ["--user", "whoami", String(pid)], env);
  const unit = who.stdout.trim();
  if (who.code !== 0 || !/^[\w@.-]+\.service$/.test(unit)) return null;
  const main = await run("systemctl", ["--user", "show", "-p", "MainPID", "--value", unit], env);
  return main.code === 0 && main.stdout.trim() === String(pid) ? unit : null;
}

async function restartConsoles({ env, check, version, write }) {
  const dir = dirname(hubPath(env));
  let names = [];
  try { names = readdirSync(dir).filter((name) => name.endsWith(".json")); } catch {}
  let failed = false;
  for (const name of names) {
    let entry;
    try { entry = JSON.parse(readFileSync(join(dir, name), "utf8")); } catch { continue; }
    if (!Number.isInteger(entry.pid) || entry.pid <= 0 || entry.version === version) continue;
    try { process.kill(entry.pid, 0); } catch { continue; }
    const label = `Console ${entry.url} (pid ${entry.pid}, version ${entry.version ?? "unknown"})`;
    const unit = await serviceUnit(entry.pid, env);
    if (!unit) write(`${label}: stop it and start concise-web again to load ${version}.`);
    else if (check) write(`${label}: ${unit} would restart.`);
    else {
      const restart = await run("systemctl", ["--user", "restart", unit], env);
      if (restart.code === 0) write(`${label}: restarted ${unit}.`);
      else {
        failed = true;
        write(`${label}: restart of ${unit} failed: ${lastLine(restart)}`);
      }
    }
  }
  return failed;
}

/** Updates the npm package and host plugins, then restarts consoles that run another version. */
export async function update({ env = process.env, check = false, root = ROOT, write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const pkg = await updatePackage({ env, check, root, write });
  const hosts = await updateHosts({ env, check, write });
  const consoles = await restartConsoles({ env, check, version: pkg.version, write });
  return !(pkg.failed || hosts || consoles);
}
