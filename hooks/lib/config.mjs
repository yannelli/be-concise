import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { readEnv } from "./env.mjs";
import { applyLayer, envBaselineLayer, envOverrideLayer } from "./config-layers.mjs";

const FEATURES = {
  emDash: { enabled: false, enDash: true, doubleHyphen: false, mode: "confirm", replies: true },
  aiWriting: {
    enabled: false,
    preset: "default",
    categories: null,
    allow: [],
    mode: "confirm",
    replies: true,
    packs: [],
    excludePacks: [],
    enablePatterns: [],
    disablePatterns: [],
    options: {},
  },
  dictionary: { enabled: true, mode: "confirm", entries: [] },
};

// Agent instruction files: the style features skip them, the core checks still apply.
const STYLE_IGNORE_GLOBS = [
  "**/.claude/**",
  "**/.codex/**",
  "**/.agent/**",
  "**/.agents/**",
  "**/.cursor/**",
  "**/.cursorrules",
  "**/.windsurf/**",
  "**/.windsurfrules",
  "**/.gemini/**",
  "**/.roo/**",
  "**/.clinerules",
  "**/.clinerules/**",
  "**/.kiro/**",
  "**/.continue/**",
  "**/.aider*",
  "**/.opencode/**",
  "**/.amazonq/**",
  "**/.junie/**",
  "**/.trae/**",
  "**/.augment/**",
  "**/.github/copilot-instructions.md",
  "**/.github/instructions/**",
  "**/.github/prompts/**",
  "**/.github/agents/**",
  "**/CLAUDE.md",
  "**/CLAUDE.local.md",
  "**/AGENTS.md",
  "**/GEMINI.md",
];

const DEFAULTS = {
  maxCommentLines: 2,
  maxFileLines: 300,
  maxPrBodyParagraphs: 1,
  maxPrBodySentences: 3,
  maxRetries: 2,
  ignoreGlobs: [
    "**/node_modules/**",
    "**/vendor/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/*.generated.*",
    "**/*.min.js",
    "**/package-lock.json",
    "**/*.lock",
  ],
  checks: { comments: true, fileSize: true, prBody: true },
  scan: { codeFiles: true, notebooks: true, heredocWrites: true, shellWrites: true, mcp: true, plans: true, tasks: true, questions: true },
  stopHook: true,
  context: { enabled: true, perTurn: false },
  subagentStop: { enabled: true, exemptAgentTypes: [] },
  testFilter: { codexPostToolUse: false },
  softFail: false,
  styleIgnoreGlobs: STYLE_IGNORE_GLOBS,
  allowList: { phrases: [], patterns: [] },
  bypass: { phrases: [], patterns: [] },
  log: { enabled: false, path: null, maxSize: "5m", maxFiles: 5, rotate: "size", format: "json" },
  monitor: { persist: true },
  features: FEATURES,
  problems: [],
};

export function defaultConfig() {
  return structuredClone(DEFAULTS);
}

// Codex projects keep config under .codex/; Claude Code under .claude/. First hit wins.
const CONFIG_DIRS = [".claude", ".codex"];

function readLayer(path, problems) {
  if (!path || !existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    problems.push({ source: path, reason: "file is not a JSON object" });
  } catch (err) {
    problems.push({ source: path, reason: err.message });
  }
  return null;
}

export function userConfigPath(env) {
  const candidates = [];
  if (env.XDG_CONFIG_HOME) candidates.push(join(env.XDG_CONFIG_HOME, "concise", "concise.json"));
  const home = env.HOME || env.USERPROFILE;
  if (home) {
    candidates.push(join(home, ".config", "concise", "concise.json"));
    candidates.push(join(home, ".claude", "concise.json"));
    candidates.push(join(home, ".codex", "concise.json"));
  }
  return candidates.find((path) => existsSync(path)) || null;
}

export function projectConfigPath(cwd) {
  const base = cwd || ".";
  return CONFIG_DIRS.map((dir) => join(base, dir, "concise.json")).find((path) => existsSync(path)) || null;
}

const realPath = (path) => (existsSync(path) ? realpathSync(path) : path);

// The files in merge order: env (BEC_CONFIG_PATH, resolved against cwd), user, project.
// env is null when that file is also the user or project file, so it loads once.
export function configFiles(cwd, env = process.env, vars = readEnv(env)) {
  const pinned = vars.configPath ? resolve(cwd || ".", vars.configPath) : null;
  const user = vars.configPathOnly ? null : userConfigPath(env);
  const project = vars.configPathOnly ? null : projectConfigPath(cwd);
  const shared = pinned && [user, project].some((path) => path && realPath(path) === realPath(pinned));
  return { env: shared ? null : pinned, user, project };
}

export function loadConfig(cwd, env = process.env) {
  const vars = readEnv(env || {});
  const problems = [...vars.problems];
  let config = applyLayer(defaultConfig(), vars.configJson);
  config = applyLayer(config, envBaselineLayer(vars));
  const files = configFiles(cwd, env || {}, vars);
  for (const path of [files.env, files.user, files.project]) config = applyLayer(config, readLayer(path, problems));
  config = applyLayer(config, envOverrideLayer(vars));
  for (const [group, key] of [["context", "enabled"], ["context", "perTurn"], ["subagentStop", "enabled"], ["testFilter", "codexPostToolUse"]]) {
    if (typeof config[group][key] === "boolean") continue;
    problems.push({ source: `${group}.${key}`, reason: "expected a boolean" });
    config[group][key] = DEFAULTS[group][key];
  }
  for (const [key, on] of Object.entries(DEFAULTS.scan)) {
    if (typeof config.scan[key] === "boolean") continue;
    problems.push({ source: `scan.${key}`, reason: "expected a boolean" });
    config.scan[key] = on;
  }
  if (!Array.isArray(config.subagentStop.exemptAgentTypes) || config.subagentStop.exemptAgentTypes.some((type) => typeof type !== "string")) {
    problems.push({ source: "subagentStop.exemptAgentTypes", reason: "expected an array of strings" });
    config.subagentStop.exemptAgentTypes = [];
  }
  if (!Array.isArray(config.features.dictionary?.entries)) {
    problems.push({ source: "features.dictionary.entries", reason: "expected an array" });
    config.features.dictionary = { ...DEFAULTS.features.dictionary, ...config.features.dictionary, entries: [] };
  }
  config.problems = problems;
  return config;
}

// One pass, one callback: chained .replace() calls would let later steps
// re-match the "*" characters inside earlier steps' own replacement text.
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\*\*\/|\*\*|\*/g, (m) => {
    if (m === "**/") return "(?:.*/)?"; // zero or more leading path segments
    if (m === "**") return ".*";
      return "[^/]*"; // "*", within one path segment
  });
  return new RegExp(`^${pattern}$`);
}

export function isIgnored(filePath, ignoreGlobs) {
  const normalized = filePath.replace(/\\/g, "/");
  return ignoreGlobs.some((glob) => globToRegExp(glob).test(normalized));
}
