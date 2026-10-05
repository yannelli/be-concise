import assert from "node:assert/strict";
import test from "node:test";
import { installDom, byText, change, input, flush } from "./fake-dom.mjs";

installDom({ html: false });
const { playgroundView } = await import("../plugins/concise/web/public/playground.mjs");

function setup(extra = {}) {
  const calls = [];
  const ctx = { calls, reply: () => ({}), api: async (path, options) => { calls.push([path, options]); return ctx.reply(options); }, ...extra };
  const root = playgroundView(ctx);
  const editor = root.querySelector("textarea.playground-editor");
  const override = root.querySelector("textarea.preview-editor");
  const kind = byText(root, "label.field", "Tool / event").querySelector("select");
  const session = byText(root, "label.field", "Session ID").querySelector("input");
  const hint = root.querySelector("p.editor-hint");
  const stop = byText(root, "label.toggle-row", "Stop hook already active");
  const status = () => root.querySelector("div.run-status span").textContent;
  const statusClass = () => root.querySelector("div.run-status span").className;
  const run = byText(root, "button", "Run hooks");
  const output = root.querySelector(".playground-output");
  return { ctx, root, calls, editor, override, kind, session, hint, stop, status, statusClass, run, output };
}

test("a new draft starts with the Write example and an empty output", () => {
  const view = setup();
  assert.deepEqual(view.ctx.playground, { kind: "Write", text: view.editor.value, path: "example.md", session: "", config: "", stopHookActive: false });
  assert.match(view.editor.value, /^Let's delve/);
  assert.equal(view.kind.value, "Write");
  assert.equal(view.hint.textContent, "Paste text to inspect each registered hook and its exact response.");
  assert.equal(view.stop.hidden, true);
  assert.equal(view.session.readOnly, true);
  assert.equal(view.output.querySelector(".empty strong").textContent, "Your next test starts here");
});

test("changing the kind updates the hint and the stop toggle", () => {
  const view = setup();
  const hints = {};
  for (const kind of ["Bash", "raw", "apply_patch", "Edit", "Stop"]) {
    change(view.kind, kind);
    hints[kind] = [view.hint.textContent, view.stop.hidden];
  }
  assert.deepEqual(hints, {
    Bash: ["The Bash hook inspects this command. The command is not executed.", true],
    raw: ["Paste the full hook event as JSON. The event chooses the matching hooks.", true],
    apply_patch: ["Paste a complete patch. The hook checks its added text.", true],
    Edit: ["Paste text to inspect each registered hook and its exact response.", true],
    Stop: ["Paste text to inspect each registered hook and its exact response.", false],
  });
  assert.equal(view.ctx.playground.kind, "Stop");
  byText(view.root, "button", "Load example").click();
  assert.match(view.editor.value, /^Let's delve into the changes/);
  assert.equal(view.ctx.playground.text, view.editor.value);
});

test("inputs update the draft and New session clears it", () => {
  const view = setup({ playground: { kind: "Stop", text: "hello", path: "a.md", session: "s1", config: "", stopHookActive: true } });
  assert.equal(view.stop.hidden, false);
  assert.equal(view.stop.querySelector("input").checked, true);
  assert.equal(view.session.value, "s1");
  input(view.editor, "edited");
  input(view.override, '{"a":1}');
  input(byText(view.root, "label.field", "Target path").querySelector("input"), "b.md");
  change(view.stop.querySelector("input"), false);
  assert.deepEqual(view.ctx.playground, { kind: "Stop", text: "edited", path: "b.md", session: "s1", config: '{"a":1}', stopHookActive: false });
  byText(view.root, "button", "New session").click();
  assert.equal(view.ctx.playground.session, "");
  assert.equal(view.session.value, "");
  assert.equal(view.status(), "New session. Confirmation and retry state start fresh.");
});

test("running hooks posts the draft and renders matches and hook results", async () => {
  const view = setup();
  let release;
  view.ctx.reply = () => new Promise((resolve) => { release = resolve; });
  byText(view.root, "label.toggle-row", "Reset session").querySelector("input").checked = true;
  view.override.value = ' {"features":{"aiWriting":{"enabled":true}}} ';
  view.run.click();
  await flush(1);
  assert.equal(view.run.disabled, true);
  assert.equal(view.status(), "Running registered hooks…");
  assert.equal(view.statusClass(), "muted");
  assert.deepEqual(view.calls[0], ["/api/test", { method: "POST", body: { kind: "Write", text: view.editor.value, path: "example.md", session: "", reset: true, stopHookActive: false, config: { features: { aiWriting: { enabled: true } } } } }]);
  release({ session: "sess-1", hooks: [{ hook: "check-edit", decision: "deny", findings: [{ category: "ai", match: "delve" }] }, { hook: "check-reply" }], request: { a: 1 }, config: { b: 2 } });
  await flush();
  assert.equal(view.run.disabled, false);
  assert.equal(view.session.value, "sess-1");
  assert.equal(view.ctx.playground.session, "sess-1");
  assert.equal(view.status(), "Complete. Repeat this run to inspect confirmation and retry behavior.");
  assert.equal(view.output.querySelector(".section-title .badge").textContent, "2 hooks invoked");
  assert.deepEqual(byText(view.output, "section.panel", "Text matches").querySelectorAll("td.match").map((cell) => cell.textContent), ["delve"]);
  assert.equal(view.output.querySelectorAll(".hook-results details.record").length, 2);
  assert.equal(view.output.querySelectorAll(".hook-results details.record")[0].open, true);
  assert.ok(byText(view.output, "summary", "Exact event sent to hooks"));
  assert.ok(byText(view.output, "summary", "Configuration used for this run"));
});

test("raw events are parsed and sent, and results without hooks render empty states", async () => {
  const view = setup({ playground: { kind: "raw", text: '{"hook_event_name":"Stop"}', path: "x.md", session: "keep", config: "", stopHookActive: false } });
  view.ctx.reply = () => ({ matches: [{ category: "dash", match: "\u2014" }], request: {}, config: {} });
  view.run.click();
  await flush();
  const body = view.calls[0][1].body;
  assert.deepEqual(body.event, { hook_event_name: "Stop" });
  assert.equal("config" in body, false);
  assert.equal(body.reset, false);
  assert.equal(view.session.value, "keep");
  assert.equal(view.output.querySelector(".section-title .badge").textContent, "0 hooks invoked");
  assert.deepEqual(byText(view.output, "section.panel", "Text matches").querySelectorAll("td.match").map((cell) => cell.textContent), ["\u2014"]);
  assert.equal(view.output.querySelector(".hook-results .empty strong").textContent, "No registered hook matched this event.");
});

test("one hook result uses the singular label and a saved result renders on load", async () => {
  const result = { hooks: [{ hook: "check-reply" }] };
  const view = setup({ playground: { kind: "Stop", text: "x", path: "", session: "", config: "", stopHookActive: false, result } });
  assert.equal(view.output.querySelector(".section-title .badge").textContent, "1 hook invoked");
  assert.equal(view.output.querySelector(".empty strong").textContent, "No text matches");
});

test("invalid overrides, arrays, raw JSON, and API errors report a failure", async () => {
  const view = setup();
  const failures = [];
  for (const value of ["{", "[1]", "5"]) {
    view.override.value = value;
    view.run.click();
    await flush();
    failures.push([view.status(), view.statusClass()]);
  }
  assert.match(failures[0][0], /JSON/);
  assert.deepEqual(failures.slice(1), [["Preview configuration must be a JSON object.", "text-danger"], ["Preview configuration must be a JSON object.", "text-danger"]]);
  assert.equal(view.calls.length, 0);
  view.override.value = "";
  view.ctx.reply = () => { throw new Error("hooks failed"); };
  view.run.click();
  await flush();
  assert.equal(view.status(), "hooks failed");
  assert.equal(view.run.disabled, false);
  change(view.kind, "raw");
  view.editor.value = "not json";
  view.run.click();
  await flush();
  assert.match(view.status(), /JSON/);
  assert.equal(view.calls.length, 1);
});
