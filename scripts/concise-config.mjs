#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { operations } from "../tools/operations.mjs";

export const USAGE = `Usage: concise-config <command> [arguments] [options]

Commands:
  show                       Effective settings, config layers, BEC_ overrides, and problems
  keys [query]               Documented keys, defaults, and descriptions
  get <key>                  One key: default, effective value, and the value in each layer file
  set <key> <value>          Set a key in a layer file (value is JSON, or a plain string)
  unset <key>                Remove a key from a layer file
  add <key> <value>          Add items to a list key, such as allowList.phrases
  remove <key> <value>       Remove items from a list key
  validate                   Validate every config layer file
  check [text]               Run the checks over text from the argument, --file, or stdin
  dict list                  Dictionary entries and the layer that sets each one
  dict add                   Add an entry: --value and --fix, plus --match, --on, --id, --hooks, --scopes
  dict remove <id>           Remove an entry from a layer, or switch it off with --disable
  dict test [text]           Run an entry built from the flags over text without saving it
  tune <path...>             Propose settings that fit your writing samples (--kind, --preset)

Options:
  --cwd <dir>                Project directory (default: the current directory)
  --layer <name>             project (default), user, or a layer id from show
  --apply                    Write the change. Without it, edit commands print the diff only
  --json                     Print JSON
  --scope <scope>            files, comments, gh, commit, command, or reply (check and dict test)
  --hook <hook>              edit, bash, stop, or subagentStop (check and dict test)
  --path <path>              File path for check, which picks prose or comment rules
  --file <path>              Read the text for check or dict test from a file
  --match <type>             exact (default), contains, startsWith, endsWith, or regex
  --on <unit>                word (default), line, or text
  --case-sensitive           Match case for a dictionary entry
  --replace                  Overwrite a dictionary entry with the same id
  --disable                  Switch off an entry set in another layer
  --kind <kind>              docs (default), reply, commit, gh, or comments (tune)
  --preset <name>            Base preset for tune (default: the effective preset)

Exit status: 0 on success, 1 when check finds something or validate finds an invalid file, 2 on an error.
`;

const OPTIONS = {
  cwd: { type: "string" }, layer: { type: "string" }, apply: { type: "boolean" }, json: { type: "boolean" },
  scope: { type: "string" }, hook: { type: "string" }, path: { type: "string" }, file: { type: "string" },
  id: { type: "string" }, match: { type: "string" }, value: { type: "string" }, fix: { type: "string" },
  on: { type: "string" }, hooks: { type: "string" }, scopes: { type: "string" }, flags: { type: "string" },
  "case-sensitive": { type: "boolean" }, replace: { type: "boolean" }, disable: { type: "boolean" },
  kind: { type: "string" }, preset: { type: "string" }, help: { type: "boolean", short: "h" },
};

function parseValue(text) {
  if (text === undefined) throw new Error("A value is required");
  try { return JSON.parse(text); } catch { return text; }
}

function readText(positional, values) {
  if (values.file) return readFileSync(values.file, "utf8");
  if (positional !== undefined) return positional;
  if (!process.stdin.isTTY) return readFileSync(0, "utf8");
  throw new Error("Pass the text as an argument, with --file, or on stdin");
}

/** Maps argv to an operation name and its arguments. */
export function commandFrom(argv) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, ...rest] = positionals;
  const args = { cwd: values.cwd, layer: values.layer, apply: values.apply };
  if (values.help || !command || command === "help") return { name: "help" };
  if (["show", "validate"].includes(command)) return { name: command, args, values };
  if (command === "keys") return { name: "keys", args: { query: rest.join(" ") }, values };
  if (command === "get") return { name: "get", args: { ...args, key: rest[0] }, values };
  if (["set", "unset", "add", "remove"].includes(command)) {
    const value = command === "unset" ? undefined : parseValue(rest[1]);
    return { name: "edit", args: { ...args, op: command, key: rest[0], value }, values };
  }
  if (command === "check") {
    return { name: "check", args: { ...args, text: readText(rest[0], values), scope: values.scope, hook: values.hook, path: values.path }, values };
  }
  if (command === "dict") {
    const [action = "list", target] = rest;
    const entry = {
      id: values.id ?? (action === "remove" ? target : undefined), match: values.match, value: values.value, fix: values.fix,
      on: values.on, hooks: values.hooks, scopes: values.scopes, flags: values.flags, caseSensitive: values["case-sensitive"],
    };
    const text = action === "test" ? readText(target, values) : undefined;
    return { name: "dictionary", args: { ...args, ...entry, action, text, scope: values.scope, hook: values.hook, replace: values.replace, disable: values.disable }, values };
  }
  if (command === "tune") return { name: "tune", args: { ...args, paths: rest, kind: values.kind, preset: values.preset }, values };
  throw new Error(`Unknown command ${command}. Run concise-config --help.`);
}

const json = (value) => JSON.stringify(value, null, 2);

function editText(result) {
  const where = `${result.layer.label}: ${result.layer.path}`;
  if (!result.changed) return `${where}\nNo change.`;
  const tail = result.applied ? "Written." : "Preview only. Run again with --apply to write it.";
  return `${where}\n${result.diff}\n\n${tail}`;
}

function findingText(result) {
  if (result.bypass) return `Allowed by bypass "${result.bypass}".`;
  const core = result.core.map((item) => `[concise:${item.check}] ${item.line ? `line ${item.line}: ` : ""}${item.reason}`);
  const lines = [...core, ...(result.message ? [result.message] : [])];
  return lines.length ? lines.join("\n") : "Clean.";
}

function tuneText(result) {
  const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const lines = [`${count(result.samples, "sample")}, ${count(result.words, "word")}, kind ${result.kind}.`];
  for (const item of result.evidence) {
    lines.push(`- ${item.key} = ${JSON.stringify(item.value)}: ${item.reason}`);
    for (const example of item.examples || []) lines.push(`    ${example}`);
  }
  for (const item of result.kept || []) lines.push(`- kept ${item.category}: ${item.reason}`);
  for (const item of result.insufficient || []) lines.push(`- ${item.pack}: needs ${item.minWords} words, samples have ${item.words}`);
  return `${lines.join("\n")}\n\n${editText(result)}`;
}

function showText(result) {
  const layers = result.layers.map((layer) => `${layer.active ? "*" : " "} ${layer.id.padEnd(17)} ${layer.path}${layer.exists ? "" : " (missing)"}`);
  const env = Object.entries(result.environment).map(([key, value]) => `  ${key}=${value}`);
  const problems = result.problems.map((item) => `  ${item.source}: ${item.reason}`);
  return [
    "Layers (* marks the user file and the project file in effect; the project file overrides the user file):", ...layers,
    ...(env.length ? ["Environment overrides:", ...env] : []),
    ...(problems.length ? ["Problems:", ...problems] : []),
    "Effective settings:", json(result.effective),
  ].join("\n");
}

function entryLine(entry) {
  const unit = entry.match === "regex" ? "" : ` on ${entry.on || "word"}`;
  const limits = [entry.hooks && `hooks ${entry.hooks.join(",")}`, entry.scopes && `scopes ${entry.scopes.join(",")}`].filter(Boolean);
  const state = entry.enabled === false ? " (off)" : entry.problem ? ` (skipped: ${entry.problem})` : "";
  if (entry.match === undefined && entry.enabled === false) return `${entry.id}: from ${entry.layer}${state}`;
  return `${entry.id}: ${entry.match}${unit} ${JSON.stringify(entry.value ?? "")} -> ${entry.fix ?? ""}${limits.length ? ` [${limits.join("; ")}]` : ""} from ${entry.layer}${state}`;
}

/** Human-readable output per operation; --json prints the raw result. */
export function render(name, result) {
  if (name === "show") return showText(result);
  if (name === "dictionary" && result.entries) {
    const head = `Dictionary ${result.enabled ? "on" : "off"}, mode ${result.mode}.`;
    return [head, ...result.entries.map(entryLine)].join("\n");
  }
  if (name === "edit" || (name === "dictionary" && result.layer)) {
    return [editText(result), ...(result.notes || [])].join("\n");
  }
  if (name === "check") return findingText(result);
  if (name === "tune") return tuneText(result);
  if (name === "keys") return result.keys.map((row) => `${row.key} (${row.default}): ${row.description}`).join("\n");
  if (name === "validate") {
    const rows = result.layers.map((layer) => `${layer.ok ? "ok" : "error"} ${layer.id} ${layer.path}${layer.error ? `: ${layer.error}` : ""}`);
    const problems = result.problems.map((item) => `problem ${item.source}: ${item.reason}`);
    return [...rows, ...problems, result.ok ? "Valid." : "Invalid."].join("\n");
  }
  if (name === "dictionary" && result.matches) {
    return result.matches.length ? result.matches.map((hit) => `line ${hit.line}: "${hit.match}"`).join("\n") : "No matches.";
  }
  return json(result);
}

const failed = (name, result) => (name === "check" && !result.clean) || (name === "validate" && !result.ok);

/** Runs one command and returns the text to print and the exit code. */
export async function main(argv = process.argv.slice(2)) {
  const command = commandFrom(argv);
  if (command.name === "help") return { text: USAGE, code: 0 };
  const result = await operations[command.name](command.args);
  const text = command.values.json ? json(result) : render(command.name, result);
  return { text, code: failed(command.name, result) ? 1 : 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { text, code } = await main();
    process.stdout.write(`${text}\n`);
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`concise-config: ${error.message}\n`);
    process.exitCode = 2;
  }
}
