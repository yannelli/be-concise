import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { defaultConfig } from "../plugins/concise/hooks/lib/config.mjs";
import { scan } from "../plugins/concise/web/testing/scan.mjs";

const DASH = "\u2014";
const saved = {};
let cwd;

before(async () => {
  cwd = await mkdtemp(join(tmpdir(), "concise-scan-test-"));
  for (const key of ["HOME", "USERPROFILE", "XDG_CONFIG_HOME"]) saved[key] = process.env[key];
  process.env.HOME = cwd;
  process.env.USERPROFILE = cwd;
  process.env.XDG_CONFIG_HOME = join(cwd, ".config");
});

after(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(cwd, { recursive: true, force: true });
});

function config(changes = {}) {
  const base = defaultConfig();
  base.features.emDash.enabled = true;
  return { ...base, ...changes };
}

const edit = (tool_name, tool_input) => scan({ cwd, hook_event_name: "PreToolUse", tool_name, tool_input }, config(), "check-edit");
const dashes = (matches) => matches.filter((match) => match.category === "emDash");

test("scan reads Write, Edit, and MultiEdit text and tolerates missing fields", async () => {
  const text = `One ${DASH} two.`;
  assert.deepEqual(await scan({ cwd, tool_name: "Write" }, config(), "check-edit"), []);
  assert.deepEqual(await edit("Write", { content: text }), []);
  assert.deepEqual(await edit("Write", { file_path: join(cwd, "empty.md") }), []);
  assert.deepEqual(await edit("Edit", { file_path: join(cwd, "missing.md") }), []);
  assert.deepEqual(await edit("MultiEdit", { file_path: join(cwd, "missing.md") }), []);
  const multi = await edit("MultiEdit", { file_path: join(cwd, "missing.md"), edits: [{ old_string: "a" }, { new_string: text }] });
  assert.deepEqual(multi.map(({ category, chunk, scope, hook }) => [category, chunk, scope, hook]), [["emDash", 1, "files", "check-edit"]]);
  assert.match(multi[0].fix, /comma/);
  const code = await edit("Write", { file_path: join(cwd, "a.js"), content: `// One ${DASH} two.\nconst a = 1;` });
  assert.equal(code[0].scope, "comments");
});

test("scan reads apply_patch input and patches embedded in Bash", async () => {
  const patch = `*** Begin Patch\n*** Add File: patch.md\n+Text ${DASH} here.\n*** End Patch`;
  const fromInput = await edit("apply_patch", { input: patch });
  assert.equal(fromInput[0].path, join(cwd, "patch.md"));
  const fromBash = await edit("Bash", { command: `cat <<'EOF'\n${patch}\nEOF` });
  assert.equal(fromBash.length, 1);
  assert.deepEqual(await edit("Bash", { command: "ls" }), []);
  assert.deepEqual(await edit("Read", { file_path: join(cwd, "patch.md") }), []);
});

test("scan skips files marked concise-ignore-file in the new text or on disk", async () => {
  const text = `Text ${DASH} here.`;
  assert.deepEqual(await edit("Write", { file_path: join(cwd, "a.md"), content: `${text}\nconcise-ignore-file` }), []);
  const marked = join(cwd, "marked.md");
  await writeFile(marked, "concise-ignore-file\n");
  assert.deepEqual(await edit("Edit", { file_path: marked, new_string: text }), []);
  const plain = join(cwd, "plain.md");
  await writeFile(plain, "plain\n");
  assert.equal(dashes(await edit("Edit", { file_path: plain, new_string: text })).length, 1);
  assert.equal(dashes(await edit("Edit", { file_path: join(cwd, "absent.md"), new_string: text })).length, 1);
});

test("scan honors bypass phrases and reports dictionary matches", async () => {
  const rules = config({ bypass: { phrases: ["let it pass"], patterns: [] } });
  rules.features.dictionary.entries = [{ id: "utilize", match: "exact", value: "utilize", fix: "use" }];
  const input = { cwd, tool_name: "Write", tool_input: { file_path: join(cwd, "a.md"), content: "We utilize it." } };
  const found = await scan(input, rules, "check-edit");
  assert.deepEqual(found.map(({ category, fix }) => [category, fix]), [["dictionary:utilize", "use"]]);
  input.tool_input.content = "We utilize it. let it pass";
  assert.deepEqual(await scan(input, rules, "check-edit"), []);
});

test("scan checks commit messages, PR bodies, and skips other Bash commands", async () => {
  const bash = (command, rules = config()) => scan({ cwd, tool_name: "Bash", tool_input: { command } }, rules, "check-bash");
  assert.deepEqual(await scan({ cwd, tool_name: "Bash" }, config(), "check-bash"), []);
  assert.deepEqual(await bash("npm test"), []);
  assert.deepEqual(await bash(`git commit -m 'fix: a ${DASH} b' # concise-ignore`), []);
  assert.deepEqual(await bash(`git commit -m 'fix: a ${DASH} b'`, config({ bypass: { phrases: ["fix:"] } })), []);
  const commit = await bash(`git commit -m 'fix: a ${DASH} b'`);
  assert.deepEqual(commit.map((match) => match.scope), ["commit"]);
  const gh = await bash(`gh pr create --title t --body 'Body ${DASH} text.'`);
  assert.deepEqual(gh.map((match) => match.scope), ["gh"]);
  assert.deepEqual(await bash("gh pr create --title t"), []);
});

test("scan reads the last assistant reply from Claude and Codex transcripts", async () => {
  const transcript = join(cwd, "transcript.jsonl");
  const reply = async (lines, rules = config(), event = "Stop") => {
    await writeFile(transcript, lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n"));
    return scan({ cwd, hook_event_name: event, transcript_path: transcript }, rules, "check-reply");
  };
  const text = `Reply ${DASH} here.`;
  const claude = await reply([{ message: { role: "assistant", content: [{ type: "text", text }] } }, "{broken"]);
  assert.deepEqual(claude.map(({ scope, path }) => [scope, path]), [["reply", "reply.md"]]);
  const codex = await reply([{ payload: { role: "assistant", content: [{ type: "output_text", text }] } }, { role: "user", content: [] }]);
  assert.equal(codex.length, 1);
  const bare = await reply([{ role: "assistant", message: { content: [{ type: "output_text", text }] } }, { role: "assistant" }], config(), "SubagentStop");
  assert.equal(bare.length, 1);
  assert.deepEqual(await reply([{ role: "user", content: [{ type: "text", text }] }]), []);
  assert.deepEqual(await reply([{ message: { role: "assistant", content: [{ type: "text", text: `${text} skip` }] } }], config({ bypass: { phrases: ["skip"] } })), []);
  const quiet = config();
  quiet.features.emDash.replies = false;
  assert.deepEqual(await reply([{ message: { role: "assistant", content: [{ type: "text", text }] } }], quiet), []);
  assert.deepEqual(await scan({ cwd, hook_event_name: "Stop", transcript_path: transcript }, config({ stopHook: false }), "check-reply"), []);
  assert.deepEqual(await scan({ cwd, hook_event_name: "Stop" }, config(), "check-reply"), []);
});

test("scan reads a subagent handback message as a reply", async () => {
  const handback = (tool_input, rules = config()) => scan({ cwd, hook_event_name: "PreToolUse", tool_name: "SubagentHandback", tool_input }, rules, "check-reply");
  const matches = await handback({ message: `Report ${DASH} here.` });
  assert.deepEqual(matches.map(({ category, scope, path, hook }) => [category, scope, path, hook]), [["emDash", "reply", "reply.md", "check-reply"]]);
  assert.deepEqual(await handback({}), []);
  const inline = await scan({ cwd, hook_event_name: "Stop", last_assistant_message: `Reply ${DASH} here.` }, config(), "check-reply");
  assert.deepEqual(inline.map(({ category, scope }) => [category, scope]), [["emDash", "reply"]]);
  assert.deepEqual(await handback({ message: `Report ${DASH} here.` }, config({ stopHook: false })), []);
  const scoped = config();
  scoped.features.dictionary = { enabled: true, mode: "deny", entries: [{ id: "sub", match: "exact", value: "report", fix: "note", hooks: ["subagentStop"] }, { id: "main", match: "exact", value: "here", fix: "there", hooks: ["stop"] }] };
  assert.deepEqual((await handback({ message: "Report here." }, scoped)).map(({ category }) => category), ["dictionary:sub"]);
});
