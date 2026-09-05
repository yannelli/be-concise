import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, CHECK_EDIT, CHECK_BASH, CHECK_REPLY, run, assertDenied, assertAllowed, assertFlagged } from "./lib.mjs";
import {
  EM,
  EN,
  setup,
  cleanup,
  dashOn,
  aiOn,
  bothOn,
  writeEvent,
  fileWriteEvent,
  editEvent,
  bashEvent,
  patchEvent,
  stopEvent,
  transcript,
  includes,
  assertEmpty,
  assertAsked,
  assertBlocked,
  assertNoBlock,
  assertNoPending,
  reasonOf,
  walk,
} from "./features-lib.mjs";

console.log("\nfeatures (em dash in check-edit)");

{
  const c = setup({});
  assertAllowed("features off by default", run(CHECK_EDIT, writeEvent(c, "doc.md", `Text ${EM} here.\n`)));
}
{
  const c = setup(dashOn());
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", `# Title\n\nThe parser ${EM} first pass.\n`));
  assertDenied("em dash in .md denied", result);
  includes("deny names the line", result, "at line 3");
  includes("deny quotes the snippet", result, `The parser ${EM} first pass.`);
  includes("deny cites the reference", result, "references/avoid-ai-speak.md");
}
{
  const c = setup(dashOn());
  const event = writeEvent(c, "doc.md", `Text ${EM} here.\n`);
  assertDenied("first write denied", run(CHECK_EDIT, event));
  const second = run(CHECK_EDIT, event);
  assertAllowed("identical retry allowed", second);
  includes("identical retry is flagged as confirmed", second, "Kept after confirmation");
  assertDenied("a third identical write is a new episode", run(CHECK_EDIT, event));
}
{
  const c = setup(dashOn());
  assertDenied("changed content still violating: first", run(CHECK_EDIT, writeEvent(c, "doc.md", `A ${EM} b\n`)));
  assertDenied("changed content still violating: second", run(CHECK_EDIT, writeEvent(c, "doc.md", `C ${EM} d\n`)));
}
{
  const c = setup(dashOn());
  assertDenied("retry 1 denied", run(CHECK_EDIT, writeEvent(c, "doc.md", `A ${EM} b\n`)));
  assertDenied("retry 2 denied", run(CHECK_EDIT, writeEvent(c, "doc.md", `C ${EM} d\n`)));
  const third = run(CHECK_EDIT, writeEvent(c, "doc.md", `E ${EM} f\n`));
  assertAllowed("retry 3 allowed", third);
  assertFlagged("retry 3 explains why it was allowed", third);
}
{
  const c = setup(dashOn());
  const event = writeEvent(c, "a.ts", `const s = "a ${EM} b";\n`);
  assertAllowed("em dash in a .ts string literal allowed", run(CHECK_EDIT, event));
}
{
  const c = setup(dashOn());
  const event = writeEvent(c, "a.ts", `// a ${EM} b\nconst x = 1;\n`);
  assertDenied("em dash in a line comment denied", run(CHECK_EDIT, event));
}
{
  const c = setup(dashOn());
  assertAllowed("em dash in .json allowed", run(CHECK_EDIT, writeEvent(c, "a.json", `{ "a": "x ${EM} y" }\n`)));
}
{
  const c = setup(dashOn());
  const content = `Inline \`a ${EM} b\` here.\n\n\`\`\`js\nconst a = 1;\n\`\`\`\n\nSee https://example.com/a${EM}b\n`;
  assertAllowed("fence, inline code, and URL em dashes allowed", run(CHECK_EDIT, writeEvent(c, "doc.md", content)));
}
{
  const c = setup(dashOn());
  const event = writeEvent(c, "doc.md", `Text ${EM} here. concise-ignore\n`);
  assertAllowed("concise-ignore on the line allowed", run(CHECK_EDIT, event));
}
{
  const c = setup(dashOn());
  assertDenied("en dash denied by default", run(CHECK_EDIT, writeEvent(c, "doc.md", `Text ${EN} here.\n`)));
}
{
  const c = setup(dashOn({ enDash: false }));
  assertAllowed("enDash false allows an en dash", run(CHECK_EDIT, writeEvent(c, "doc.md", `Text ${EN} here.\n`)));
}
{
  const c = setup(dashOn({ doubleHyphen: true }));
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", "Text -- here.\n"));
  assertDenied("doubleHyphen true flags a spaced double hyphen", result);
  includes("double hyphen is named", result, "double hyphen");
}
{
  const c = setup(dashOn({ doubleHyphen: true }));
  const event = writeEvent(c, "doc.md", "Run it with --flag now.\n");
  assertAllowed("doubleHyphen true allows a flag token", run(CHECK_EDIT, event));
}
{
  const c = setup(dashOn({ mode: "ask" }));
  assertAsked("mode ask returns an ask", run(CHECK_EDIT, writeEvent(c, "doc.md", `Text ${EM} here.\n`)));
}
{
  const c = setup(dashOn({ mode: "deny" }));
  const event = writeEvent(c, "doc.md", `Text ${EM} here.\n`);
  assertDenied("mode deny: attempt 1", run(CHECK_EDIT, event));
  assertDenied("mode deny ignores an identical retry", run(CHECK_EDIT, event));
  assertFlagged("mode deny allows after maxRetries", run(CHECK_EDIT, event));
}
{
  const c = setup(dashOn());
  const result = run(CHECK_EDIT, editEvent(c, "doc.md", `Text ${EM} here.\n`));
  assertDenied("em dash in an Edit chunk denied", result);
  includes("edit deny names the chunk start", result, 'starting "Text');
  includes("edit deny counts lines inside the edit", result, "line 1 of the edit");
}

console.log("\nfeatures (AI writing in check-edit)");

{
  const c = setup(aiOn());
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", "We delve into the parser.\n"));
  assertDenied("aiWriting denied", result);
  includes("deny names the category group", result, "[concise:vocabulary] 1 match at line 1");
  includes("deny names the fix", result, "\"delve\" (look at, examine)");
  includes("deny cites the reference", result, "references/ai-speak-patterns.md");
}
{
  const c = setup(aiOn({ preset: "technical" }));
  assertAllowed("preset technical allows robust", run(CHECK_EDIT, writeEvent(c, "doc.md", "The parser is robust.\n")));
}
{
  const c = setup(aiOn({ preset: "ste" }));
  const result = run(CHECK_EDIT, writeEvent(c, "a.ts", "// ensure the file exists\nconst x = 1;\n"));
  assertDenied("preset ste flags a comment", result);
  includes("ste category is named", result, "[concise:ste]");
}
{
  const c = setup(aiOn({ categories: ["chatbot"] }));
  const event = writeEvent(c, "doc.md", "We delve into the parser.\n");
  assertAllowed("categories override ignores delve", run(CHECK_EDIT, event));
}

console.log("\nfeatures (grouped messages)");

{
  const c = setup(bothOn());
  const text = `One ${EM} two.\nThree ${EM} four.\nWe delve into it.\nFive ${EM} six.\nWe delve again and leverage it.\n`;
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", text));
  assertDenied("grouped findings deny", result);
  includes("the header counts both kinds", result, "[concise] 3 em dashes, 3 AI writing patterns in");
  includes("dashes are grouped on one line", result, "[concise:emDash] 3 em dashes on lines 1, 2, 4:");
  includes("a category lists its lines and distinct matches", result, '[concise:vocabulary] 3 matches on lines 3, 5: "delve" (look at, examine); "leverage" (use).');
  includes("the suppress hint is present", result, "Suppress: concise-ignore on the line");
}
{
  const c = setup(dashOn());
  const text = Array.from({ length: 12 }, (_, i) => `Item ${i} ${EM} more.`).join("\n");
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", `${text}\n`));
  includes("long line lists are capped", result, "on lines 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 (+2 more)");
}

console.log("\nfeatures (both features, and the existing checks)");

{
  const c = setup(bothOn());
  const event = writeEvent(c, "doc.md", `We delve into the parser ${EM} first pass.\n`);
  const first = run(CHECK_EDIT, event);
  assertDenied("both features fire as one deny", first);
  includes("message keeps the em dash part", first, "1 em dash");
  includes("message keeps the AI writing part", first, "[concise:vocabulary]");
  const second = run(CHECK_EDIT, event);
  includes("identical retry confirms both", second, "Kept after confirmation");
  includes("confirmation counts both features", second, "1 em dash, 1 AI writing pattern");
}
{
  const c = setup(bothOn({ mode: "deny" }, { mode: "confirm" }));
  const event = writeEvent(c, "doc.md", `We delve into the parser ${EM} first pass.\n`);
  assertDenied("strictest mode wins: attempt 1", run(CHECK_EDIT, event));
  assertDenied("strictest mode wins: attempt 2", run(CHECK_EDIT, event));
  assertFlagged("strictest mode wins: allowed after maxRetries", run(CHECK_EDIT, event));
}
{
  const c = setup(dashOn());
  const event = writeEvent(c, "doc.md", `Text ${EM} here.\n`);
  assertDenied("confirm flow: deny", run(CHECK_EDIT, event));
  includes("confirm flow: kept", run(CHECK_EDIT, event), "Kept after confirmation");
  assertAllowed("a clean write on the same path is allowed", run(CHECK_EDIT, writeEvent(c, "doc.md", "Text here.\n")));
  assertNoPending("a clean write leaves no pending hash", c.sid);
}
{
  const c = setup(dashOn());
  const event = writeEvent(c, "a.ts", `// l1 ${EM}\n// l2\n// l3\n// l4\nconst x = 1;\n`);
  const first = run(CHECK_EDIT, event);
  assertDenied("comment-length deny wins", first);
  includes("the comment rule is the reason", first, "Comment at");
  assertNoPending("the style check did not record a pending hash", c.sid);
  includes("an identical write is denied by the comment rule again", run(CHECK_EDIT, event), "Comment at");
}

console.log("\nfeatures (check-bash and apply_patch)");

{
  const c = setup(dashOn());
  const result = run(CHECK_BASH, bashEvent(c, `gh pr create --title "x" --body "One short line ${EM} here."`));
  assertDenied("gh pr body em dash denied", result);
  includes("the PR body is the label", result, "in PR body");
}
{
  const c = setup(dashOn());
  const command = `git commit -m "$(cat <<'EOF'\nAdd parser ${EM} first pass\nEOF\n)"`;
  const result = run(CHECK_BASH, bashEvent(c, command));
  assertDenied("git commit heredoc em dash denied", result);
  includes("the commit message is the label", result, "in commit message");
}
{
  const c = setup(dashOn());
  assertEmpty("a clean commit message is allowed", run(CHECK_BASH, bashEvent(c, 'git commit -m "fix parser"')));
}
{
  const c = setup(dashOn());
  assertEmpty("an unrelated command is allowed", run(CHECK_BASH, bashEvent(c, `echo "${EM}"`)));
}
{
  const c = setup(dashOn());
  const patch = `*** Begin Patch\n*** Add File: ${join(c.dir, "notes.md")}\n+Notes ${EM} here\n*** End Patch`;
  assertDenied("apply_patch Add File with an em dash denied", run(CHECK_EDIT, patchEvent(c, patch)));
}

console.log("\nfeatures (check-reply)");

{
  const c = setup(dashOn());
  const path = transcript(c, "t.jsonl", `Done. The parser ${EM} first pass.`);
  const result = run(CHECK_REPLY, stopEvent(c, path, false));
  assertBlocked("a reply with an em dash is blocked", result);
  includes("the reply is the label", result, "in your reply");
  includes("the block asks for a rewrite or a repeat", result, "send the same reply again");
}
{
  const c = setup(dashOn());
  const path = transcript(c, "t.jsonl", `Done. The parser ${EM} first pass.`);
  assertBlocked("reply blocked once", run(CHECK_REPLY, stopEvent(c, path, false)));
  const second = run(CHECK_REPLY, stopEvent(c, path, true));
  assertNoBlock("stop_hook_active never blocks", second);
  includes("the identical reply is confirmed", second, "Kept after confirmation");
}
{
  const c = setup(dashOn());
  const first = transcript(c, "t1.jsonl", `Done. The parser ${EM} first pass.`);
  assertBlocked("reply blocked before the rewrite", run(CHECK_REPLY, stopEvent(c, first, false)));
  const changed = transcript(c, "t2.jsonl", `Done. The lexer ${EM} second pass.`);
  const result = run(CHECK_REPLY, stopEvent(c, changed, true));
  assertNoBlock("a changed reply is not blocked", result);
  includes("the changed reply is reported as allowed", result, "allowed");
}
{
  const c = setup({});
  const path = transcript(c, "t.jsonl", `Done. The parser ${EM} first pass.`);
  assertEmpty("features off outputs nothing", run(CHECK_REPLY, stopEvent(c, path, false)));
}
{
  const c = setup(dashOn());
  assertEmpty("a missing transcript_path outputs nothing", run(CHECK_REPLY, stopEvent(c, undefined, false)));
}
{
  const c = setup(dashOn({ replies: false }));
  const path = transcript(c, "t.jsonl", `Done. The parser ${EM} first pass.`);
  assertEmpty("replies false outputs nothing", run(CHECK_REPLY, stopEvent(c, path, false)));
}
{
  const c = setup(dashOn({ mode: "ask" }));
  const path = transcript(c, "t.jsonl", `Done. The parser ${EM} first pass.`);
  assertBlocked("mode ask blocks on Stop, as confirm does", run(CHECK_REPLY, stopEvent(c, path, false)));
  includes("the ask-on-Stop block asks for a repeat", run(CHECK_REPLY, stopEvent(c, path, true)), "Kept after confirmation");
}

console.log("\nfeatures (escape hatches and message shape)");

{
  const c = setup(bothOn());
  assertAllowed("concise-ignore-file exempts a prose write", run(CHECK_EDIT, writeEvent(c, "d.md", `x concise-ignore-file\nThe parser ${EM} here.\n`)));
  assertAllowed("concise-ignore-file exempts a comment write", run(CHECK_EDIT, writeEvent(c, "d.ts", `// concise-ignore-file\n// a ${EM} b\n`)));
  writeFileSync(join(c.dir, "onDisk.md"), "concise-ignore-file\n");
  assertAllowed("concise-ignore-file on disk exempts an edit", run(CHECK_EDIT, editEvent(c, "onDisk.md", `a ${EM} b`)));
}

{
  const c = setup(aiOn({ preset: "ryan" }));
  const result = run(CHECK_EDIT, writeEvent(c, "w.md", "It is a boundary,\n  not a rule.\n"));
  assertDenied("a wrapped contrast tail is denied", result);
  const quoted = /"([^"]*not a rule[^"]*)"/.exec(reasonOf(result));
  assertEmpty("the quoted match holds no line break", quoted && /\n/.test(quoted[1]) ? { newline: quoted[1] } : {});
}

console.log("\nfeatures (self-check over the plugin)");

{
  const config = bothOn({}, { preset: "ryan" });
  for (const file of walk(ROOT)) {
    const c = setup(config);
    assertAllowed(`self-check ${relative(ROOT, file)}`, run(CHECK_EDIT, fileWriteEvent(c, file)));
  }
}

cleanup();
