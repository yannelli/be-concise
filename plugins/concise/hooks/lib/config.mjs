import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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
};

// Codex projects keep config under .codex/; Claude Code under .claude/. First hit wins.
const CONFIG_DIRS = [".claude", ".codex"];

export function loadConfig(cwd) {
  for (const dir of CONFIG_DIRS) {
    const configPath = join(cwd || ".", dir, "concise.json");
    if (!existsSync(configPath)) continue;
    try {
      const userConfig = JSON.parse(readFileSync(configPath, "utf8"));
      return { ...DEFAULTS, ...userConfig };
    } catch {
      return DEFAULTS;
    }
  }
  return DEFAULTS;
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
