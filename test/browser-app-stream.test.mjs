import assert from "node:assert/strict";
import test from "node:test";
import { installDom, FakeEvent, change, flush } from "./fake-dom.mjs";

const appUrl = "../plugins/concise/web/public/app.mjs";
let cases = 0;

const effective = {
  checks: { comments: true, fileSize: true, prBody: true }, stopHook: true, maxCommentLines: 3, maxFileLines: 480, maxPrBodySentences: 4,
  features: { aiWriting: { enabled: true, preset: "ste" }, emDash: { enabled: true, mode: "deny" } },
};
const baseState = (overrides = {}) => ({ cwd: "/work", runtime: { node: "24", platform: "linux" }, monitor: { retained: 2 }, effective, layers: [], filterLayers: [], ...overrides });

async function boot(routes = {}) {
  const dom = installDom({ hash: "#token=t%201" });
  Object.assign(dom.routes, { "GET /api/state": baseState(), "GET /api/history": { records: [] } }, routes);
  await import(`${appUrl}?case=${++cases}`);
  await flush();
  return { ...dom, events: dom.sources[0] };
}

const $ = (dom, selector) => dom.document.querySelector(selector);
const emit = async (dom, type, data) => { dom.events.emit(type, data); await flush(); };
const shown = (dom) => dom.document.querySelectorAll("#view details.record").map((node) => node.dataset.record);

test("stream status follows ready, open, and error events and closes on pagehide", async () => {
  const dom = await boot();
  assert.equal(dom.events.url, "/api/events?token=t%201");
  dom.events.emit("error");
  assert.equal($(dom, "#connection").textContent, "Reconnecting…");
  assert.equal($(dom, "#connection-dot").className, "dot pending");
  dom.events.emit("ready");
  assert.equal($(dom, "#connection").textContent, "Stream connected");
  assert.equal($(dom, "#connection-dot").className, "dot ");
  dom.events.emit("error");
  dom.events.emit("open");
  assert.equal($(dom, "#connection").textContent, "Stream connected");
  dom.window.dispatchEvent(new FakeEvent("pagehide"));
  assert.equal(dom.events.closed, true);
});

test("records append once, keep the retained window, and refresh the active page", async () => {
  const dom = await boot();
  await emit(dom, "record", JSON.stringify({ id: "a", source: "live", findings: [{ category: "ai" }] }));
  assert.equal($(dom, "#nav-count").textContent, "1");
  assert.equal($(dom, "#overview-stats .metric-value").textContent, "1");
  await emit(dom, "record", JSON.stringify({ id: "a", source: "live" }));
  assert.equal($(dom, "#nav-count").textContent, "1");
  $(dom, '[data-page="activity"]').click();
  await emit(dom, "record", JSON.stringify({ id: "b", source: "test" }));
  await emit(dom, "record", JSON.stringify({ id: "c", source: "live" }));
  assert.equal($(dom, "#nav-count").textContent, "2");
  assert.deepEqual(shown(dom), ["c", "b"]);
  await emit(dom, "record", "{not json");
  assert.equal($(dom, "#notice").hidden, false);
  assert.equal($(dom, "#notice").className, "notice error");
  assert.equal($(dom, "#notice").textContent, "An event could not be read. Reopen the console to reload history.");
});

test("cleared events drop every record or only the named project", async () => {
  const records = [{ id: 1, project: "p1" }, { id: 2, project: "p2" }, { id: 3 }];
  const dom = await boot({ "GET /api/history": { records } });
  assert.equal($(dom, "#nav-count").textContent, "3");
  await emit(dom, "cleared", JSON.stringify({ project: "p1" }));
  assert.equal($(dom, "#nav-count").textContent, "2");
  $(dom, '[data-page="activity"]').click();
  assert.deepEqual(shown(dom), ["3", "2"]);
  await emit(dom, "cleared");
  assert.equal($(dom, "#nav-count").textContent, "0");
  assert.deepEqual(shown(dom), []);
});

test("a hub without projects explains registration and still shows activity", async () => {
  const dom = await boot({ "GET /api/state": baseState({ hub: true, cwd: null, projects: [] }), "GET /api/projects": { projects: [] } });
  assert.equal($(dom, "#project-switch").hidden, false);
  assert.equal($(dom, "#project-switch p").textContent, "No projects registered yet.");
  assert.equal($(dom, "#view h1").textContent, "No project registered yet");
  assert.equal($(dom, "#overview-stats"), null);
  $(dom, '[data-page="activity"]').click();
  assert.equal($(dom, "#view h1").textContent, "Live activity");
  await emit(dom, "record", JSON.stringify({ id: 1 }));
  assert.equal(dom.calls.some((call) => call.path === "/api/projects"), false);
  await emit(dom, "record", JSON.stringify({ id: 2, project: "new" }));
  assert.equal(dom.calls.filter((call) => call.path === "/api/projects").length, 1);
  assert.equal($(dom, "#project-switch p").textContent, "No projects registered yet.");
});

test("a hub registers its first project from the stream and loads its state", async () => {
  const projects = [{ key: "p1", name: "Project one" }, { key: "p2", name: "Project two" }];
  const dom = await boot({
    "GET /api/state": (_, url) => baseState({ hub: true, projects: url.searchParams.get("project") ? projects : [], cwd: url.searchParams.get("project") ? `/work/${url.searchParams.get("project")}` : null }),
    "GET /api/projects": { projects },
  });
  await emit(dom, "record", JSON.stringify({ id: 1, project: "p1" }));
  assert.deepEqual(dom.calls.map((call) => [call.path, call.query.project]).slice(2), [["/api/projects", undefined], ["/api/state", "p1"]]);
  assert.equal($(dom, "#view .workspace-path").textContent, "/work/p1");
  assert.equal($(dom, "#view .workspace-strip .badge").textContent, "Hub");
  assert.equal($(dom, "#nav-count").textContent, "1");
  const control = $(dom, "#project-switch select");
  assert.deepEqual(control.querySelectorAll("option").map((option) => [option.value, option.textContent, option.selected]), [["p1", "Project one", true], ["p2", "Project two", false]]);
  await emit(dom, "record", JSON.stringify({ id: 2, project: "p2" }));
  await emit(dom, "record", JSON.stringify({ id: 3, project: "p3" }));
  assert.deepEqual(dom.calls.slice(4).map((call) => [call.path, call.query.project]), [["/api/projects", "p1"]]);
  $(dom, '[data-page="playground"]').click();
  change($(dom, "#project-switch select"), "p2");
  await flush();
  assert.equal(dom.calls.at(-1).query.project, "p2");
  assert.equal($(dom, "#breadcrumb").textContent, "Playground");
  assert.equal($(dom, "#nav-count").textContent, "1");
  dom.routes["GET /api/state"] = { status: 500, body: { error: "state down" } };
  change($(dom, "#project-switch select"), "p1");
  await flush();
  assert.equal($(dom, "#notice").textContent, "state down");
  assert.equal($(dom, "#notice").className, "notice error");
});

test("hub record retention scales with the project count", async () => {
  const projects = [{ key: "p1", name: "One" }, { key: "p2", name: "Two" }];
  const dom = await boot({ "GET /api/state": baseState({ hub: true, project: "p1", projects }) });
  for (const id of [1, 2, 3, 4, 5]) await emit(dom, "record", JSON.stringify({ id, project: id % 2 ? "p1" : "p2" }));
  $(dom, '[data-page="activity"]').click();
  const select = $(dom, "#view label.field select");
  change(select, "all");
  assert.deepEqual(shown(dom), ["5", "4", "3", "2"]);
  assert.equal(dom.calls.some((call) => call.path === "/api/projects"), false);
});

test("project refresh failures show a notice", async () => {
  const dom = await boot({ "GET /api/state": baseState({ hub: true, projects: [] }), "GET /api/projects": { status: 500, body: { error: { message: "projects down" } } } });
  await emit(dom, "record", JSON.stringify({ id: 1, project: "x" }));
  assert.equal($(dom, "#notice").textContent, "projects down");
  assert.equal($(dom, "#notice").hidden, false);
});

test("a hub state without a project list and a state without monitor settings use defaults", async () => {
  const hub = await boot({ "GET /api/state": baseState({ hub: true }) });
  assert.equal($(hub, "#project-switch p").textContent, "No projects registered yet.");
  const local = await boot({ "GET /api/state": baseState({ monitor: undefined }) });
  for (const id of [1, 2, 3]) await emit(local, "record", JSON.stringify({ id }));
  assert.equal($(local, "#nav-count").textContent, "3");
});

const platform = (worktree, subdir = "") => ({ name: "platform", root: "/repos/platform", worktree, subdir });
const grouped = [
  { key: "g1", name: "gone", cwd: "/trees/gone", missing: true, repo: platform("gone") },
  { key: "w1", name: "old-mantis", cwd: "/trees/old-mantis", missing: false, repo: platform("old-mantis") },
  { key: "s1", name: "ui", cwd: "/trees/old-mantis/resources/ui", missing: false, repo: platform("old-mantis", "resources/ui") },
  { key: "b1", name: "be-concise", cwd: "/repos/be-concise", missing: false, repo: { name: "be-concise", root: "/repos/be-concise", worktree: null, subdir: "" } },
  { key: "n1", name: "scratch", cwd: "/tmp/scratch", missing: false, repo: null },
];
const groups = (dom) => dom.document.querySelectorAll("#project-switch optgroup").map((group) => [group.getAttribute("label"), group.querySelectorAll("option").map((option) => option.textContent)]);

test("the hub switcher groups projects by repository and hides missing directories until asked", async () => {
  const dom = await boot({ "GET /api/state": baseState({ hub: true, project: "w1", projects: grouped }) });
  assert.deepEqual(groups(dom), [["platform", ["old-mantis (worktree)", "old-mantis (worktree) · resources/ui"]], ["be-concise", ["be-concise"]], ["No git repository", ["scratch"]]]);
  assert.equal($(dom, "#project-switch option").getAttribute("title"), "/trees/old-mantis");
  const toggle = () => $(dom, "#project-switch button");
  assert.equal(toggle().textContent, "Show 1 missing");
  toggle().click();
  assert.deepEqual(groups(dom)[0], ["platform", ["gone (worktree) (missing)", "old-mantis (worktree)", "old-mantis (worktree) · resources/ui"]]);
  assert.equal(toggle().textContent, "Hide 1 missing");
  toggle().click();
  assert.equal(groups(dom)[0][1].length, 2);
});

test("the hub selects the newest existing project and keeps a selected missing one visible", async () => {
  const dom = await boot({
    "GET /api/state": (_, url) => baseState({ hub: true, project: url.searchParams.get("project"), projects: url.searchParams.get("project") ? grouped : [] }),
    "GET /api/projects": { projects: grouped },
  });
  await emit(dom, "record", JSON.stringify({ id: 1, project: "w1" }));
  assert.equal(dom.calls.at(-1).query.project, "w1");
  const selected = await boot({ "GET /api/state": baseState({ hub: true, project: "g1", projects: grouped }) });
  assert.deepEqual(groups(selected)[0][1], ["gone (worktree) (missing)", "old-mantis (worktree)", "old-mantis (worktree) · resources/ui"]);
  const allMissing = await boot({ "GET /api/state": baseState({ hub: true, project: null, projects: [grouped[0]] }) });
  assert.equal($(allMissing, "#project-switch p").textContent, "Every registered project directory is missing.");
  assert.equal($(allMissing, "#project-switch button").textContent, "Show 1 missing");
});
