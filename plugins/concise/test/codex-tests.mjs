import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECK_EDIT, run, assertDenied, assertAllowed, assertFlagged } from "./lib.mjs";

const workDir = mkdtempSync(join(tmpdir(), "concise-codex-test-"));
const sessionId = `codex-${Date.now()}`;

const LONG_COMMENT = ["// line 1", "// line 2", "// line 3", "// line 4", "// line 5"];
const plus = (lines) => lines.map((l) => `+${l}`).join("\n");

function patch(...hunks) {
  return `*** Begin Patch\n${hunks.join("\n")}\n*** End Patch`;
}

function patchEvent(body, sid, cwd = workDir) {
  return { hook_event_name: "PreToolUse", turn_id: "turn-1", tool_name: "apply_patch", tool_input: { command: body }, cwd, session_id: sid };
}

function bashEvent(command, sid) {
  return { tool_name: "Bash", tool_input: { command }, cwd: workDir, session_id: sid };
}

console.log("\ncheck-edit.mjs (Codex apply_patch)");

{
  const body = patch(`*** Add File: ${join(workDir, "long.ts")}`, plus([...LONG_COMMENT, "export const x = 1;"]));
  assertDenied("Add File with a 5-line comment denied", run(CHECK_EDIT, patchEvent(body, `${sessionId}-1`)));
}

{
  const body = patch(`*** Add File: ${join(workDir, "short.ts")}`, plus(["// one line", "export const x = 1;"]));
  assertAllowed("Add File with a 1-line comment allowed", run(CHECK_EDIT, patchEvent(body, `${sessionId}-2`)));
}

{
  const body = patch(`*** Update File: ${join(workDir, "upd.ts")}`, "@@ f", " const a = 1;", plus(LONG_COMMENT), " const b = 2;");
  assertDenied("Update File hunk adding a 5-line comment denied", run(CHECK_EDIT, patchEvent(body, `${sessionId}-3`)));
}

{
  const body = patch(
    `*** Update File: ${join(workDir, "split.ts")}`,
    "@@ f",
    plus(["// note a", "const a = 1;"]),
    " keep",
    plus(["// note b", "const b = 2;"]),
    "-// old 1",
    "-// old 2",
    "-// old 3",
    plus(["// note c"]),
  );
  assertAllowed("separate 1-line comments across hunks allowed, removed lines not counted", run(CHECK_EDIT, patchEvent(body, `${sessionId}-4`)));
}

{
  const lines = Array.from({ length: 320 }, (_, i) => `const line${i} = ${i};`);
  const body = patch(`*** Add File: ${join(workDir, "big.ts")}`, plus(lines));
  assertDenied("320-line Add File denied", run(CHECK_EDIT, patchEvent(body, `${sessionId}-5`)));
}

{
  const lines = Array.from({ length: 320 }, (_, i) => `const line${i} = ${i};`);
  const body = patch(`*** Update File: ${join(workDir, "grow.ts")}`, "@@ f", plus(lines));
  assertAllowed("320 added lines in an Update File allowed (file rule is whole-file only)", run(CHECK_EDIT, patchEvent(body, `${sessionId}-6`)));
}

{
  const body = patch("*** Add File: node_modules/pkg/index.js", plus(LONG_COMMENT));
  assertAllowed("relative path resolved against cwd for ignoreGlobs", run(CHECK_EDIT, patchEvent(body, `${sessionId}-7`)));
}

{
  const body = patch(`*** Update File: ${join(workDir, "old.txt")}`, `*** Move to: ${join(workDir, "new.py")}`, "@@", plus(["# a", "# b", "# c"]));
  assertDenied("Move to: target extension decides the comment token", run(CHECK_EDIT, patchEvent(body, `${sessionId}-8`)));
}

{
  const body = patch(`*** Delete File: ${join(workDir, "gone.ts")}`);
  assertAllowed("Delete File only allowed", run(CHECK_EDIT, patchEvent(body, `${sessionId}-9`)));
}

{
  const p = join(workDir, "marked.ts");
  writeFileSync(p, "// concise-ignore-file\nexport const x = 1;\n");
  const body = patch("*** Update File: marked.ts", "@@", plus(LONG_COMMENT));
  assertAllowed("concise-ignore-file on disk exempts an Update File (relative path)", run(CHECK_EDIT, patchEvent(body, `${sessionId}-10`)));
}

{
  const body = patch(`*** Add File: ${join(workDir, "ign.ts")}`, plus(["// concise-ignore", ...LONG_COMMENT]));
  assertAllowed("concise-ignore inside the comment allowed", run(CHECK_EDIT, patchEvent(body, `${sessionId}-11`)));
}

{
  const body = patch(
    `*** Add File: ${join(workDir, "clean.ts")}`,
    plus(["export const a = 1;"]),
    `*** Add File: ${join(workDir, "dirty.ts")}`,
    plus(LONG_COMMENT),
  );
  const result = run(CHECK_EDIT, patchEvent(body, `${sessionId}-12`));
  assertDenied("multi-file patch denied when one file violates", result);
  if (!result.hookSpecificOutput?.permissionDecisionReason?.includes("dirty.ts")) {
    console.log("  FAIL - reason names the violating file");
  }
}

{
  const body = patch(`*** Add File: ${join(workDir, "sh.ts")}`, plus(LONG_COMMENT));
  const command = `apply_patch <<'EOF'\n${body}\nEOF`;
  assertDenied("apply_patch heredoc inside a Bash command denied", run(CHECK_EDIT, bashEvent(command, `${sessionId}-13`)));
  assertAllowed("Bash command without a patch ignored by check-edit", run(CHECK_EDIT, bashEvent("ls -la", `${sessionId}-14`)));
}

{
  const codexDir = mkdtempSync(join(tmpdir(), "concise-codex-cfg-"));
  mkdirSync(join(codexDir, ".codex"));
  writeFileSync(join(codexDir, ".codex", "concise.json"), JSON.stringify({ maxCommentLines: 10 }));
  const body = patch(`*** Add File: ${join(codexDir, "cfg.ts")}`, plus(LONG_COMMENT));
  assertAllowed(".codex/concise.json thresholds respected", run(CHECK_EDIT, patchEvent(body, `${sessionId}-15`, codexDir)));
  rmSync(codexDir, { recursive: true, force: true });
}

{
  const sid = `${sessionId}-retry`;
  const body = patch(`*** Add File: ${join(workDir, "retry.ts")}`, plus(LONG_COMMENT));
  assertDenied("apply_patch retry attempt 1 denied", run(CHECK_EDIT, patchEvent(body, sid)));
  assertDenied("apply_patch retry attempt 2 denied", run(CHECK_EDIT, patchEvent(body, sid)));
  const third = run(CHECK_EDIT, patchEvent(body, sid));
  assertAllowed("apply_patch retry attempt 3 allowed-with-flag", third);
  assertFlagged("attempt 3 carries the flag in systemMessage and additionalContext", third);
}

rmSync(workDir, { recursive: true, force: true });
