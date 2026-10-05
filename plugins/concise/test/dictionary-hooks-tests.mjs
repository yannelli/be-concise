import { CHECK_EDIT, CHECK_BASH, CHECK_REPLY, run, ok, bad, assertDenied, assertAllowed } from "./lib.mjs";
import { setup, cleanup, writeEvent, bashEvent, stopEvent, transcript, reasonOf, assertBlocked, assertEmpty } from "./features-lib.mjs";

const check = (name, condition, actual) => (condition ? ok(name) : bad(name, JSON.stringify(actual)));
const synergy = { id: "synergy", match: "startsWith", value: "synerg", fix: "name the shared part" };
const dictionary = (entries, extra = {}) => ({ features: { dictionary: { entries, ...extra } } });
const handback = (c, message, extra = {}) => ({
  hook_event_name: "PreToolUse", tool_name: "SubagentHandback", tool_input: { message },
  cwd: c.dir, session_id: c.sid, agent_id: "agent-h", agent_type: "worker", ...extra,
});
const subagentStop = (c, text, extra = {}) => ({
  hook_event_name: "SubagentStop", cwd: c.dir, session_id: c.sid, agent_id: "agent-s", agent_type: "worker", last_assistant_message: text, ...extra,
});

console.log("\ndictionary: hooks");

{
  const c = setup(dictionary([synergy]));
  const first = run(CHECK_EDIT, writeEvent(c, "notes.md", "We want synergy here.\n"));
  assertDenied("a dictionary term in a prose write is denied", first);
  const reason = reasonOf(first);
  check("the deny names the entry, the match, and the fix", reason.includes('[concise:dictionary:synergy] 1 match at line 1: "synergy" (name the shared part).'), reason);
  check("a dictionary-only deny has no reference file", !reason.includes("Reference:") && reason.includes("apply the fix named above"), reason);
  const kept = run(CHECK_EDIT, writeEvent(c, "notes.md", "We want synergy here.\n"));
  check("the identical write is kept after confirmation", kept.systemMessage?.includes("Kept after confirmation: 1 dictionary match"), kept);
}

{
  const c = setup(dictionary([synergy]));
  assertDenied("a dictionary term in a code comment is denied", run(CHECK_EDIT, writeEvent(c, "a.js", "// synergy\nconst a = 1;\n")));
  assertAllowed("code outside comments is not scanned", run(CHECK_EDIT, writeEvent(c, "b.js", "const synergy = 1;\n")));
  assertAllowed("concise-ignore on the line exempts it", run(CHECK_EDIT, writeEvent(c, "c.md", "We want synergy here. concise-ignore\n")));
}

{
  const c = setup({ ...dictionary([synergy]), allowList: { phrases: ["synergy"] } });
  assertAllowed("allowList drops a dictionary finding", run(CHECK_EDIT, writeEvent(c, "d.md", "We want synergy here.\n")));
}

{
  const c = setup({ ...dictionary([synergy]), ignoreGlobs: ["**/skip/**"] });
  assertAllowed("ignoreGlobs exempt a path from the dictionary", run(CHECK_EDIT, writeEvent(c, "skip/e.md", "We want synergy here.\n")));
}

{
  const c = setup(dictionary([{ ...synergy, hooks: ["stop"] }]));
  assertAllowed("an entry limited to stop skips edits", run(CHECK_EDIT, writeEvent(c, "f.md", "We want synergy here.\n")));
  const path = transcript(c, "t.jsonl", "We want synergy here.");
  assertBlocked("an entry limited to stop blocks a reply", run(CHECK_REPLY, stopEvent(c, path)));
}

{
  const c = setup(dictionary([{ id: "ticket", match: "regex", value: "\\bWIP\\b", fix: "finish the change first", scopes: ["commit"] }]));
  assertDenied("a commit-scoped entry denies a commit message", run(CHECK_BASH, bashEvent(c, "git commit -m 'WIP parser'")));
  assertAllowed("a commit-scoped entry skips a PR body", run(CHECK_BASH, bashEvent(c, "gh pr create --title t --body 'WIP parser'")));
}

{
  const c = setup(dictionary([synergy], { mode: "deny" }));
  const event = writeEvent(c, "g.md", "We want synergy here.\n");
  assertDenied("deny mode denies the first write", run(CHECK_EDIT, event));
  assertDenied("deny mode denies the identical retry", run(CHECK_EDIT, event));
}

{
  const c = setup(dictionary([synergy, { id: "broken", match: "regex", value: "(", fix: "f" }]));
  const result = run(CHECK_EDIT, writeEvent(c, "h.md", "We want synergy here.\n"));
  assertDenied("valid entries still run beside a broken one", result);
  check("the broken entry is reported once", result.systemMessage?.includes('dictionary entry "broken" ignored'), result);
}

{
  const c = setup(dictionary([synergy], { enabled: false }));
  assertAllowed("enabled false turns the dictionary off", run(CHECK_EDIT, writeEvent(c, "i.md", "We want synergy here.\n")));
}

console.log("\ndictionary: subagent reports");

{
  const c = setup(dictionary([{ ...synergy, hooks: ["subagentStop"] }]));
  const result = run(CHECK_REPLY, handback(c, "Found a synergy in the parser."));
  assertDenied("a SubagentHandback report with a term is denied", result);
  check("the deny calls it a report", reasonOf(result).includes("in your report"), result);
  assertEmpty("a clean SubagentHandback report passes", run(CHECK_REPLY, handback(c, "Found two parser bugs.")));
}

{
  const c = setup(dictionary([{ ...synergy, hooks: ["stop"] }]));
  assertEmpty("a stop-only entry skips SubagentHandback", run(CHECK_REPLY, handback(c, "Found a synergy.")));
}

{
  const c = setup({ ...dictionary([synergy]), subagentStop: { enabled: true, exemptAgentTypes: ["worker"] } });
  assertEmpty("exempt agent types skip SubagentHandback", run(CHECK_REPLY, handback(c, "Found a synergy.")));
}

for (const [name, extra, env] of [
  ["stopHook false", { stopHook: false }],
  ["subagentStop.enabled false", { subagentStop: { enabled: false } }],
  ["BEC_DISABLE_STOP_HOOK", {}, { BEC_DISABLE_STOP_HOOK: "1" }],
]) {
  const c = setup({ ...dictionary([synergy]), ...extra });
  assertEmpty(`${name} skips SubagentHandback`, run(CHECK_REPLY, handback(c, "Found a synergy."), env));
}

{
  const c = setup(dictionary([synergy]));
  assertEmpty("Claude internal agents with an empty type are skipped", run(CHECK_REPLY, subagentStop(c, "A synergy.", { agent_type: "" })));
  assertBlocked("a Codex subagent with an empty type is still checked", run(CHECK_REPLY, subagentStop(c, "A synergy.", { agent_type: "", turn_id: "turn-1" })));
  assertBlocked("a named Claude subagent is checked", run(CHECK_REPLY, subagentStop(c, "Another synergy.")));
}

cleanup();
