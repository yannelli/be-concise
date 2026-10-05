import assert from "node:assert/strict";
import test from "node:test";
import { installDom, answerDialog, byText, change, input, flush } from "./fake-dom.mjs";

installDom({ html: false });
const { configurationView } = await import("../plugins/concise/web/public/configuration.mjs");

const effective = {
  checks: { comments: true, fileSize: false, prBody: true }, stopHook: true, softFail: false, maxCommentLines: 3, maxFileLines: 480,
  maxPrBodyParagraphs: 8, maxPrBodySentences: 4, maxRetries: 2,
  features: { aiWriting: { enabled: true, replies: false, preset: "ste", mode: "deny" }, emDash: { enabled: true, enDash: false, doubleHyphen: false, replies: true, mode: "confirm" } },
};

function makeState(overrides = {}) {
  return {
    layers: [
      { id: "user-claude", label: "User", path: "/home/.claude/concise.json", text: '{\n  "maxRetries": 5\n}', exists: true, active: true, revision: "r1" },
      { id: "project-claude", label: "Project", path: "/work/.claude/concise.json", exists: false, active: false, revision: "r2" },
    ],
    filterLayers: [{ id: "filter-claude", label: "Claude filter", path: "/home/.claude/filter.env", text: "FILTER_LINES=40", exists: true }],
    effective, defaults: { stopHook: true }, environment: { CONCISE_X: "1" }, hooks: { Stop: [] }, presets: ["default", "ste"],
    ...overrides,
  };
}

function setup(stateOverrides = {}, ctxOverrides = {}) {
  const calls = [];
  const ctx = { state: makeState(stateOverrides), calls, api: async (path, options) => { calls.push([path, options]); return ctx.reply(path, options); }, reply: () => ctx.state, ...ctxOverrides };
  const root = configurationView(ctx);
  document.body.replaceChildren(root);
  const editor = root.querySelector("textarea");
  const layer = root.querySelector("label.field select");
  const status = () => root.querySelector(".editor-footer span").textContent;
  const statusClass = () => root.querySelector(".editor-footer span").className;
  const toggle = (label) => byText(root, "label.toggle-row", label).querySelector("input");
  const numberField = (label) => byText(root, "label.field", label).querySelector("input");
  const selectField = (panel, label) => byText(byText(root, "section.panel", panel), "label.field", label).querySelector("select");
  const click = (label) => byText(root, "button", label).click();
  return { ctx, root, editor, layer, status, statusClass, toggle, numberField, selectField, click, calls };
}

test("initial layer prefers the remembered layer, then an active project layer, then project-claude, then the first layer", () => {
  assert.equal(setup({}, { configLayer: "filter-claude" }).editor.value, "FILTER_LINES=40");
  const active = setup({ layers: [{ id: "user", label: "User", path: "/u", text: "{}" }, { id: "project-codex", label: "Codex project", path: "/p", text: '{"a":1}', active: true }] });
  assert.equal(active.editor.value, '{"a":1}');
  const fallback = setup();
  assert.equal(fallback.editor.value, "{}");
  assert.equal(fallback.root.querySelector(".source-path").textContent, "/work/.claude/concise.json");
  assert.equal(setup({ layers: [{ id: "only", label: "Only", path: "/o", text: '{"b":2}' }], filterLayers: undefined }).editor.value, '{"b":2}');
});

test("layer options label filter packs and the editor shows layer state", () => {
  const view = setup({}, { configLayer: "user-claude" });
  assert.deepEqual(view.layer.querySelectorAll("option").map((option) => [option.value, option.textContent]),
    [["user-claude", "User"], ["project-claude", "Project"], ["filter-claude", "Claude filter · filter pack"]]);
  assert.deepEqual(view.root.querySelectorAll(".source-row .row .badge").map((badge) => [badge.textContent, badge.className]), [["File exists", "badge neutral"], ["Active layer", "badge success"]]);
  assert.equal(view.editor.getAttribute("aria-label"), "Configuration JSON");
  assert.match(view.root.querySelector(".editor-hint").textContent, /^Edit the full JSON file/);
  assert.equal(view.status(), "Changes are saved to this file.");
  assert.equal(view.numberField("Retries").value, "5");
  assert.equal(view.numberField("Comment lines").value, "3");
  assert.equal(view.toggle("Comment length").checked, true);
  assert.equal(view.toggle("File length").checked, false);
  assert.equal(view.selectField("AI writing", "Preset").value, "ste");
  assert.equal(view.selectField("AI writing", "Response mode").value, "deny");
  const disclosures = view.root.querySelectorAll("details.disclosure summary").map((node) => node.textContent);
  assert.deepEqual(disclosures, ["Effective configuration", "Built-in defaults", "Environment overrides", "Hook registrations"]);
});

test("switching to a filter layer hides common controls and switching back restores them", async () => {
  const view = setup({}, { configLayer: "project-claude" });
  assert.deepEqual(view.root.querySelectorAll(".source-row .row .badge").map((badge) => badge.textContent), ["New file", "Inactive layer"]);
  change(view.layer, "filter-claude");
  await flush();
  assert.equal(view.ctx.configLayer, "filter-claude");
  assert.equal(view.editor.value, "FILTER_LINES=40");
  assert.equal(view.editor.getAttribute("aria-label"), "Shell filter settings");
  assert.match(view.root.querySelector(".editor-hint").textContent, /^Edit shell filter settings/);
  assert.deepEqual(view.root.querySelectorAll(".source-row .row .badge").map((badge) => badge.textContent), ["File exists"]);
  assert.equal(view.root.querySelector(".common-controls").childNodes.length, 0);
  input(view.editor, "FILTER_LINES=10");
  assert.equal(view.status(), "Unsaved changes");
  change(view.layer, "user-claude");
  await answerDialog("discard");
  assert.equal(view.ctx.configLayer, "user-claude");
  assert.equal(view.editor.value, '{\n  "maxRetries": 5\n}');
  assert.ok(view.toggle("Comment length"));
});

test("cancelling the discard dialog keeps the current layer and edits", async () => {
  const view = setup({}, { configLayer: "project-claude" });
  input(view.editor, '{"maxRetries": 1}');
  change(view.layer, "user-claude");
  await answerDialog("cancel");
  assert.equal(view.layer.value, "project-claude");
  assert.equal(view.editor.value, '{"maxRetries": 1}');
  const filter = setup({ filterLayers: [{ id: "filter-new", label: "New filter", path: "/f" }] }, { configLayer: "filter-new" });
  assert.equal(filter.editor.value, "");
  input(filter.editor, "FILTER_TAIL=5");
  change(filter.layer, "project-claude");
  await answerDialog("cancel");
  assert.equal(filter.layer.value, "filter-new");
});

test("common controls write nested keys into the draft", () => {
  const view = setup({ presets: [{ id: "a" }, { name: "b" }, "c"] }, { configLayer: "project-claude" });
  assert.deepEqual(view.selectField("AI writing", "Preset").querySelectorAll("option").map((option) => option.value), ["a", "b", "c"]);
  change(view.toggle("File length"), true);
  change(view.numberField("File lines"), "300");
  change(view.numberField("Comment lines"), "");
  change(view.selectField("AI writing", "Preset"), "b");
  change(view.selectField("Dash style", "Response mode"), "ask");
  assert.deepEqual(JSON.parse(view.editor.value), { checks: { fileSize: true }, maxFileLines: 300, features: { aiWriting: { preset: "b" }, emDash: { mode: "ask" } } });
  assert.equal(view.status(), "Unsaved changes");
});

test("nested writes replace non-object parents", () => {
  const view = setup({ layers: [{ id: "project-claude", label: "Project", path: "/p", text: '{"checks": [1], "features": "x"}' }] });
  change(view.toggle("Comment length"), false);
  change(view.toggle("Em dash check"), false);
  assert.deepEqual(JSON.parse(view.editor.value), { checks: { comments: false }, features: { emDash: { enabled: false } } });
});

test("presets as an object or missing fall back to keys or the default preset", () => {
  const keyed = setup({ presets: { strict: {}, ste: {} } }, { configLayer: "project-claude" });
  assert.deepEqual(keyed.selectField("AI writing", "Preset").querySelectorAll("option").map((option) => option.value), ["strict", "ste"]);
  const none = setup({ presets: undefined }, { configLayer: "project-claude" });
  assert.deepEqual(none.selectField("AI writing", "Preset").querySelectorAll("option").map((option) => option.value), ["default"]);
});

test("invalid editor text reports errors and blocks control updates", () => {
  const view = setup({}, { configLayer: "project-claude" });
  input(view.editor, "[1]");
  assert.equal(view.status(), "Configuration must be a JSON object.");
  assert.equal(view.statusClass(), "text-danger");
  change(view.toggle("Soft fail"), true);
  assert.equal(view.status(), "Configuration must be a JSON object.");
  input(view.editor, "{");
  assert.match(view.status(), /JSON/);
  input(view.editor, "null");
  assert.equal(view.status(), "Configuration must be a JSON object.");
  input(view.editor, "{}");
  assert.equal(view.status(), "Unsaved changes");
  assert.equal(view.statusClass(), "muted");
});

test("a layer with invalid text or an error shows no controls and the error", () => {
  const view = setup({ layers: [{ id: "project-claude", label: "Project", path: "/p", text: "{bad", error: "Unexpected token" }], problems: [{ message: "bad" }], environment: undefined });
  assert.equal(view.status(), "Unexpected token");
  assert.equal(view.statusClass(), "text-danger");
  assert.equal(view.root.querySelector(".common-controls").childNodes.length, 0);
  const problems = byText(view.root, "details.disclosure", "Configuration problems");
  assert.equal(problems.open, true);
  assert.equal(byText(view.root, "details.disclosure", "Environment overrides").querySelector("pre").textContent, "{}");
});

test("no layers renders an empty editor without controls", () => {
  const view = setup({ layers: [], filterLayers: [] });
  assert.equal(view.editor.value, "");
  assert.equal(view.layer.querySelectorAll("option").length, 0);
  assert.equal(view.root.querySelector(".common-controls").childNodes.length, 0);
});

test("saving sends the layer text and revision and reloads the saved layer", async () => {
  const saved = makeState();
  saved.layers[1] = { ...saved.layers[1], text: '{"stopHook":false}', exists: true, revision: "r3" };
  const view = setup({}, { configLayer: "project-claude", reply: () => saved });
  input(view.editor, '{"stopHook":false}');
  view.click("Save configuration");
  await flush();
  assert.deepEqual(view.calls, [["/api/config", { method: "PATCH", body: { id: "project-claude", text: '{"stopHook":false}', revision: "r2" } }]]);
  assert.equal(view.ctx.state, saved);
  assert.equal(view.status(), "Saved. Hooks read this configuration on their next invocation.");
  assert.equal(byText(view.root, "button", "Save configuration").disabled, false);
  assert.equal(view.root.querySelector(".source-row .row .badge").textContent, "File exists");
});

test("saving a filter layer skips JSON parsing and save errors report conflicts or messages", async () => {
  const view = setup({}, { configLayer: "filter-claude", reply: () => { throw Object.assign(new Error("conflict"), { status: 409 }); } });
  input(view.editor, "FILTER_LINES=1");
  view.click("Save configuration");
  await flush();
  assert.equal(view.status(), "This file changed on disk. Copy your edits, then reload before saving.");
  assert.equal(view.statusClass(), "text-danger");
  view.ctx.reply = () => { throw new Error("disk full"); };
  view.click("Save configuration");
  await flush();
  assert.equal(view.status(), "disk full");
  const invalid = setup({}, { configLayer: "project-claude" });
  input(invalid.editor, "[]");
  invalid.click("Save configuration");
  await flush();
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.status(), "Configuration must be a JSON object.");
});

test("discard changes restores the layer text", () => {
  const view = setup({}, { configLayer: "user-claude" });
  input(view.editor, '{"maxRetries": 9}');
  view.click("Discard changes");
  assert.equal(view.editor.value, '{\n  "maxRetries": 5\n}');
  assert.equal(view.status(), "Changes are saved to this file.");
});

test("reload asks before replacing edits and falls back to the first layer", async () => {
  const fresh = makeState({ layers: [{ id: "user-claude", label: "User", path: "/u", text: '{"maxRetries":7}', exists: true }], problems: [{ message: "x" }] });
  const view = setup({}, { configLayer: "project-claude", reply: () => fresh });
  input(view.editor, '{"a":1}');
  view.click("Reload from disk");
  await answerDialog("cancel");
  assert.equal(view.calls.length, 0);
  view.click("Reload from disk");
  await answerDialog("discard");
  assert.deepEqual(view.calls, [["/api/state", undefined]]);
  assert.equal(view.editor.value, '{"maxRetries":7}');
  assert.ok(byText(view.root, "details.disclosure", "Configuration problems"));
  view.click("Reload from disk");
  await flush();
  assert.equal(view.calls.length, 2);
  assert.equal(view.editor.value, '{"maxRetries":7}');
  view.ctx.reply = () => { throw new Error("offline"); };
  view.click("Reload from disk");
  await flush();
  assert.equal(view.status(), "offline");
});

test("reload of an unchanged filter layer skips the dialog", async () => {
  const view = setup({}, { configLayer: "filter-claude" });
  view.click("Reload from disk");
  await flush();
  assert.equal(document.body.querySelector("dialog"), null);
  assert.equal(view.editor.value, "FILTER_LINES=40");
  const empty = setup({ filterLayers: [{ id: "filter-new", label: "New", path: "/f" }] }, { configLayer: "filter-new" });
  empty.click("Reload from disk");
  await flush();
  assert.equal(empty.calls.length, 1);
});
