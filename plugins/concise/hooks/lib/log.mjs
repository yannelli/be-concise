import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { flagged } from "./respond.mjs";
import { parseSize } from "./env.mjs";

const FINDING_LIMIT = 20;
const MATCH_LIMIT = 200;
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const SOFT_PREFIX = "[concise] soft-fail:";
const OFF = { enabled: false, path: null, record() {} };

const oneLine = (value) => String(value).replace(/\s+/g, " ").trim();
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ensureDir(path) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function resolveLogPath(configured, env) {
  if (configured) return ensureDir(configured) ? configured : null;
  const home = env.HOME || env.USERPROFILE;
  if (home) {
    const path = join(home, ".cache", "concise", "concise.log");
    if (ensureDir(path)) return path;
  }
  const fallback = join(tmpdir(), "concise", "concise.log");
  return ensureDir(fallback) ? fallback : null;
}

function dailyPath(base, day) {
  const ext = extname(base);
  return join(dirname(base), `${basename(base, ext)}.${day}${ext}`);
}

function pruneDaily(base, maxFiles) {
  const ext = extname(base);
  const stem = basename(base, ext);
  const dir = dirname(base);
  const match = new RegExp(`^${escapeRe(stem)}\\.\\d{4}-\\d{2}-\\d{2}${escapeRe(ext)}$`);
  const names = readdirSync(dir).filter((name) => match.test(name)).sort();
  for (const name of names.slice(0, Math.max(names.length - maxFiles, 0))) {
    rmSync(join(dir, name), { force: true });
  }
}

function rotateBySize(file, maxSize, maxFiles) {
  if (!existsSync(file) || statSync(file).size <= maxSize) return;
  rmSync(`${file}.${maxFiles}`, { force: true });
  for (let i = maxFiles - 1; i >= 1; i -= 1) {
    if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
  }
  renameSync(file, `${file}.1`);
}

function normalize(entry, hook) {
  const findings = Array.isArray(entry.findings) ? entry.findings.slice(0, FINDING_LIMIT) : [];
  return {
    ts: entry.ts || new Date().toISOString(),
    hook: entry.hook || hook || null,
    event: entry.event ?? null,
    tool: entry.tool ?? null,
    session: entry.session ?? null,
    cwd: entry.cwd ?? null,
    key: entry.key ?? null,
    scope: entry.scope ?? null,
    decision: entry.decision ?? null,
    mode: entry.mode ?? null,
    softFail: Boolean(entry.softFail),
    findings: findings.map((hit) => ({
      category: hit.category ?? null,
      match: hit.match === undefined ? null : oneLine(hit.match).slice(0, MATCH_LIMIT),
      line: hit.line ?? null,
    })),
    counts: { emDash: entry.counts?.emDash ?? 0, aiWriting: entry.counts?.aiWriting ?? 0 },
    durationMs: entry.durationMs ?? null,
    error: entry.error === undefined || entry.error === null ? null : oneLine(entry.error),
  };
}

function summaryOf(rec, given) {
  if (given) return oneLine(given);
  const bits = [];
  if (rec.counts.emDash) bits.push(`emDash=${rec.counts.emDash}`);
  if (rec.counts.aiWriting) bits.push(`aiWriting=${rec.counts.aiWriting}`);
  if (rec.error) bits.push(`error=${rec.error}`);
  return bits.join(" ");
}

function plaintextLine(rec, given) {
  const cells = [rec.ts, rec.hook, rec.tool, rec.decision, rec.key].map((cell) => (cell ? oneLine(cell) : "-"));
  return [...cells, summaryOf(rec, given)].join(" ").trimEnd();
}

export function createLogger(logConfig = {}, options = {}) {
  if (!logConfig || !logConfig.enabled) return OFF;
  const base = resolveLogPath(logConfig.path, options.env || process.env);
  if (!base) return OFF;
  const maxSize = parseSize(logConfig.maxSize) || DEFAULT_MAX_SIZE;
  const maxFiles = Number.isInteger(logConfig.maxFiles) && logConfig.maxFiles > 0 ? logConfig.maxFiles : DEFAULT_MAX_FILES;
  const rotate = String(logConfig.rotate || "size").toLowerCase();
  const format = logConfig.format === "plaintext" ? "plaintext" : "json";
  const hook = options.hook || null;
  return {
    enabled: true,
    path: base,
    record(entry = {}) {
      try {
        const rec = normalize(entry, hook);
        const daily = rotate === "daily" || rotate === "both";
        const file = daily ? dailyPath(base, rec.ts.slice(0, 10)) : base;
        if (rotate === "size" || rotate === "both") rotateBySize(file, maxSize, maxFiles);
        appendFileSync(file, `${format === "plaintext" ? plaintextLine(rec, entry.summary) : JSON.stringify(rec)}\n`);
        if (daily) pruneDaily(base, maxFiles);
      } catch {
        // A hook must not fail because a log line could not be written.
      }
    },
  };
}

function softText(result, text) {
  const source =
    text ||
    result?.hookSpecificOutput?.permissionDecisionReason ||
    result?.reason ||
    result?.systemMessage ||
    "";
  return `${SOFT_PREFIX} ${String(source).replace(/^\[concise\]\s*/, "").trim()}`.trimEnd();
}

/** Turns a deny, an ask, or a Stop block into an allow that still carries the text. */
export function softFailResult(result, text) {
  const decision = result?.hookSpecificOutput?.permissionDecision;
  if (decision === "deny" || decision === "ask") return flagged(softText(result, text));
  if (result?.decision === "block") return { systemMessage: softText(result, text) };
  return result;
}
