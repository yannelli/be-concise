import { spawn } from "node:child_process";

const LIMIT = 2 * 1024 * 1024;

export function runProcess(command, args, { input, cwd, env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const grouped = process.platform !== "win32";
    const child = spawn(command, args, { cwd, env, detached: grouped, stdio: ["pipe", "pipe", "pipe", "pipe"] });
    const buffers = [[], [], []];
    let size = 0;
    let error = null;
    const stop = (message) => {
      error ||= message;
      try {
        if (grouped && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { child.kill("SIGKILL"); }
    };
    const timeout = setTimeout(() => stop("Hook exceeded the 15 second timeout"), 15_000);
    for (let i = 0; i < buffers.length; i += 1) {
      child.stdio[i + 1].on("data", (chunk) => {
        size += chunk.length;
        if (size > LIMIT) stop("Hook output exceeded 2 MiB");
        else buffers[i].push(chunk);
      });
    }
    child.on("error", (cause) => { error ||= cause.message; });
    child.stdin.on("error", (cause) => {
      if (cause.code !== "EPIPE") error ||= cause.message;
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      const [stdout, stderr, metadata] = buffers.map((chunks) => Buffer.concat(chunks).toString("utf8"));
      resolve({ stdout, stderr, metadata, exitCode, durationMs: Date.now() - started,
        error: error || (exitCode !== 0 ? `Hook exited with ${signal || exitCode}` : null) });
    });
    child.stdin.end(input);
  });
}
