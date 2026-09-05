import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CHECK_EDIT, CHECK_BASH, CHECK_REPLY, ROOT, run, ok, bad, assertDenied } from "./lib.mjs";
import { setup, cleanup, dashOn, bothOn, writeEvent, bashEvent, stopEvent, transcript, assertEmpty, assertAsked, assertBlocked } from "./features-lib.mjs";
import { deny, ask, flagged, mergeFlag } from "../hooks/lib/respond.mjs";

function check(name, condition, result) {
  if (condition) ok(name);
  else bad(name, JSON.stringify(result));
}

function modelHas(name, result, text) {
  check(name, result.hookSpecificOutput?.additionalContext?.includes(text), result);
}

const codex = (event) => ({ ...event, turn_id: "turn-1", model: "gpt-6-astra", permission_mode: "default" });
const dirty = "Ship it — fast.";

console.log("\nhook contracts (agent-visible notices)");

{
  const c = setup(dashOn({ mode: "ask" }));
  const result = run(CHECK_EDIT, writeEvent(c, "note.md", dirty));
  assertAsked("Claude ask retains its permission prompt", result);
  modelHas("Claude also receives the ask finding", result, "em dash");
}

{
  const c = setup(dashOn({ mode: "ask" }));
  const event = codex({ ...writeEvent(c, "note.md", dirty), tool_name: "apply_patch", tool_input: {
    command: "*** Begin Patch\n*** Add File: note.md\n+Ship it — fast.\n*** End Patch",
  } });
  const result = run(CHECK_EDIT, event);
  assertDenied("Codex ask blocks the patch with a supported decision", result);
  check("Codex ask explains how to revise or request approval", result.hookSpecificOutput.permissionDecisionReason.includes("After approval, retry with concise-ignore"), result);
  assertDenied("repeating a Codex ask does not grant approval", run(CHECK_EDIT, event));
  const revised = { ...event, tool_input: { command: event.tool_input.command.replace(dirty, "Ship it fast.") } };
  assertEmpty("Codex can retry the corrected patch", run(CHECK_EDIT, revised));
  const kept = { ...event, tool_input: { command: event.tool_input.command.replace(dirty, `${dirty} concise-ignore`) } };
  assertEmpty("the documented approval override passes", run(CHECK_EDIT, kept));
}

{
  const c = setup(dashOn({ mode: "ask" }));
  const event = codex(bashEvent(c, 'git commit -m "Ship it — fast."'));
  assertDenied("Codex Bash ask also returns a supported deny", run(CHECK_BASH, event));
  const softened = run(CHECK_BASH, event, { BEC_HOOK_SOFT_FAIL: "1" });
  check("Codex ask respects soft fail", !softened.hookSpecificOutput?.permissionDecision, softened);
  modelHas("Codex soft fail carries the finding", softened, "em dash");
}

{
  for (const decision of [deny("[concise] trim it"), ask("[concise] confirm it")]) {
    const result = mergeFlag("[concise] first notice", { ...decision, systemMessage: "[concise] second notice" });
    check("merging flags preserves the permission decision", result.hookSpecificOutput.permissionDecision === decision.hookSpecificOutput.permissionDecision, result);
    modelHas("the first merged notice reaches the model", result, "first notice");
    modelHas("the second merged notice reaches the model", result, "second notice");
    if (decision.hookSpecificOutput.additionalContext) modelHas("merging preserves ask context", result, "confirm it");
  }
  const result = mergeFlag("[concise] first notice", flagged("[concise] second notice"));
  check("an existing flag is not duplicated", result.hookSpecificOutput.additionalContext === result.systemMessage, result);
}

{
  const c = setup({});
  const event = codex(writeEvent(c, "clean.ts", "export const x = 1;\n"));
  const first = run(CHECK_EDIT, event, { BEC_CONFIG_JSON: "{broken" });
  modelHas("config failures reach the model", first, "config ignored: BEC_CONFIG_JSON");
  assertEmpty("config warnings are still sent once", run(CHECK_EDIT, event, { BEC_CONFIG_JSON: "{broken" }));
}

{
  const c = setup({ ...dashOn(), allowList: { patterns: ["(unclosed"] } });
  const event = writeEvent(c, "note.md", dirty);
  const first = run(CHECK_EDIT, event);
  assertDenied("a warning preserves a style deny", first);
  modelHas("pattern warnings reach the model alongside a deny", first, "allow list pattern");
  const another = setup({ ...dashOn(), allowList: { patterns: ["(unclosed"] } });
  const soft = run(CHECK_EDIT, writeEvent(another, "note.md", dirty), { BEC_HOOK_SOFT_FAIL: "1" });
  modelHas("soft fail preserves model-visible warnings", soft, "allow list pattern");
  modelHas("soft fail preserves model-visible findings", soft, "em dash");
}

{
  const c = setup({});
  const result = run(CHECK_EDIT, { ...writeEvent(c, "bad.ts", null), tool_name: "MultiEdit", tool_input: { file_path: join(c.dir, "bad.ts"), edits: {} } });
  modelHas("internal errors reach the model on PreToolUse", result, "internal error, allowing");
}

console.log("\nhook contracts (Stop input and continuation)");

for (const host of ["Claude", "Codex"]) {
  const c = setup(bothOn());
  const stale = transcript(c, "stale.jsonl", "Ship it fast.");
  const event = { ...stopEvent(c, stale), last_assistant_message: dirty };
  if (host === "Codex") Object.assign(event, codex(event));
  const first = run(CHECK_REPLY, event);
  assertBlocked(`${host} scans the supplied reply before the stale transcript`, first);
  check(`${host} gets an actionable continuation reason`, first.reason.includes("Fix:") && first.reason.includes("Rewrite the reply"), first);
  assertEmpty(`${host} accepts the revised reply`, run(CHECK_REPLY, { ...event, last_assistant_message: "Ship it fast.", stop_hook_active: true }));
  assertEmpty(`${host} treats an empty supplied reply as authoritative`, run(CHECK_REPLY, { ...event, last_assistant_message: "" }));
  const withoutTranscript = { ...event, session_id: `${c.sid}-direct`, transcript_path: null };
  assertBlocked(`${host} checks a reply without a transcript`, run(CHECK_REPLY, withoutTranscript));
  const confirmed = run(CHECK_REPLY, { ...withoutTranscript, stop_hook_active: true });
  check(`${host} confirmation ends the turn without another continuation`, !confirmed.decision && !confirmed.hookSpecificOutput && confirmed.systemMessage?.includes("Kept after confirmation"), confirmed);
  const soft = run(CHECK_REPLY, { ...withoutTranscript, session_id: `${c.sid}-soft` }, { BEC_HOOK_SOFT_FAIL: "1" });
  check(`${host} soft fail ends the turn with a UI notice`, !soft.decision && !soft.hookSpecificOutput && soft.systemMessage?.includes("soft-fail"), soft);
}

{
  const c = setup(dashOn());
  const path = join(c.dir, "codex.jsonl");
  writeFileSync(path, [
    { type: "response_item", payload: { role: "assistant", channel: "final", content: [{ type: "output_text", text: "First block." }, { type: "output_text", text: dirty }] } },
    { type: "response_item", payload: { role: "assistant", channel: "analysis", content: [{ type: "output_text", text: "Clean reasoning." }] } },
  ].map((record) => JSON.stringify(record)).join("\n"));
  assertBlocked("Codex transcript fallback scans every final text block", run(CHECK_REPLY, codex({ ...stopEvent(c, path), last_assistant_message: null })));
  const claudePath = join(c.dir, "claude.jsonl");
  writeFileSync(claudePath, JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "First block." }, { type: "text", text: dirty }] } }));
  assertBlocked("Claude transcript fallback scans every text block", run(CHECK_REPLY, { ...stopEvent(c, claudePath), session_id: `${c.sid}-claude` }));
}

{
  const c = setup({});
  const event = bashEvent(c, "npm test");
  Object.assign(event.tool_input, { timeout: 1234, description: "Run affected tests", run_in_background: false });
  const result = spawnSync("bash", [join(ROOT, "hooks/PreToolUse-test-filter.sh")], {
    input: JSON.stringify(event), encoding: "utf8", env: { ...process.env, HOME: c.dir },
  });
  check("the test filter exits successfully", result.status === 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  check("the test filter preserves other Bash input fields", output.updatedInput.timeout === 1234 && output.updatedInput.description === "Run affected tests" && output.updatedInput.run_in_background === false, output);
  check("the filter retains the Codex rewrite contract", output.permissionDecision === "allow" && output.updatedInput.command.includes("TF_CMD="), output);
}

cleanup();
