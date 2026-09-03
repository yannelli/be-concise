#!/usr/bin/env node
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECK_EDIT, CHECK_BASH, run, assertDenied, assertAllowed, assertFlagged, summary } from "./lib.mjs";

const workDir = mkdtempSync(join(tmpdir(), "concise-test-"));
const sessionId = `test-${Date.now()}`;

function writeFixture(name, content) {
  const p = join(workDir, name);
  writeFileSync(p, content);
  return p;
}

const LONG_COMMENT = "// line 1\n// line 2\n// line 3\n// line 4\n// line 5\n";

function writeEvent(filePath, content, sid) {
    return { tool_name: "Write", tool_input: { file_path: filePath, content }, cwd: workDir, session_id: sid };
}

function editEvent(filePath, newString, sid) {
    return {
        tool_name: "Edit",
        tool_input: { file_path: filePath, old_string: "x", new_string: newString },
        cwd: workDir,
        session_id: sid,
    };
}

function multiEditEvent(filePath, newStrings, sid) {
    return {
        tool_name: "MultiEdit",
        tool_input: { file_path: filePath, edits: newStrings.map((s) => ({ old_string: "x", new_string: s })) },
        cwd: workDir,
        session_id: sid,
    };
}

console.log("check-edit.mjs");

{
    const p = join(workDir, "short.ts");
    assertAllowed(
        "short comment allowed",
        run(CHECK_EDIT, writeEvent(p, "// one line\nexport const x = 1;\n", `${sessionId}-1`)),
    );
}

{
    const p = join(workDir, "long-comment.ts");
    assertDenied("5-line comment denied on Write", run(CHECK_EDIT, writeEvent(p, LONG_COMMENT, `${sessionId}-2`)));
}

{
    const p = join(workDir, "ignored-comment.ts");
    const content = `// line 1 concise-ignore\n${LONG_COMMENT}`;
    assertAllowed("concise-ignore comment allowed", run(CHECK_EDIT, writeEvent(p, content, `${sessionId}-3`)));
}

{
    const p = join(workDir, "block-comment.ts");
    const content = "/*\n * line 2\n * line 3\n * line 4\n */\nexport const x = 1;\n";
    assertDenied("5-line block comment denied", run(CHECK_EDIT, writeEvent(p, content, `${sessionId}-6`)));
}

{
    const p = join(workDir, "big.ts");
    const content = Array.from({ length: 320 }, (_, i) => `const line${i} = ${i};`).join("\n") + "\n";
    assertDenied("320-line Write denied", run(CHECK_EDIT, writeEvent(p, content, `${sessionId}-4`)));
}

{
  const nmDir = join(workDir, "node_modules", "pkg");
  mkdirSync(nmDir, { recursive: true });
    assertAllowed(
        "node_modules path ignored",
        run(CHECK_EDIT, writeEvent(join(nmDir, "index.js"), LONG_COMMENT, `${sessionId}-5`)),
    );
}

{
    const p = writeFixture("marked.ts", "// concise-ignore-file\nexport const x = 1;\n");
    assertAllowed(
        "concise-ignore-file in the existing file exempts an Edit",
        run(CHECK_EDIT, editEvent(p, LONG_COMMENT, `${sessionId}-7`)),
    );
}

{
    const p = join(workDir, "glob-strings.ts");
    const content = 'const ignoreGlobs = [\n  "**/node_modules/**",\n  "**/*.generated.*",\n  "**/*.min.js",\n];\n';
    assertAllowed(
        'a "/*" inside a string is not a comment opener',
        run(CHECK_EDIT, writeEvent(p, content, `${sessionId}-13`)),
    );
}

console.log("\ncheck-edit.mjs (only the text being written)");

{
    const p = writeFixture("pre-existing.ts", `${LONG_COMMENT}export const x = 1;\n`);
    assertAllowed(
        "clean Edit into a file with an old long comment",
        run(CHECK_EDIT, editEvent(p, "const y = 2;", `${sessionId}-8`)),
    );
}

{
    const content = Array.from({ length: 320 }, (_, i) => `const line${i} = ${i};`).join("\n") + "\n";
    const p = writeFixture("already-big.ts", content);
    assertAllowed(
        "Edit into an already-oversized file allowed",
        run(CHECK_EDIT, editEvent(p, "const y = 2;", `${sessionId}-9`)),
    );
}

{
    const p = join(workDir, "edit-comment.ts");
    assertDenied(
        "long comment in Edit new_string denied",
        run(CHECK_EDIT, editEvent(p, LONG_COMMENT, `${sessionId}-10`)),
    );
}

{
    const p = join(workDir, "multi.ts");
    assertDenied(
        "long comment in one MultiEdit chunk denied",
        run(CHECK_EDIT, multiEditEvent(p, ["const y = 2;", LONG_COMMENT], `${sessionId}-11`)),
    );
}

{
    const p = join(workDir, "multi-split.ts");
    const chunks = ["// a note\nconst y = 2;", "// another note\nconst z = 3;", "// a third\nconst w = 4;"];
    assertAllowed(
        "separate one-line comments across MultiEdit chunks allowed",
        run(CHECK_EDIT, multiEditEvent(p, chunks, `${sessionId}-12`)),
    );
}

console.log("\ncheck-edit.mjs (retry counter)");

{
    const p = join(workDir, "retry.ts");
    const sid = `${sessionId}-retry`;
    assertDenied("retry attempt 1 denied", run(CHECK_EDIT, writeEvent(p, LONG_COMMENT, sid)));
    assertDenied("retry attempt 2 denied", run(CHECK_EDIT, writeEvent(p, LONG_COMMENT, sid)));
    const third = run(CHECK_EDIT, writeEvent(p, LONG_COMMENT, sid));
    assertAllowed("retry attempt 3 allowed-with-flag", third);
    assertFlagged("attempt 3 explains why it was allowed", third);
}

{
    const p = join(workDir, "reset.ts");
    const sid = `${sessionId}-reset`;
    assertDenied("violation before a clean write is denied", run(CHECK_EDIT, writeEvent(p, LONG_COMMENT, sid)));
    assertAllowed("clean write resets the counter", run(CHECK_EDIT, writeEvent(p, "const x = 1;\n", sid)));
    assertDenied(
        "counter restarts, so the next violation is denied again",
        run(CHECK_EDIT, writeEvent(p, LONG_COMMENT, sid)),
    );
    assertDenied("and the one after it too", run(CHECK_EDIT, writeEvent(p, LONG_COMMENT, sid)));
}

console.log("\ncheck-bash.mjs");

function bashEvent(command, sid) {
  return { tool_name: "Bash", tool_input: { command }, cwd: workDir, session_id: sid };
}

function heredocCommand(title, body) {
    return `gh pr create --title "${title}" --body "$(cat <<'EOF'\n${body}\nEOF\n)"`;
}

const VERBOSE_BODY =
    "This is a long paragraph of prose about the change with several sentences in a row explaining everything at length.\n\nAnd here is a second unrelated paragraph continuing to explain more things in prose form as well.";

{
    assertDenied(
        "2-paragraph PR body denied",
        run(CHECK_BASH, bashEvent(heredocCommand("x", VERBOSE_BODY), `${sessionId}-pr1`)),
    );
}

{
    const body =
        "## Summary\n- Adds the thing\n- Fixes the bug\n\n## Test plan\n- [ ] Run tests\n- [ ] Verify manually";
    assertAllowed(
        "structured PR body allowed",
        run(CHECK_BASH, bashEvent(heredocCommand("x", body), `${sessionId}-pr2`)),
    );
}

{
    assertAllowed("unrelated bash command allowed", run(CHECK_BASH, bashEvent("ls -la", `${sessionId}-ls`)));
}

{
    const body =
        "This is a long paragraph of prose. concise-ignore\n\nAnother paragraph here too, with more prose going on and on.";
    assertAllowed(
        "concise-ignore in PR body allowed",
        run(CHECK_BASH, bashEvent(heredocCommand("x", body), `${sessionId}-pr3`)),
    );
}

{
  const command = 'gh pr create --title "x" --body "One short sentence. Two short sentence."';
    assertAllowed("single-paragraph quoted PR body allowed", run(CHECK_BASH, bashEvent(command, `${sessionId}-pr4`)));
}

{
    // A line starting with the terminator word used to truncate the capture and hide the rest.
    const body =
        "Line one of prose mentioning something here.\n\nEOF markers are how heredocs end, which is why this line used to break the capture.\n\nA third paragraph pushing well past the limit.";
    assertDenied(
        "heredoc body with a bare EOF line still scanned in full",
        run(CHECK_BASH, bashEvent(heredocCommand("x", body), `${sessionId}-pr5`)),
    );
}

{
    const body = "\tIndented heredoc prose paragraph one.\n\n\tAnd a second paragraph of prose here.";
    const command = `gh pr create --title "x" --body "$(cat <<-'EOF'\n${body}\n\tEOF\n)"`;
    assertDenied("tab-indented <<- heredoc parsed", run(CHECK_BASH, bashEvent(command, `${sessionId}-pr6`)));
}

console.log("\ncheck-bash.mjs (retry counter)");

{
    const sid = `${sessionId}-pr-retry`;
    const first = heredocCommand("first pr", VERBOSE_BODY);
    const second = heredocCommand("a different pr", VERBOSE_BODY);
    assertDenied("PR retry attempt 1 denied", run(CHECK_BASH, bashEvent(first, sid)));
    assertDenied("PR retry attempt 2 denied", run(CHECK_BASH, bashEvent(first, sid)));
    // Under a session-wide key this would be attempt 3 and would sail through.
    assertDenied("an unrelated PR does not inherit the first one's count", run(CHECK_BASH, bashEvent(second, sid)));
    assertFlagged("PR retry attempt 3 allowed-with-flag", run(CHECK_BASH, bashEvent(first, sid)));
}

rmSync(workDir, { recursive: true, force: true });

await import("./codex-tests.mjs");
await import("./patterns-tests.mjs");
await import("./vocabulary-tests.mjs");
await import("./features-tests.mjs");

process.exit(summary());
