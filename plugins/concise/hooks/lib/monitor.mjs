import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { parseBool } from "./env.mjs";
import { projectKey, registerProject, appendProjectRecord } from "./projects.mjs";

function monitorDir(env) {
  const home = env.HOME || env.USERPROFILE;
  const cache = env.XDG_CACHE_HOME || (home ? join(home, ".cache") : null);
  const base = cache
    ? join(cache, "concise")
    : join(tmpdir(), `concise-${process.getuid ? process.getuid() : userInfo().username}`);
  return join(base, "monitor");
}

export function monitorPath(cwd, env = process.env) {
  return join(monitorDir(env), `${projectKey(cwd).key}.json`);
}

/** The registry of the console that serves every project. */
export function hubPath(env = process.env) {
  return join(monitorDir(env), "hub.json");
}

/** Registers the project and appends the record to its file, unless persistence is off. */
function persistRecord(record, env, persist) {
  try {
    if (typeof record.cwd !== "string") return;
    registerProject(record.cwd, env);
    if (persist ?? parseBool(env.BEC_MONITOR_PERSIST) ?? true) appendProjectRecord(record, env);
  } catch {}
}

export async function publishMonitor(record, options = {}) {
  const env = options.env || process.env;
  if (env.BEC_MONITOR_DISABLED === "1") return;
  persistRecord(record, env, options.persist);
  try {
    const registry = JSON.parse(await readFile(monitorPath(record.cwd, env), "utf8"));
    const endpoint = new URL(registry.url);
    if (endpoint.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(endpoint.hostname)) return;
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/") return;
    if (typeof registry.token !== "string" || !registry.token) return;
    endpoint.pathname = "/api/ingest";
    const body = JSON.stringify(record);
    await new Promise((resolve) => {
      const req = request(endpoint, {
        method: "POST",
        agent: false,
        headers: {
          authorization: `Bearer ${registry.token}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      });
      const timer = setTimeout(() => req.destroy(), 150);
      req.on("error", () => {});
      req.on("response", (response) => {
        response.on("error", () => {});
        response.resume();
      });
      req.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
      req.end(body);
    });
  } catch {}
}
