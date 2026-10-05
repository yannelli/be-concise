import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, ok, bad } from "./lib.mjs";

const SERVER = join(ROOT, "tools", "mcp-server.mjs");
const show = (value) => JSON.stringify(value);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual).slice(0, 400)));
const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

/** Sends newline-delimited JSON-RPC messages and returns the responses keyed by id. */
function session(messages, env = {}, cwd = process.cwd()) {
  const input = messages.map((message) => (typeof message === "string" ? message : show(message))).join("\n");
  const result = spawnSync(process.execPath, [SERVER], { input: `${input}\n`, encoding: "utf8", env: { ...process.env, ...env }, cwd });
  const lines = result.stdout.split("\n").filter(Boolean);
  const replies = lines.map((line) => JSON.parse(line));
  return { replies, byId: new Map(replies.map((reply) => [reply.id, reply])), stderr: result.stderr, status: result.status };
}

const payload = (reply) => JSON.parse(reply.result.content[0].text);

console.log("\nmcp server");

const dir = mkdtempSync(join(tmpdir(), "concise-mcp-"));
mkdirSync(join(dir, ".claude"));
const file = join(dir, ".claude", "concise.json");
writeFileSync(file, show({ features: { dictionary: { entries: [{ id: "wip", match: "exact", value: "WIP", fix: "finish first" }] } } }));

const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
const edit = { op: "set", key: "maxRetries", value: 4, cwd: dir };
const { replies, byId, status } = session([
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  call(3, "concise_check_text", { text: "WIP parser", cwd: dir }),
  call(4, "concise_settings_edit", edit),
  call(5, "concise_settings_get", { key: "maxRetries", cwd: dir }),
  call(6, "concise_dictionary", { action: "test", value: "synerg", match: "startsWith", text: "Synergies" }),
  call(7, "concise_check_text", { text: 3, cwd: dir }),
  call(8, "concise_nope", {}),
  { jsonrpc: "2.0", id: 9, method: "resources/list" },
  { jsonrpc: "2.0", id: 10, method: "ping" },
  "{not json",
]);

check("the server exits cleanly when stdin closes", status === 0, status);
check("a notification gets no reply", replies.length === 11, replies.map((reply) => reply.id));
const init = byId.get(1).result;
check("initialize echoes the client protocol version", init.protocolVersion === "2025-03-26", init);
check("initialize reports the plugin version and the tools capability", init.serverInfo.version === plugin.version && "tools" in init.capabilities, init);

const tools = byId.get(2).result.tools;
const names = tools.map((tool) => tool.name);
const expected = ["concise_settings_show", "concise_settings_keys", "concise_settings_get", "concise_settings_edit",
  "concise_settings_validate", "concise_dictionary", "concise_check_text", "concise_tune"];
check("tools/list returns every tool", show(names) === show(expected), names);
check("every tool has a closed object schema", tools.every((tool) => tool.inputSchema.type === "object" && tool.inputSchema.additionalProperties === false), tools);
check("read tools are marked read-only", tools.filter((tool) => tool.annotations.readOnlyHint).map((tool) => tool.name).join() ===
  "concise_settings_show,concise_settings_keys,concise_settings_get,concise_settings_validate,concise_check_text", tools.map((tool) => tool.annotations));
check("tools/list hides the internal operation name", tools.every((tool) => !("operation" in tool)), tools[0]);

const checked = payload(byId.get(3));
check("concise_check_text finds a dictionary term", !checked.clean && checked.findings[0]?.category === "dictionary:wip", checked);
const preview = payload(byId.get(4));
check("concise_settings_edit previews without apply", preview.applied === false && preview.diff.includes("+   \"maxRetries\": 4"), preview);
check("the preview leaves the file alone", !("maxRetries" in JSON.parse(readFileSync(file, "utf8"))), readFileSync(file, "utf8"));
check("concise_settings_get reads the effective value", payload(byId.get(5)).effective === 2, payload(byId.get(5)));
check("concise_dictionary test returns matches", show(payload(byId.get(6)).matches.map((hit) => hit.match)) === show(["Synergies"]), payload(byId.get(6)));
const invalid = byId.get(7).result;
check("bad arguments return a tool error", invalid.isError === true && invalid.content[0].text === "text must be a string", invalid);
check("an unknown tool returns a tool error", byId.get(8).result.isError === true, byId.get(8));
check("an unknown method returns -32601", byId.get(9).error?.code === -32601, byId.get(9));
check("ping returns an empty result", show(byId.get(10).result) === "{}", byId.get(10));
check("a parse error returns -32700 with a null id", byId.get(null)?.error?.code === -32700, byId.get(null));

{
  const applied = session([call(1, "concise_settings_edit", { ...edit, apply: true })]);
  check("concise_settings_edit writes with apply", payload(applied.byId.get(1)).applied === true && JSON.parse(readFileSync(file, "utf8")).maxRetries === 4, applied.replies);
}

{
  const later = session([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2099-01-01" } }]);
  check("initialize answers an unknown version with the newest supported one", later.byId.get(1).result.protocolVersion === "2025-11-25", later.replies);
}

{
  const fromEnv = session([call(1, "concise_settings_get", { key: "maxRetries" })], { CLAUDE_PROJECT_DIR: dir });
  check("the cwd defaults to CLAUDE_PROJECT_DIR", payload(fromEnv.byId.get(1)).effective === 4, fromEnv.replies);
}

{
  const { CLAUDE_PROJECT_DIR, ...env } = process.env;
  const plugin = spawnSync(process.execPath, [SERVER], {
    input: `${[call(1, "concise_settings_show", {}), call(2, "concise_settings_keys", { query: "maxRetries" })].map(show).join("\n")}\n`,
    encoding: "utf8", env, cwd: ROOT,
  });
  const byId = new Map(plugin.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line)).map((reply) => [reply.id, reply.result]));
  check("a project tool started in the plugin directory asks for cwd", byId.get(1)?.isError === true && byId.get(1).content[0].text.startsWith("Pass cwd"), byId.get(1));
  check("keys works without a project", payload({ result: byId.get(2) }).keys[0]?.key === "maxRetries", byId.get(2));
}

{
  const manifest = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8")).mcpServers.concise;
  const script = manifest.args[0].replace("${CLAUDE_PLUGIN_ROOT}", ROOT.replace(/\/$/, ""));
  check(".mcp.json starts the server with node", manifest.command === "node" && existsSync(script), manifest);
}

rmSync(dir, { recursive: true, force: true });
