import assert from "node:assert/strict";
import test from "node:test";
import { installDom, FakeEvent, byText, change, input, flush } from "./fake-dom.mjs";

installDom({ html: false });
const { rulesView } = await import("../plugins/concise/web/public/packs.mjs");

const packs = () => [
  { id: "ai-core", builtin: true, active: true, categoryId: "ai", feature: "aiWriting", scope: ["edit", "reply"], description: "Core phrases", patterns: [{ phrase: "delve" }], options: { a: 1 } },
  { id: "team-words", active: false, feature: "aiWriting", scope: "edit", path: "/home/.config/concise/packs/team-words.json" },
  { id: "local", path: "/elsewhere/local.json" },
];

function setup({ state = {}, ctx: extra = {} } = {}) {
  const calls = [];
  const ctx = {
    state: { packs: packs(), packTargets: [{ id: "project", label: "Project", dir: "/work/.claude/packs" }, { id: "user", label: "User", dir: "/home/.config/concise/packs" }],
      packSources: { "team-words": { url: "https://example.com/team-words.json" } }, presets: ["default"], categories: { ai: {} }, hooks: { Stop: [] }, ...state },
    replies: {},
    api: async (path, options) => {
      calls.push([path, options]);
      const reply = ctx.replies[path];
      if (reply instanceof Error) throw reply;
      return typeof reply === "function" ? reply(options) : reply;
    },
    ...extra,
  };
  const root = rulesView(ctx);
  const status = () => root.querySelector("p.run-status").textContent;
  const statusClass = () => root.querySelector("p.run-status").className;
  const pack = (id) => root.querySelector(`details.pack[data-pack="${id}"]`);
  const shown = () => root.querySelectorAll("details.pack").map((node) => node.dataset.pack);
  return { ctx, root, calls, status, statusClass, pack, shown };
}

test("packs render badges, details, and remove buttons for managed packs", () => {
  const view = setup();
  assert.deepEqual(view.shown(), ["ai-core", "team-words", "local"]);
  assert.equal(view.root.querySelector(".pack-filters span.mono").textContent, "3 of 3 packs");
  const core = view.pack("ai-core");
  assert.deepEqual(core.querySelectorAll("summary .badge").map((node) => node.textContent), ["Built-in", "Active"]);
  assert.equal(core.querySelector(".pack-title .muted").textContent, "ai");
  assert.equal(core.querySelector(".panel-body p").textContent, "Feature: aiWriting · Scope: edit, reply");
  assert.ok(byText(core, "p", "Core phrases"));
  assert.equal(byText(core, "button", "Remove pack"), null);
  const team = view.pack("team-words");
  assert.deepEqual(team.querySelectorAll("summary .badge").map((node) => [node.textContent, node.className]), [["From URL", "badge neutral"], ["Inactive", "badge neutral"]]);
  assert.equal(team.querySelector(".pack-title .muted").textContent, "aiWriting");
  assert.ok(byText(team, "p", "Installed from https://example.com/team-words.json"));
  assert.ok(byText(team, "p", "Scope: edit"));
  assert.ok(byText(team, "button", "Remove pack"));
  const local = view.pack("local");
  assert.deepEqual(local.querySelectorAll("summary .badge").map((node) => node.textContent), ["Custom", "Inactive"]);
  assert.equal(local.querySelector(".pack-title .muted").textContent, "custom");
  assert.equal(local.querySelector(".panel-body p").textContent, "Feature: \u2014 · Scope: \u2014");
  assert.equal(byText(local, "button", "Remove pack"), null);
  assert.equal(byText(local, "details.disclosure", "Patterns").querySelector("pre").textContent, "[]");
  assert.equal(byText(local, "details.disclosure", "Options").querySelector("pre").textContent, "{}");
  const click = new FakeEvent("click", { bubbles: true });
  local.querySelector(".pack-switch").dispatchEvent(click);
  assert.equal(click.propagationStopped, true);
});

test("default targets, missing packs, and missing sources render safely", () => {
  const view = setup({ state: { packTargets: undefined, packs: undefined, packSources: undefined } });
  assert.equal(view.root.querySelector(".pack-list .empty strong").textContent, "No packs match your filters.");
  const target = byText(view.root, "label.field", "Save changes to").querySelector("select");
  assert.deepEqual(target.querySelectorAll("option").map((option) => option.value), ["project"]);
  const plain = setup({ state: { packSources: undefined } });
  assert.deepEqual(plain.pack("team-words").querySelectorAll("summary .badge").map((node) => node.textContent), ["Custom", "Inactive"]);
});

test("search and active filters narrow the list and open packs stay open", () => {
  const view = setup({ ctx: { packTarget: "user" } });
  const target = byText(view.root, "label.field", "Save changes to").querySelector("select");
  assert.equal(target.value, "user");
  change(target, "project");
  assert.equal(view.ctx.packTarget, "project");
  view.pack("team-words").open = true;
  const query = view.root.querySelector('input[type="search"]');
  input(query, "AIWRITING");
  assert.deepEqual(view.shown(), ["ai-core", "team-words"]);
  assert.equal(view.pack("team-words").open, true);
  assert.equal(view.pack("ai-core").open, false);
  const active = view.root.querySelector(".pack-filters select");
  change(active, "active");
  assert.deepEqual(view.shown(), ["ai-core"]);
  change(active, "inactive");
  assert.deepEqual(view.shown(), ["team-words"]);
  input(query, "zzz");
  assert.equal(view.root.querySelector(".pack-filters span.mono").textContent, "0 of 3 packs");
});

test("toggling a pack posts the change and reports success, warnings, and failures", async () => {
  const view = setup();
  const nextState = { ...view.ctx.state, packs: packs().map((pack) => ({ ...pack, active: pack.id === "team-words" ? true : pack.active })) };
  view.ctx.replies["/api/packs/toggle"] = (options) => ({ target: options.body.target, state: nextState });
  change(view.pack("team-words").querySelector('input[type="checkbox"]'), true);
  await flush();
  assert.deepEqual(view.calls[0], ["/api/packs/toggle", { method: "POST", body: { target: "project", id: "team-words", enabled: true } }]);
  assert.equal(view.status(), "team-words enabled in the project configuration. Hooks read it on their next call.");
  assert.equal(view.statusClass(), "run-status");
  assert.equal(view.pack("team-words").querySelectorAll("summary .badge")[1].textContent, "Active");
  change(view.pack("ai-core").querySelector('input[type="checkbox"]'), false);
  await flush();
  assert.equal(view.status(), "ai-core disabled in the project configuration. Hooks read it on their next call.");
  view.ctx.replies["/api/packs/toggle"] = { warning: "Pack overridden by environment", target: "project", state: nextState };
  change(view.pack("local").querySelector('input[type="checkbox"]'), true);
  await flush();
  assert.equal(view.status(), "Pack overridden by environment");
  assert.equal(view.statusClass(), "run-status text-danger");
  view.ctx.replies["/api/packs/toggle"] = new Error("toggle failed");
  const box = view.pack("local").querySelector('input[type="checkbox"]');
  change(box, true);
  await flush();
  assert.equal(box.checked, false);
  assert.equal(box.disabled, false);
  assert.equal(view.status(), "toggle failed");
});

test("removing a managed pack posts and reports the result", async () => {
  const view = setup();
  view.ctx.replies["/api/packs/remove"] = { state: { ...view.ctx.state, packs: packs().slice(0, 1) } };
  byText(view.pack("team-words"), "button", "Remove pack").click();
  await flush();
  assert.deepEqual(view.calls[0], ["/api/packs/remove", { method: "POST", body: { target: "project", id: "team-words" } }]);
  assert.equal(view.status(), "team-words removed.");
  assert.deepEqual(view.shown(), ["ai-core"]);
  const failing = setup();
  failing.ctx.replies["/api/packs/remove"] = new Error("remove failed");
  byText(failing.pack("team-words"), "button", "Remove pack").click();
  await flush();
  assert.equal(failing.status(), "remove failed");
});

test("adding a pack sends the source and text and reports each result form", async () => {
  const view = setup();
  const source = view.root.querySelector('input[aria-label="Pack URL or path"]');
  const text = view.root.querySelector('textarea[aria-label="Pack JSON"]');
  const add = byText(view.root, "button", "Add pack");
  source.value = "https://example.com/new.json";
  text.value = '{"id":"new"}';
  view.ctx.replies["/api/packs/add"] = { id: "new", path: "/work/.claude/packs/new.json", state: view.ctx.state };
  add.click();
  assert.equal(add.disabled, true);
  await flush();
  assert.deepEqual(view.calls[0], ["/api/packs/add", { method: "POST", body: { target: "project", source: "https://example.com/new.json", text: '{"id":"new"}' } }]);
  assert.equal(view.status(), "Added new at /work/.claude/packs/new.json.");
  assert.equal(source.value, "");
  assert.equal(text.value, "");
  assert.equal(add.disabled, false);
  view.ctx.replies["/api/packs/add"] = { path: "./packs", state: view.ctx.state };
  add.click();
  await flush();
  assert.equal(view.status(), "Added ./packs to features.aiWriting.packs in the project configuration.");
  view.ctx.replies["/api/packs/add"] = new Error("bad pack");
  add.click();
  await flush();
  assert.equal(view.status(), "bad pack");
  assert.equal(add.disabled, false);
});

test("update checks list plugin and pack status and update actions refresh the check", async () => {
  const view = setup();
  const check = byText(view.root, "button", "Check for updates");
  const updates = view.root.querySelector(".update-list");
  let release;
  view.ctx.replies["/api/packs/updates"] = () => new Promise((resolve) => { release = resolve; });
  check.click();
  assert.equal(check.disabled, true);
  assert.equal(updates.textContent, "Checking…");
  release({
    plugin: { version: "0.10.0", latest: "0.11.0", updateAvailable: true, url: "https://example.com/release" },
    packs: [
      { id: "team-words", target: "user", url: "https://example.com/team-words.json", changed: true },
      { id: "other", target: "project", url: "https://example.com/other.json", changed: false },
      { id: "broken", target: "project", url: "https://example.com/broken.json", error: "404 not found" },
    ],
  });
  await flush();
  assert.equal(check.disabled, false);
  const rows = updates.querySelectorAll(".update-row");
  assert.equal(rows[0].querySelector("span .muted").textContent, " 0.10.0 installed · 0.11.0 latest");
  assert.equal(rows[0].querySelector("a").href, "https://example.com/release");
  assert.equal(rows[1].querySelector("span .muted").textContent, " user · https://example.com/team-words.json");
  assert.equal(rows[2].querySelector(".badge").textContent, "Up to date");
  assert.equal(rows[3].querySelector(".badge").textContent, "Check failed");
  assert.equal(updates.querySelector("p.text-danger").textContent, "404 not found");
  assert.ok(byText(updates, "p", "Update the plugin from your host's plugin manager"));
  assert.equal(byText(updates, "p", "No packs installed from a URL"), null);

  view.ctx.replies["/api/packs/update"] = { state: view.ctx.state };
  view.ctx.replies["/api/packs/updates"] = { plugin: { version: "0.11.0", error: "rate limited" }, packs: [] };
  byText(rows[1], "button", "Update").click();
  await flush();
  assert.deepEqual(view.calls.find(([path]) => path === "/api/packs/update"), ["/api/packs/update", { method: "POST", body: { target: "user", id: "team-words" } }]);
  assert.equal(view.status(), "team-words updated.");
  const after = updates.querySelectorAll(".update-row");
  assert.equal(after.length, 1);
  assert.equal(after[0].querySelector("span .muted").textContent, " 0.11.0 installed");
  assert.equal(after[0].querySelector(".badge").textContent, "Check failed");
  assert.equal(updates.querySelector("p.text-danger").textContent, "rate limited");
  assert.ok(byText(updates, "p", "No packs installed from a URL"));
  assert.equal(byText(updates, "p", "Update the plugin from your host's plugin manager"), null);
});

test("update checks report plugin defaults, update failures, and check failures", async () => {
  const view = setup();
  const check = byText(view.root, "button", "Check for updates");
  const updates = view.root.querySelector(".update-list");
  view.ctx.replies["/api/packs/updates"] = { plugin: { version: "0.10.0", updateAvailable: true }, packs: [{ id: "team-words", target: "user", url: "u", changed: true }] };
  check.click();
  await flush();
  assert.equal(updates.querySelector("a").href, "https://github.com/yannelli/be-concise/releases");
  assert.equal(updates.querySelector("p.text-danger"), null);
  const plain = setup();
  plain.ctx.replies["/api/packs/updates"] = { plugin: { version: "0.10.0" }, packs: [] };
  byText(plain.root, "button", "Check for updates").click();
  await flush();
  assert.equal(plain.root.querySelector(".update-row .badge").textContent, "Up to date");
  view.ctx.replies["/api/packs/update"] = new Error("update failed");
  byText(updates, "button", "Update").click();
  await flush();
  assert.equal(view.status(), "update failed");
  view.ctx.replies["/api/packs/updates"] = new Error("offline");
  check.click();
  await flush();
  assert.equal(updates.childNodes.length, 0);
  assert.equal(view.status(), "offline");
  assert.equal(view.statusClass(), "run-status text-danger");
  assert.equal(check.disabled, false);
});

test("usage instructions and rule reference render", () => {
  const view = setup();
  assert.ok(byText(view.root, "pre", "concise-web --all"));
  assert.deepEqual(byText(view.root, "section.panel", "Rule reference").querySelectorAll("summary").map((node) => node.textContent),
    ["Presets and category selection", "Categories", "Registered hooks"]);
});
