import { loadConfig } from "../hooks/lib/config.mjs";
import { problem } from "../web/configuration.mjs";
import { editSettings, getSetting, mergeDelta, settingKeys, showSettings, validateSettings } from "./settings.mjs";
import { addEntry, listDictionary, removeEntry, testEntry } from "./dictionary-ops.mjs";
import { checkText } from "./check.mjs";

const ENTRY_FIELDS = ["id", "match", "value", "fix", "on", "caseSensitive", "flags", "hooks", "scopes"];

const base = (args) => ({ cwd: args.cwd || process.cwd(), env: args.env || process.env });

/** Pulls dictionary entry fields from flat arguments, as the CLI and MCP tools pass them. */
export function entryFrom(args) {
  const entry = { match: "exact", ...(args.entry || {}) };
  for (const field of ENTRY_FIELDS) if (args[field] !== undefined) entry[field] = args[field];
  return entry;
}

async function tuneSettings(args) {
  const { readSamples, tune } = await import("./tune.mjs");
  const kind = args.kind || "docs";
  const fromFiles = Array.isArray(args.paths) && args.paths.length ? readSamples(args.paths, kind) : [];
  const fromText = (args.texts || []).map((text, index) => ({ name: `text ${index + 1}`, text: String(text) }));
  const samples = [...fromFiles, ...fromText];
  if (samples.length === 0) throw problem("No samples: pass file or directory paths, or sample text");
  const { cwd, env } = base(args);
  const result = await tune({ samples, kind, cwd, config: loadConfig(cwd, env), preset: args.preset });
  const edit = editSettings({ cwd, env, layer: args.layer, apply: args.apply, transform: (config) => mergeDelta(config, result.delta) });
  return { ...result, ...edit };
}

/** The settings operations behind the CLI and the MCP server. Writes happen only with `apply: true`. */
export const operations = {
  show: (args) => showSettings(base(args)),
  keys: (args) => ({ keys: settingKeys(args.query) }),
  get: (args) => getSetting({ ...base(args), key: args.key }),
  edit: (args) => editSettings({
    ...base(args),
    layer: args.layer,
    apply: args.apply,
    edits: [{ op: args.op || "set", key: args.key, value: args.value }],
  }),
  validate: (args) => validateSettings(base(args)),
  check: (args) => checkText({ ...base(args), text: args.text, scope: args.scope, hook: args.hook, path: args.path }),
  dictionary: (args) => {
    const action = args.action || "list";
    if (action === "list") return listDictionary(base(args));
    if (action === "add") return addEntry({ ...base(args), layer: args.layer, entry: entryFrom(args), replace: args.replace, apply: args.apply });
    if (action === "remove") return removeEntry({ ...base(args), layer: args.layer, id: args.id, disable: args.disable, apply: args.apply });
    if (action === "test") return testEntry({ entry: { fix: "test", ...entryFrom(args) }, text: args.text, scope: args.scope, hook: args.hook });
    throw problem("action must be list, add, remove, or test");
  },
  tune: tuneSettings,
};
