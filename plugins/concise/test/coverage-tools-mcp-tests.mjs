import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad } from "./lib.mjs";
import { handle } from "../tools/mcp-server.mjs";

const SERVER = join(ROOT, "tools", "mcp-server.mjs");
const show = (value) => JSON.stringify(value);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual).slice(0, 400)));
const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "CLAUDE_PROJECT_DIR"));
const dir = mkdtempSync(join(tmpdir(), "concise-cov-mcp-"));

function session(lines, { cwd = dir, args = [SERVER] } = {}) {
  const input = `${lines.map((line) => (typeof line === "string" ? line : show(line))).join("\n")}\n`;
  const result = spawnSync(process.execPath, args, { input, encoding: "utf8", env, cwd });
  const replies = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { replies, byId: new Map(replies.map((reply) => [reply.id, reply])), stderr: result.stderr };
}

console.log("\ncoverage: mcp server");

{
  check("a missing message is treated as a notification", (await handle(null)) === null, "handle(null)");
}

{
  const { byId } = session([
    call(1, "concise_dictionary", { action: "test", value: "zorb", fix: "zap", text: "a zorb" }),
    call(2, "concise_dictionary", { action: "list" }),
    call(3, "concise_settings_keys", { query: "maxRetries" }),
  ], { cwd: ROOT });
  const tested = JSON.parse(byId.get(1).result.content[0].text);
  check("dictionary test runs from the plugin directory without a project", !byId.get(1).result.isError && tested.matches.length === 1, byId.get(1));
  check("dictionary list from the plugin directory asks for cwd", byId.get(2).result.isError && /Pass cwd, the project directory/.test(byId.get(2).result.content[0].text), byId.get(2));
  check("keys needs no project", !byId.get(3).result.isError, byId.get(3));
}

{
  const { replies } = session(["", "   ", { jsonrpc: "2.0", id: 9, method: "ping" }]);
  check("blank lines get no reply", replies.length === 1 && replies[0].id === 9, replies);
}

{
  const preload = join(dir, "late-log.mjs");
  writeFileSync(preload, "process.once(\"beforeExit\", () => console.log(\"late log line\"));\n");
  const { replies, stderr } = session([{ jsonrpc: "2.0", id: 1, method: "ping" }], { args: ["--import", pathToFileURL(preload).href, SERVER] });
  check("console.log goes to stderr so stdout carries only JSON-RPC", stderr.includes("late log line") && replies.length === 1 && replies[0].id === 1, { replies, stderr });
}

rmSync(dir, { recursive: true, force: true });
