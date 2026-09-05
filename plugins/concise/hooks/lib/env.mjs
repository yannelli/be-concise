import { delimiter } from "node:path";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", ""]);
const SIZE_UNITS = { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };

/** null means the variable is unset or holds a word outside the two value sets. */
export function parseBool(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  return null;
}

export function parseIds(value) {
  if (value === undefined || value === null) return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parsePaths(value) {
  if (value === undefined || value === null) return [];
  return String(value)
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseSize(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  const match = /^(\d+(?:\.\d+)?)\s*([bkmg])?b?$/i.exec(String(value ?? "").trim());
  if (!match) return null;
  const unit = SIZE_UNITS[(match[2] || "b").toLowerCase()];
  const bytes = Math.floor(Number(match[1]) * unit);
  return bytes > 0 ? bytes : null;
}

export function parseCount(value) {
  const count = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

/** A value that starts with "[" is JSON, everything else is a comma list. */
export function parseList(value, source, problems) {
  if (value === undefined || value === null) return [];
  const text = String(value).trim();
  if (!text) return [];
  if (!text.startsWith("[")) return parseIds(text);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    problems?.push({ source: source || "env", reason: "JSON value is not an array" });
  } catch (err) {
    problems?.push({ source: source || "env", reason: err.message });
  }
  return [];
}

function parseConfigJson(text, problems) {
  if (!text || !text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    problems.push({ source: "BEC_CONFIG_JSON", reason: "value is not a JSON object" });
  } catch (err) {
    problems.push({ source: "BEC_CONFIG_JSON", reason: err.message });
  }
  return null;
}

export function readEnv(env = process.env) {
  const problems = [];
  const raw = (name) => (env[name] === undefined || env[name] === null ? null : String(env[name]));
  const ids = (name) => parseIds(raw(name));
  const list = (name) => parseList(raw(name), name, problems);
  const bool = (name) => parseBool(raw(name));
  return {
    configJson: parseConfigJson(raw("BEC_CONFIG_JSON"), problems),
    configPath: raw("BEC_CONFIG_PATH")?.trim() || null,
    featureEnable: ids("BEC_FEATURE_ENABLE"),
    featureDisable: ids("BEC_FEATURE_DISABLE"),
    alwaysEnableFeatures: ids("BEC_FEATURE_ALWAYS_ENABLE"),
    alwaysDisableFeatures: ids("BEC_FEATURE_ALWAYS_DISABLE"),
    enablePatterns: ids("BEC_ENABLE_PATTERNS"),
    disablePatterns: ids("BEC_DISABLE_PATTERNS"),
    alwaysEnablePatterns: ids("BEC_ALWAYS_ENABLE_PATTERNS"),
    alwaysDisablePatterns: ids("BEC_ALWAYS_DISABLE_PATTERNS"),
    loadLibPaths: parsePaths(raw("BEC_LOAD_LIB_PATHS")),
    softFail: bool("BEC_HOOK_SOFT_FAIL"),
    disableStopHook: bool("BEC_DISABLE_STOP_HOOK"),
    monitorPersist: bool("BEC_MONITOR_PERSIST"),
    log: {
      enabled: bool("BEC_LOG_ENABLED"),
      path: raw("BEC_LOG_PATH")?.trim() || null,
      maxSize: raw("BEC_LOG_MAX_SIZE")?.trim() || null,
      maxFiles: parseCount(raw("BEC_LOG_MAX_FILES")),
      rotate: raw("BEC_LOG_ROTATE")?.trim().toLowerCase() || null,
      useJson: bool("BEC_LOG_USE_JSON"),
      usePlaintext: bool("BEC_LOG_USE_PLAINTEXT"),
    },
    allowPhrases: list("BEC_ALLOW_PHRASES"),
    allowPatterns: list("BEC_ALLOW_PATTERNS"),
    bypassPhrases: list("BEC_BYPASS_PHRASES"),
    bypassPatterns: list("BEC_BYPASS_PATTERNS"),
    problems,
  };
}
