#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { operations } from "./operations.mjs";
import { HOOKS, MATCHES, UNITS } from "../hooks/lib/dictionary.mjs";
import { SCOPES } from "../hooks/lib/packs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8")).version;
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const text = (description) => ({ type: "string", description });
const flag = (description) => ({ type: "boolean", description });
const list = (items, description) => ({ type: "array", items: { type: "string", enum: items }, description });
const cwd = text("Project directory. Defaults to CLAUDE_PROJECT_DIR in Claude Code. Codex starts the server in the plugin directory, so pass the project directory there.");
const layer = text("Config layer to edit: project (default), user, or a layer id from concise_settings_show.");
const apply = flag("Write the change. Without it the tool returns the diff only. Show the diff to the user before applying.");
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const schema = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

export const TOOLS = [
  {
    name: "concise_settings_show", operation: "show", annotations: READ,
    description: "Show the effective concise settings, every config layer file, BEC_ environment overrides, and load problems.",
    inputSchema: schema({ cwd }),
  },
  {
    name: "concise_settings_keys", operation: "keys", annotations: READ,
    description: "List documented concise.json keys with defaults and descriptions, filtered by a query.",
    inputSchema: schema({ query: text("Case-insensitive text to match in the key or description.") }),
  },
  {
    name: "concise_settings_get", operation: "get", annotations: READ,
    description: "Show one key: its default, the effective value, and the value each layer file sets.",
    inputSchema: schema({ key: text("Dotted key, such as features.aiWriting.preset."), cwd }, ["key"]),
  },
  {
    name: "concise_settings_edit", operation: "edit", annotations: WRITE,
    description: "Set, unset, or add to or remove from a list key in one concise.json layer. Validates the file and returns a diff; writes only with apply.",
    inputSchema: schema({
      op: { type: "string", enum: ["set", "unset", "add", "remove"], description: "set (default), unset, add to a list, or remove from a list." },
      key: text("Dotted key, such as features.emDash.enabled or allowList.phrases."),
      value: { description: "New value for set, or the item or items for add and remove." },
      layer, apply, cwd,
    }, ["key"]),
  },
  {
    name: "concise_settings_validate", operation: "validate", annotations: READ,
    description: "Validate every concise.json layer file and report load problems in the effective config.",
    inputSchema: schema({ cwd }),
  },
  {
    name: "concise_dictionary", operation: "dictionary", annotations: WRITE,
    description: "Manage dictionary entries that flag custom terms: list them, add or remove one in a layer, or test an entry over sample text without saving it.",
    inputSchema: schema({
      action: { type: "string", enum: ["list", "add", "remove", "test"], description: "list (default), add, remove, or test." },
      id: text("Entry id (lowercase letters, digits, hyphens). Generated from value when omitted on add."),
      match: { type: "string", enum: MATCHES, description: "How value matches. Defaults to exact." },
      value: text("The term, phrase, or regular expression to flag."),
      fix: text("What to write instead; shown in the hook message."),
      on: { type: "string", enum: UNITS, description: "Unit for exact, contains, startsWith, endsWith: word (default), line, or text." },
      caseSensitive: flag("Match case. Defaults to false."),
      flags: text("Regex flags for match regex. Defaults to i."),
      hooks: list(HOOKS, "Hooks the entry runs in. Omit for all."),
      scopes: list(SCOPES, "Text scopes the entry runs in. Omit for every scope except command and code."),
      text: text("Sample text for action test."),
      scope: { type: "string", enum: SCOPES, description: "Scope for action test. Defaults to reply." },
      hook: { type: "string", enum: HOOKS, description: "Hook for action test." },
      replace: flag("Overwrite an entry with the same id on add."),
      disable: flag("On remove, switch off an entry that another layer sets."),
      layer, apply, cwd,
    }),
  },
  {
    name: "concise_check_text", operation: "check", annotations: READ,
    description: "Run the concise checks over text the way a hook would, without changing retry or confirmation state.",
    inputSchema: schema({
      text: text("Text to check."),
      scope: { type: "string", enum: SCOPES, description: "files (prose), comments (code comments), code (a whole code file), gh, commit, command, or reply (default)." },
      hook: { type: "string", enum: HOOKS, description: "Hook to imitate. Defaults from the scope." },
      path: text("File path that decides prose or comment rules and the ignore globs."),
      cwd,
    }, ["text"]),
  },
  {
    name: "concise_tune", operation: "tune", annotations: WRITE,
    description: "Read the user's writing samples and propose settings that fit them, with evidence per change. Returns a diff; writes only with apply.",
    inputSchema: schema({
      paths: { type: "array", items: { type: "string" }, description: "Sample files or directories." },
      texts: { type: "array", items: { type: "string" }, description: "Sample texts. For kind comments, pass file paths instead." },
      kind: { type: "string", enum: ["docs", "reply", "commit", "gh", "comments"], description: "What the samples are. Defaults to docs." },
      preset: text("Base preset to tune from. Defaults to the effective preset."),
      layer, apply, cwd,
    }),
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
const NO_PROJECT = "Pass cwd, the project directory. This server was started in the plugin directory and cannot find the project on its own.";

/** The project for a call: the cwd argument, CLAUDE_PROJECT_DIR, or the working directory unless that is the plugin itself. */
function projectDir(args) {
  if (args.cwd) return args.cwd;
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  return realpathSync(process.cwd()) === realpathSync(ROOT) ? null : process.cwd();
}

const needsProject = (tool, args) => tool.operation !== "keys" && !(tool.operation === "dictionary" && args.action === "test");

async function callTool({ name, arguments: args = {} }) {
  const tool = BY_NAME.get(name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool ${name}` }], isError: true };
  try {
    const project = projectDir(args);
    if (!project && needsProject(tool, args)) throw new Error(NO_PROJECT);
    const result = await operations[tool.operation]({ ...args, cwd: project || process.cwd() });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: error.message }], isError: true };
  }
}

/** Answers one JSON-RPC message. Returns null for notifications. */
export async function handle(message) {
  const { id, method, params = {} } = message || {};
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  if (id === undefined || id === null) return null;
  if (method === "initialize") {
    return reply({
      protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "concise", title: "Concise settings", version: VERSION },
      instructions: "Tools to read and change concise settings, manage the dictionary, check text, and tune settings from writing samples. Edit tools return a diff and write only with apply: true. Pass cwd with the project directory unless the host sets CLAUDE_PROJECT_DIR.",
    });
  }
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: TOOLS.map(({ operation, ...tool }) => tool) });
  if (method === "tools/call") return reply(await callTool(params));
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export function serve(input = process.stdin, output = process.stdout) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on("line", async (line) => {
    if (line.trim() === "") return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await handle(message);
    if (response) output.write(`${JSON.stringify(response)}\n`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log = (...args) => console.error(...args);
  serve();
}
