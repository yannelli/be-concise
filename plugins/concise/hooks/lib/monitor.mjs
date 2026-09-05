import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";

export function monitorPath(cwd, env = process.env) {
  let project = resolve(cwd || process.cwd());
  try {
    project = realpathSync(project);
  } catch {}
  const key = createHash("sha256").update(project).digest("hex");
  const home = env.HOME || env.USERPROFILE;
  const cache = env.XDG_CACHE_HOME || (home ? join(home, ".cache") : null);
  const base = cache
    ? join(cache, "concise")
    : join(tmpdir(), `concise-${process.getuid ? process.getuid() : userInfo().username}`);
  return join(base, "monitor", `${key}.json`);
}

export async function publishMonitor(record, options = {}) {
  try {
    const env = options.env || process.env;
    if (env.BEC_MONITOR_DISABLED === "1") return;
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
