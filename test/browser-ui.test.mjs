import assert from "node:assert/strict";
import test from "node:test";
import { installDom, answerDialog, change, flush, text } from "./fake-dom.mjs";

installDom({ html: false });
const ui = await import("../plugins/concise/web/public/ui.mjs");
const { icon } = await import("../plugins/concise/web/public/icons.mjs");

test("el sets listeners, classes, properties, attributes, and flattened children", () => {
  let clicks = 0;
  const child = ui.el("em", {}, "inner");
  const node = ui.el("button", { onclick: () => { clicks++; }, class: "primary", type: "submit", "data-slot": "button", "aria-label": "Go", title: null },
    ["a", [1, null, [child]]], undefined, false);
  node.click();
  assert.equal(clicks, 1);
  assert.equal(node.className, "primary");
  assert.equal(node.type, "submit");
  assert.equal(node.getAttribute("data-slot"), "button");
  assert.equal(node.getAttribute("aria-label"), "Go");
  assert.equal(node.hasAttribute("title"), false);
  assert.equal(node.textContent, "a1innerfalse");
  assert.equal(child.parentNode, node);
});

test("json, code, button, badge, heading, panel, empty, and field render their content", () => {
  assert.equal(ui.json("raw"), "raw");
  assert.equal(ui.json({ a: 1 }), '{\n  "a": 1\n}');
  assert.equal(ui.json(undefined), "null");
  const pre = ui.code({ b: 2 });
  assert.equal(pre.localName, "pre");
  assert.equal(pre.className, "payload");
  assert.match(pre.textContent, /"b": 2/);
  assert.equal(ui.button("Go", () => {}).className, "button");
  assert.equal(ui.button("Go", () => {}, "text-button").className, "text-button");
  assert.equal(ui.badge("On").className, "badge neutral");
  assert.equal(ui.badge("On", "success").className, "badge success");
  const heading = ui.heading("EYEBROW", "Title", "Subtitle", ui.button("Act", () => {}));
  assert.equal(heading.querySelector("h1").textContent, "Title");
  assert.equal(heading.querySelector("p.subtitle").textContent, "Subtitle");
  assert.equal(heading.querySelector("button").textContent, "Act");
  const panel = ui.panel("Panel", ui.el("div", {}, "body"), ui.badge("aside"));
  assert.equal(panel.querySelector("h2").textContent, "Panel");
  assert.equal(panel.querySelector(".panel-heading .badge").textContent, "aside");
  assert.equal(text(ui.empty("Nothing", "More detail")), "NothingMore detail");
  assert.equal(ui.empty("Nothing").querySelector("p"), null);
  assert.equal(ui.field("Label", ui.el("input"), "hint").querySelector("small").textContent, "hint");
  assert.equal(ui.field("Label", ui.el("input")).querySelector("small"), null);
});

test("select accepts pairs and plain options and exposes the control value", () => {
  const changes = [];
  const wrapper = ui.select([["a", "Alpha"], "b"], "b", (event) => changes.push(event.target.value));
  const control = wrapper.querySelector("select");
  assert.deepEqual(control.querySelectorAll("option").map((option) => [option.value, option.textContent, option.selected]), [["a", "Alpha", false], ["b", "b", true]]);
  assert.equal(wrapper.value, "b");
  wrapper.value = "a";
  assert.equal(control.value, "a");
  change(control, "b");
  assert.deepEqual(changes, ["b"]);
  assert.ok(wrapper.querySelector("svg.icon"));
});

test("disclosure renders closed by default and open on request", () => {
  const closed = ui.disclosure("Title", { a: 1 });
  assert.equal(closed.open, false);
  assert.equal(closed.querySelector("summary").textContent, "Title");
  assert.match(closed.querySelector("pre").textContent, /"a": 1/);
  assert.equal(ui.disclosure("Title", "x", true).open, true);
});

test("confirmDialog resolves false on cancel and restores focus", async () => {
  const previous = ui.el("button");
  document.body.append(previous);
  previous.focus();
  const result = ui.confirmDialog("Lose edits?");
  const dialog = document.body.querySelector("dialog.confirm-dialog");
  assert.equal(dialog.open, true);
  assert.match(dialog.getAttribute("aria-labelledby"), /^confirm-/);
  assert.equal(dialog.querySelector("p").textContent, "Lose edits?");
  assert.equal(dialog.querySelector("button").autofocus, true);
  document.activeElement = null;
  await answerDialog("cancel");
  assert.equal(await result, false);
  assert.equal(document.body.querySelector("dialog"), null);
  assert.equal(document.activeElement, previous);
});

test("confirmDialog resolves true on discard without a previous focus", async () => {
  document.activeElement = null;
  const result = ui.confirmDialog("Lose edits?");
  await answerDialog("discard");
  assert.equal(await result, true);
  assert.equal(document.activeElement, null);
});

test("confirmDialog treats a close without a value as cancel", async () => {
  const result = ui.confirmDialog("Escape");
  document.body.querySelector("dialog").close();
  assert.equal(await result, false);
});

test("findings renders an empty state or a row per finding with fallbacks", () => {
  assert.equal(ui.findings().querySelector("strong").textContent, "No text matches");
  assert.equal(ui.findings([]).className, "empty");
  const table = ui.findings([
    { category: "ai", line: 3, match: "delve", fix: "use explore" },
    { categoryId: "dash", message: "em dash", suggestion: "use a comma" },
    {},
  ]);
  const rows = table.querySelectorAll("tbody tr").map((row) => row.querySelectorAll("td").map((cell) => cell.textContent));
  assert.deepEqual(table.querySelectorAll("th").map((cell) => cell.textContent), ["Rule", "Line", "Match", "Suggestion"]);
  assert.deepEqual(rows, [["ai", "3", "delve", "use explore"], ["dash", "\u2014", "em dash", "use a comma"], ["finding", "\u2014", "\u2014", "\u2014"]]);
});

test("recordCard shows tone, metadata, and optional sections", () => {
  const full = ui.recordCard({
    decision: "deny", ts: Date.UTC(2026, 0, 1, 12), response: { ok: false }, stdout: "ignored", hook: "check-edit", tool: "Write", source: "test",
    durationMs: 12.345, session: "s1", cwd: "/work", findings: [{ category: "ai" }], counts: { ai: 2, dash: 1 }, error: "boom",
    request: { a: 1 }, stderr: "warn", exitCode: 0,
  }, true);
  assert.equal(full.open, true);
  assert.equal(full.querySelector(".record-main .badge").className, "badge danger");
  assert.equal(full.querySelector(".record-main strong").textContent, "check-edit");
  assert.equal(full.querySelector(".record-main .muted").textContent, "Write");
  assert.equal(full.querySelector(".record-meta .badge").textContent, "test");
  assert.equal(full.querySelector(".record-meta .mono").textContent, "12.3 ms");
  assert.equal(full.querySelector("time").textContent, new Date(Date.UTC(2026, 0, 1, 12)).toLocaleTimeString());
  assert.equal(text(full.querySelector(".record-context")), "Session: s1Workspace: /work");
  assert.ok(full.querySelector("table"));
  assert.ok(byClass(full, "p", "ai: 2 · dash: 1"));
  assert.equal(full.querySelector(".inline-error").textContent, "boom");
  const disclosures = full.querySelectorAll("details.disclosure");
  assert.deepEqual(disclosures.map((node) => [node.querySelector("summary").textContent, node.open]), [["Request", false], ["Response", true], ["Standard error", true]]);
  assert.match(disclosures[1].querySelector("pre").textContent, /"ok": false/);
  assert.ok(byClass(full, "p", "Exit code 0"));

  const ask = ui.recordCard({ decision: "ask", event: "Stop", stdout: "plain", error: { code: 1 } });
  assert.equal(ask.open, false);
  assert.equal(ask.querySelector(".record-main .badge").className, "badge warning");
  assert.equal(ask.querySelector(".record-main .muted").textContent, "Stop");
  assert.equal(ask.querySelector(".inline-error").textContent, '{\n  "code": 1\n}');
  assert.equal(ask.querySelectorAll("details.disclosure")[1].querySelector("pre").textContent, "plain");

  const bare = ui.recordCard({});
  assert.equal(bare.querySelector(".record-main .badge").textContent, "allow");
  assert.equal(bare.querySelector(".record-main .badge").className, "badge success");
  assert.equal(bare.querySelector(".record-main strong").textContent, "hook");
  assert.equal(bare.querySelector(".record-main .muted").textContent, "");
  assert.equal(bare.querySelector(".record-meta .badge").textContent, "live");
  assert.equal(bare.querySelector(".record-meta .mono").textContent, "0.0 ms");
  assert.equal(bare.querySelector("time").textContent, "Test run");
  assert.equal(text(bare.querySelector(".record-context")), "Session: \u2014Workspace: \u2014");
  assert.equal(bare.querySelector("table"), null);
  assert.equal(bare.querySelector(".inline-error"), null);
  assert.equal(bare.querySelectorAll("details.disclosure").length, 2);
  assert.equal(bare.querySelectorAll("details.disclosure")[1].querySelector("pre").textContent, "null");
  assert.equal(bare.querySelectorAll("p").length, 0);
});

function byClass(root, selector, content) {
  return root.querySelectorAll(selector).find((node) => node.textContent === content);
}

test("download creates a JSON blob link, clicks it, and revokes the URL later", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const created = t.mock.method(URL, "createObjectURL", () => "blob:test");
  const revoked = t.mock.method(URL, "revokeObjectURL", () => {});
  const clicks = [];
  const createElement = document.createElement.bind(document);
  t.mock.method(document, "createElement", (tag) => {
    const node = createElement(tag);
    if (tag === "a") node.addEventListener("click", () => clicks.push([node.href, node.download]));
    return node;
  });
  ui.download("out.json", { a: 1 });
  const blob = created.mock.calls[0].arguments[0];
  assert.equal(blob.type, "application/json");
  assert.equal(await blob.text(), '{\n  "a": 1\n}');
  assert.deepEqual(clicks, [["blob:test", "out.json"]]);
  assert.equal(revoked.mock.callCount(), 0);
  t.mock.timers.tick(1000);
  assert.deepEqual(revoked.mock.calls[0].arguments, ["blob:test"]);
  await flush(1);
});

test("icon builds an SVG with paths and falls back to the terminal icon", () => {
  const known = icon("check", "big");
  assert.equal(known.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(known.getAttribute("class"), "icon big");
  assert.equal(known.getAttribute("viewBox"), "0 0 24 24");
  assert.equal(known.getAttribute("stroke-width"), "2");
  assert.deepEqual(known.querySelectorAll("path").map((path) => path.getAttribute("d")), ["m5 12 4 4L19 6"]);
  const fallback = icon("missing");
  assert.equal(fallback.getAttribute("class"), "icon ");
  assert.deepEqual(fallback.querySelectorAll("path").map((path) => path.getAttribute("d")), ["M3 4h18v16H3z", "m7 8 3 4-3 4M13 16h4"]);
});
