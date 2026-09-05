import { closeSync, mkdirSync, openSync, readSync, statSync, truncateSync, watch } from "node:fs";
import { dirname } from "node:path";
import { listProjects, projectsDir } from "../hooks/lib/projects.mjs";
import { problem } from "./configuration.mjs";

const POLL_MS = 5000;
const DEBOUNCE_MS = 50;
const KEY = /^[0-9a-f]{64}$/;

function readRange(path, start, end) {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(end - start);
    readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function sizeOf(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Follows every registered project's record file and hands each new record to publish. */
export function createHub(env, { retained, publish }) {
  const dir = projectsDir(env);
  if (!dir) throw problem("The hub needs HOME or XDG_CONFIG_HOME to find registered projects", 500);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const projects = new Map();
  let timer = null;
  let closed = false;

  const withProject = (record, entry) => ({ ...record, project: entry.key, projectName: entry.name });

  function emit(project, text) {
    const lines = (project.partial + text).split("\n");
    project.partial = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        publish(withProject(JSON.parse(line), project.entry));
      } catch {}
    }
  }

  function load(project) {
    const size = sizeOf(project.entry.records);
    project.offset = size;
    if (size === 0) return;
    const lines = readRange(project.entry.records, 0, size).split("\n");
    project.partial = lines.pop();
    const parsed = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < retained; i -= 1) {
      try {
        parsed.push(JSON.parse(lines[i]));
      } catch {}
    }
    for (const record of parsed.reverse()) publish(withProject(record, project.entry));
  }

  function tail(project) {
    const size = sizeOf(project.entry.records);
    if (size < project.offset) {
      project.offset = 0;
      project.partial = "";
    }
    if (size === project.offset) return;
    const text = readRange(project.entry.records, project.offset, size);
    project.offset = size;
    emit(project, text);
  }

  function watchDir(path) {
    try {
      const watcher = watch(path, schedule);
      watcher.on("error", () => {});
      return watcher;
    } catch {
      return null;
    }
  }

  function scan() {
    if (closed) return;
    for (const entry of listProjects(env)) {
      let project = projects.get(entry.key);
      if (!project) {
        project = { entry, offset: 0, partial: "", watcher: null };
        projects.set(entry.key, project);
        load(project);
      } else project.entry = entry;
      project.watcher ||= watchDir(dirname(entry.records));
      tail(project);
    }
  }

  function schedule() {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      scan();
    }, DEBOUNCE_MS);
  }

  const registry = watchDir(dir);
  const poll = setInterval(scan, POLL_MS);
  poll.unref();
  scan();

  return {
    dir,
    size: () => projects.size,
    list: () => [...projects.values()]
      .map(({ entry }) => ({ key: entry.key, name: entry.name, cwd: entry.cwd, lastSeen: entry.lastSeen }))
      .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))),
    resolve(key) {
      if (key == null) return null;
      if (!KEY.test(key) || !projects.has(key)) throw problem("Unknown project", 404);
      const { entry } = projects.get(key);
      return { key: entry.key, name: entry.name, cwd: entry.cwd };
    },
    clear(key) {
      const targets = key ? [projects.get(key)].filter(Boolean) : [...projects.values()];
      for (const project of targets) {
        try {
          truncateSync(project.entry.records, 0);
        } catch {}
        project.offset = 0;
        project.partial = "";
      }
    },
    close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(poll);
      registry?.close();
      for (const project of projects.values()) project.watcher?.close();
    },
  };
}
