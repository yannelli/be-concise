import assert from "node:assert/strict";
import test from "node:test";
import { installDom, byText, change, input, flush } from "./fake-dom.mjs";

installDom({ html: false });
const { activityView } = await import("../plugins/concise/web/public/activity.mjs");

const records = () => [
  { id: 1, project: "a", source: "live", decision: "allow", hook: "check-edit", session: "s-one", tool: "Write" },
  { id: 2, project: "b", source: "test", decision: "deny", hook: "custom-hook", session: "s-two", tool: "Bash", request: { needle: "Zebra" } },
  { id: 3, project: "a", source: "live", decision: "flag" },
];

function context(overrides = {}) {
  const ctx = {
    state: { monitor: { retained: 50 } }, records: records(), project: "a", counted: 0,
    api: async () => ({ ok: true }), updateCounts() { ctx.counted++; },
    visible: () => (ctx.state?.hub ? ctx.records.filter((record) => record.project === ctx.project) : ctx.records),
    ...overrides,
  };
  return ctx;
}

const shown = (root) => root.querySelectorAll("details.record").map((node) => node.dataset.record);
const control = (root, label) => byText(root, "label.field", label).querySelector(label === "Session" || label === "Search" ? "input" : "select");
const countText = (root) => root.querySelector(".stream-toolbar span.mono").textContent;
const status = (root) => root.querySelector("p.run-status span").textContent;

test("activity lists records newest first and filters by source, decision, hook, session, and search", () => {
  const ctx = context();
  const root = activityView(ctx);
  assert.deepEqual(shown(root), ["3", "2", "1"]);
  assert.equal(countText(root), "3 / 3 events");
  assert.equal(byText(root, "label.field", "Project"), null);
  assert.ok(byText(root, "button", "Clear history"));
  assert.ok(byText(root, ".badge", "Last 50 events"));
  assert.deepEqual(control(root, "Hook").querySelectorAll("option").map((option) => option.value), ["all", "check-edit", "check-bash", "check-reply", "test-filter", "custom-hook"]);
  change(control(root, "Source"), "live");
  assert.deepEqual(shown(root), ["3", "1"]);
  change(control(root, "Decision"), "allow");
  assert.deepEqual(shown(root), ["1"]);
  change(control(root, "Hook"), "check-bash");
  assert.deepEqual(shown(root), []);
  assert.equal(root.querySelector(".record-list .empty strong").textContent, "No activity to display");
  change(control(root, "Hook"), "all");
  change(control(root, "Decision"), "all");
  change(control(root, "Source"), "all");
  input(control(root, "Session"), "two");
  assert.deepEqual(shown(root), ["2"]);
  input(control(root, "Session"), "");
  input(control(root, "Search"), "zebra");
  assert.deepEqual(shown(root), ["2"]);
  assert.equal(countText(root), "1 / 3 events");
  assert.deepEqual(ctx.activityFilters, { project: "selected", source: "all", decision: "all", hook: "all", session: "", search: "zebra" });
});

test("activity reuses saved filters, keeps open cards open, and refreshes on new records", () => {
  const ctx = context({ activityFilters: { project: "selected", source: "all", decision: "all", hook: "all", session: "", search: "" }, state: {} });
  const root = activityView(ctx);
  assert.ok(byText(root, ".badge", "Last 500 events"));
  root.querySelector('details.record[data-record="2"]').open = true;
  ctx.records.push({ id: 4, source: "live", decision: "allow" });
  ctx.onRecords();
  assert.deepEqual(shown(root), ["4", "3", "2", "1"]);
  assert.deepEqual(root.querySelectorAll("details.record[open]").map((node) => node.dataset.record), ["2"]);
});

test("pausing freezes the display until resumed", () => {
  const ctx = context();
  const root = activityView(ctx);
  const pause = byText(root, "button", "Pause display");
  pause.click();
  assert.equal(pause.textContent, "Resume display");
  assert.equal(status(root), "Display paused. Incoming events are still retained.");
  ctx.records.push({ id: 9, source: "live" });
  ctx.onRecords();
  assert.deepEqual(shown(root), ["3", "2", "1"]);
  assert.equal(countText(root), "3 / 3 events");
  pause.click();
  assert.equal(pause.textContent, "Pause display");
  assert.equal(status(root), "");
  assert.deepEqual(shown(root), ["9", "3", "2", "1"]);
});

test("hub activity filters by project and clears only the selected project", async () => {
  const calls = [];
  const ctx = context({ state: { hub: true }, api: async (path, options) => { calls.push([path, options]); return { ok: true }; } });
  const root = activityView(ctx);
  assert.deepEqual(shown(root), ["3", "1"]);
  change(control(root, "Project"), "all");
  assert.deepEqual(shown(root), ["3", "2", "1"]);
  byText(root, "button", "Clear project history").click();
  await flush();
  assert.deepEqual(calls, [["/api/clear", { method: "POST", body: {} }]]);
  assert.deepEqual(ctx.records.map((record) => record.id), [2]);
  assert.deepEqual(shown(root), ["2"]);
  assert.equal(status(root), "Retained history cleared.");
  assert.equal(ctx.counted, 1);
});

test("clearing local history empties records and reports API errors", async () => {
  const ctx = context();
  const root = activityView(ctx);
  byText(root, "button", "Clear history").click();
  await flush();
  assert.deepEqual(ctx.records, []);
  assert.equal(root.querySelector(".record-list .empty strong").textContent, "No activity to display");
  ctx.api = async () => { throw new Error("clear failed"); };
  byText(root, "button", "Clear history").click();
  await flush();
  assert.equal(status(root), "clear failed");
});

test("export downloads the visible records", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const created = t.mock.method(URL, "createObjectURL", () => "blob:activity");
  t.mock.method(URL, "revokeObjectURL", () => {});
  const ctx = context();
  const root = activityView(ctx);
  change(control(root, "Source"), "test");
  byText(root, "button", "Export JSON").click();
  const exported = JSON.parse(await created.mock.calls[0].arguments[0].text());
  assert.deepEqual(exported.map((record) => record.id), [2]);
  t.mock.timers.tick(1000);
});
