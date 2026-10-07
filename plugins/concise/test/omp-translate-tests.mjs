import { ok, bad } from "./lib.mjs";
import {
  contextOf,
  editCall,
  hashlineTargets,
  messageText,
  patchModeTargets,
  patchText,
  replyText,
  sloppyTargets,
  toolCallResult,
} from "../omp/translate.mjs";

const show = (value) => JSON.stringify(value);
const eq = (name, actual, expected) => (show(actual) === show(expected) ? ok(name) : bad(name, `${show(actual)} !== ${show(expected)}`));

console.log("\nomp: edit payload translation");

eq(
  "hashline sections keep + rows as chunks and drop removed files",
  hashlineTargets(
    [
      "*** Begin Patch",
      "+ignored before a header",
      "[src/a.ts#1A2B]",
      "PUT 4.=4:",
      "+// one",
      "+",
      "++plus",
      "PUT >9:",
      "+next",
      "MV \"lib/b c.ts\"",
      "[gone.ts#FFFF]",
      "REM",
      "[c.ts#00aa]\r",
      "PUT >$:",
      "+tail",
      "MV 'd.ts'",
      "[e.ts#1234]",
      "MV \"bad\\q\"",
      "*** End Patch",
    ].join("\n"),
  ),
  [
    { path: "lib/b c.ts", chunks: ["// one\n\n+plus", "next"], wholeFile: false },
    { path: "d.ts", chunks: ["tail"], wholeFile: false },
    { path: "bad\\q", chunks: [], wholeFile: false },
  ],
);

eq(
  "sloppy Replace and Insert bodies become chunks; Find bodies do not",
  sloppyTargets(
    [
      "body before any header",
      "*** Edit File: src/a.ts",
      "*** Find",
      "old();",
      "*** Replace",
      "// new",
      "new();",
      "*** Find",
      "x",
      "*** Replace",
      "",
      "*** Edit File:",
      "*** Find",
      "y",
      "*** Insert After",
      "z();",
      "*** End Patch",
      "dropped",
      "*** Edit File: \"b c.ts\" all",
      "*** Find",
      "q",
      "*** Insert Before",
      "w();",
      "*** Edit File:",
    ].join("\n"),
  ),
  [
    { path: "src/a.ts", chunks: ["// new\nnew();", "z();"], wholeFile: false },
    { path: "b c.ts", chunks: ["w();"], wholeFile: false },
  ],
);
eq("a bare sloppy opener with no file is dropped", sloppyTargets("*** Edit File:\n*** Replace\nx"), []);

eq("patch mode needs a path", patchModeTargets({ edits: [] }), []);
eq("patch mode needs an edit list", patchModeTargets({ path: "a.ts" }), []);
eq(
  "patch mode reads create, update, rename, and skips delete",
  patchModeTargets({
    path: "a.ts",
    edits: [
      null,
      { op: "delete" },
      { op: "create", diff: "// whole\nfile" },
      { op: "update", diff: "@@\n context\n+// added\n+line\n-old\n+++ b/header\n+again" },
      { op: "update", rename: "b.ts", diff: "@@\n+moved" },
    ],
  }),
  [
    { path: "a.ts", chunks: ["// whole\nfile"], wholeFile: true },
    { path: "a.ts", chunks: ["// added\nline", "again"], wholeFile: false },
    { path: "b.ts", chunks: ["moved"], wholeFile: false },
  ],
);

eq(
  "patchText writes Add and Update sections",
  patchText([
    { path: "n.ts", chunks: ["a\nb"], wholeFile: true },
    { path: "u.ts", chunks: ["c", "d"], wholeFile: false },
  ]),
  "*** Begin Patch\n*** Add File: n.ts\n@@\n+a\n+b\n*** Update File: u.ts\n@@\n+c\n@@\n+d\n*** End Patch",
);

console.log("\nomp: tool call mapping");

eq("write maps to Write with an absolute path", editCall("write", { path: "[src/a.ts#1A2B]", content: "x" }, "/w"), {
  tool_name: "Write",
  tool_input: { file_path: "/w/src/a.ts", content: "x" },
});
eq("write to an internal URL is skipped", editCall("write", { path: "local://notes.md", content: "x" }, "/w"), null);
eq("write without content is skipped", editCall("write", { path: "a.ts" }, "/w"), null);
eq("write without a path is skipped", editCall("write", null, "/w"), null);
eq("other tools are skipped", editCall("read", { path: "a.ts" }, "/w"), null);
eq("replace mode maps to Edit", editCall("edit", { path: "a.ts", new_string: "n" }, "/w"), {
  tool_name: "Edit",
  tool_input: { file_path: "/w/a.ts", old_string: "", new_string: "n" },
});
eq("patch mode maps to apply_patch", editCall("edit", { path: "a.ts", edits: [{ op: "update", diff: "@@\n+x" }] }, "/w"), {
  tool_name: "apply_patch",
  tool_input: { input: "*** Begin Patch\n*** Update File: a.ts\n@@\n+x\n*** End Patch" },
});
const applyPatch = "*** Begin Patch\n*** Add File: a.ts\n+x\n*** End Patch";
eq("apply_patch text passes through", editCall("apply_patch", { input: applyPatch }, "/w"), {
  tool_name: "apply_patch",
  tool_input: { input: applyPatch },
});
eq("sloppy text converts", editCall("edit", { input: "*** Edit File: a.ts\n*** Find\nx\n*** Replace\ny" }, "/w").tool_input.input, "*** Begin Patch\n*** Update File: a.ts\n@@\n+y\n*** End Patch");
eq("hashline text converts", editCall("edit", { input: "[a.ts#1A2B]\nPUT 1.=1:\n+y", path: "a.ts" }, "/w").tool_input.input, "*** Begin Patch\n*** Update File: a.ts\n@@\n+y\n*** End Patch");
eq("an edit that writes no text is skipped", editCall("edit", { input: "[a.ts#1A2B]\nCUT 1.=2" }, "/w"), null);

console.log("\nomp: replies and results");

eq("messageText skips a missing message", messageText(undefined), null);
eq("messageText skips user messages", messageText({ role: "user", content: "x" }), null);
eq("messageText reads string content", messageText({ role: "assistant", content: "hi" }), "hi");
eq("messageText skips other content", messageText({ role: "assistant", content: 3 }), null);
eq("messageText skips tool-only content", messageText({ role: "assistant", content: [{ type: "toolCall" }] }), null);
eq("messageText joins text blocks", messageText({ role: "assistant", content: [{ type: "text", text: "a" }, null, { type: "text", text: "b" }] }), "a\nb");
eq("replyText prefers the final message", replyText({ last_assistant_message: { role: "assistant", content: [{ type: "toolCall" }] }, messages: [{ role: "assistant", content: "old" }] }), null);
eq("replyText falls back to the last assistant entry", replyText({ messages: [{ role: "assistant", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }] }), "b");
eq("replyText handles a missing message list", replyText({}), null);

eq("contextOf reads additionalContext", contextOf({ hookSpecificOutput: { additionalContext: "c" }, systemMessage: "s" }), "c");
eq("contextOf falls back to systemMessage", contextOf({ systemMessage: "s" }), "s");
eq("contextOf is empty otherwise", contextOf(undefined), "");

const denyResult = { hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "[concise] no" } };
eq("a deny blocks with its reason", toolCallResult([{}, denyResult], {}), { block: true, reason: "[concise] no" });
eq("a deny without a reason still blocks", toolCallResult([{ hookSpecificOutput: { permissionDecision: "deny" } }], {}), { block: true, reason: "[concise] denied" });
eq(
  "a rewrite keeps the other bash fields and contexts merge once",
  toolCallResult([{ hookSpecificOutput: { updatedInput: { command: "wrapped" } } }, { systemMessage: "a" }, { systemMessage: "a" }, { systemMessage: "b" }], { command: "npm test", timeout: 5 }),
  { input: { command: "wrapped", timeout: 5 }, additionalContext: "a\n\nb" },
);
eq("nothing to report is undefined", toolCallResult([{}, null], {}), undefined);
