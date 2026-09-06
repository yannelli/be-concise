import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

export const filterScript = fileURLToPath(new URL("../PreToolUse-test-filter.sh", import.meta.url));

export const isCodexFilter = (input) => typeof input.turn_id === "string" || process.env.CONCISE_HOOK_HOST === "codex";

export function filterSettings(input) {
  const result = spawnSync("bash", [filterScript, "settings"], {
    input: JSON.stringify(input), encoding: "utf8", timeout: 5000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Bash exited ${result.status}`);
  const settings = JSON.parse(result.stdout || "{}");
  if (!settings.runner) return null;
  for (const key of ["lines", "context", "tail"]) {
    if (!/^\d+$/.test(settings[key]) || !Number.isSafeInteger(Number(settings[key]))) return null;
    settings[key] = Number(settings[key]);
  }
  return settings;
}

export function completedOutput(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const exitCode = response.exit_code ?? response.exitCode;
  const output = typeof response.output === "string" ? response.output
    : typeof response.stdout === "string" ? response.stdout : null;
  const stderr = typeof response.stderr === "string" ? response.stderr : "";
  if (output === null || !Number.isInteger(exitCode)) return null;
  return { output: output + (stderr ? `${output && !output.endsWith("\n") ? "\n" : ""}${stderr}` : ""), exitCode };
}

function grepOutput(output, args) {
  const result = spawnSync("grep", args, {
    input: output, encoding: "utf8", timeout: 5000,
    maxBuffer: Math.max(1024 * 1024, Buffer.byteLength(output) * 2),
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr.trim() || `grep exited ${result.status}`);
  return result;
}

function selectedLines(output, settings) {
  const result = grepOutput(output, ["-A", String(settings.context), "-E", "--", settings.pattern]);
  const lines = (value) => value.replace(/\n$/, "").split("\n");
  const matched = result.stdout ? lines(result.stdout).slice(0, settings.lines) : [];
  const tail = settings.tail ? lines(output).slice(-settings.tail) : [];
  return [...matched, ...(tail.length ? [`[filtered] last ${settings.tail} lines:`, ...tail] : [])].join("\n");
}

export function filteredFeedback(response, result, settings) {
  const preserveFailure = result.exitCode !== 0 || grepOutput(stripVTControlCharacters(result.output), ["-c", "-E", "--", settings.failurePattern]).status === 0;
  const shown = preserveFailure ? result.output : selectedLines(result.output, settings);
  const directory = mkdtempSync(join(tmpdir(), "concise-test-output-"));
  const outputPath = join(directory, "output.log");
  const responsePath = join(directory, "response.json");
  writeFileSync(outputPath, result.output, { mode: 0o600 });
  writeFileSync(responsePath, JSON.stringify(response), { mode: 0o600 });
  const quote = (path) => `'${path.replace(/'/g, "'\\''")}'`;
  return [
    `[filtered] runner=${settings.runner} exit=${result.exitCode}${preserveFailure ? " (failure output retained)" : ` (cap ${settings.lines})`}`,
    `[filtered] available output: cat ${quote(outputPath)}`,
    `[filtered] raw tool response: cat ${quote(responsePath)}`,
    "[filtered] bypass: NOFILTER=1 <cmd> | adjust: FILTER_LINES=300 FILTER_PATTERN='regex' <cmd>",
    shown,
  ].join("\n");
}
