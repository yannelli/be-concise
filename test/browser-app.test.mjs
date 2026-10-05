import assert from "node:assert/strict";
import test from "node:test";
import { installDom, FakeEvent, byText, flush, text } from "./fake-dom.mjs";

const appUrl = "../plugins/concise/web/public/app.mjs";
let cases = 0;

const effective = {
  checks: { comments: true, fileSize: false, prBody: true }, stopHook: false, maxCommentLines: 3, maxFileLines: 480, maxPrBodySentences: 4,
  features: { aiWriting: { enabled: true, preset: "ste" }, emDash: { enabled: false, mode: "deny" } },
};
const baseState = (overrides = {}) => ({ cwd: "/work", runtime: { node: "24.1.0", platform: "linux" }, monitor: { retained: 50 }, effective, layers: [], filterLayers: [], ...overrides });
const records = [
  { id: 1, source: "live", decision: "allow", hook: "check-edit", findings: [{ category: "ai" }, { category: "ai" }, {}] },
  { id: 2, source: "test", decision: "deny", hook: "check-bash", findings: [{ category: "dash" }] },
  { id: 3, source: "live", decision: "ask", hook: "check-reply" },
  { id: 4, source: "live", decision: "block", hook: "check-edit" },
  { id: 5, source: "test", decision: "flag", hook: "check-edit" },
];

async function boot({ hash = "#token=t1", session, routes = {} } = {}) {
  const dom = installDom({ hash });
  if (session) dom.sessionStorage.setItem("concise-token", session);
  Object.assign(dom.routes, { "GET /api/state": baseState(), "GET /api/history": { records: [] } }, routes);
  await import(`${appUrl}?case=${++cases}`);
  await flush();
  return dom;
}

const $ = (dom, selector) => dom.document.querySelector(selector);
const nav = (dom, page) => $(dom, `[data-page="${page}"]`);

test("without a token the console explains how to connect and offers a reload", async () => {
  const dom = await boot({ hash: "" });
  assert.equal(dom.calls.length, 0);
  assert.equal($(dom, "#connection").textContent, "Connection unavailable");
  assert.equal($(dom, "#connection-dot").className, "dot pending");
  assert.equal($(dom, "#view h1").textContent, "Connect to your workspace");
  assert.match($(dom, "#view p.subtitle").textContent, /^Open the console URL printed by concise-web/);
  byText($(dom, "#view"), "button", "Try again").click();
  assert.equal(dom.location.reloads, 1);
  assert.equal(nav(dom, "overview").querySelector("svg").getAttribute("class"), "icon ");
});

test("a hash token is stored, removed from the URL, and sent with API calls", async () => {
  let release;
  const dom = await boot({ routes: { "GET /api/history": { records }, "GET /api/state": () => new Promise((resolve) => { release = resolve; }) } });
  nav(dom, "configuration").click();
  assert.equal($(dom, "#view .empty").textContent, "Loading your workspace…");
  release(baseState());
  await flush();
  assert.equal(dom.sessionStorage.getItem("concise-token"), "t1");
  assert.deepEqual(dom.history.calls, [[null, "", "/"]]);
  assert.deepEqual(dom.calls.map((call) => [call.method, call.url, call.headers.Authorization, call.body]), [["GET", "/api/state", "Bearer t1", undefined], ["GET", "/api/history", "Bearer t1", undefined]]);
  assert.equal(dom.sources[0].url, "/api/events?token=t1");
  assert.equal($(dom, "#breadcrumb").textContent, "Overview");
  assert.equal($(dom, "#runtime").textContent, "Node 24.1.0 · linux");
  assert.equal($(dom, "#project-switch").hidden, true);
  assert.equal($(dom, "#nav-count").textContent, "5");
});

test("the overview shows workspace status, metrics, recent activity, and rule usage", async () => {
  const dom = await boot({ routes: { "GET /api/history": { records } } });
  const view = $(dom, "#view");
  assert.equal(view.querySelector("h1").textContent, "Plugin overview");
  assert.equal(view.querySelector(".workspace-path").textContent, "/work");
  assert.equal(view.querySelector(".workspace-strip .badge").textContent, "Local");
  assert.deepEqual(view.querySelectorAll(".metric").map((node) => [node.querySelector(".metric-label").textContent, node.querySelector(".metric-value").textContent]),
    [["Live hook calls", "3"], ["Playground calls", "2"], ["Interventions", "3"], ["Text findings", "4"]]);
  assert.deepEqual(view.querySelectorAll("#recent-activity details.record").map((node) => node.querySelector(".record-main .badge").textContent), ["flag", "block", "ask", "deny"]);
  assert.deepEqual(view.querySelectorAll("#rule-usage .usage-row").map((row) => [row.querySelector("span").textContent, row.querySelector("strong").textContent, Number(row.querySelector("progress").max), Number(row.querySelector("progress").value)]),
    [["ai", "2", 2, 2], ["other", "1", 2, 1], ["dash", "1", 2, 1]]);
  assert.deepEqual(view.querySelectorAll(".check-row").map((row) => [row.querySelector(".check-label").textContent, row.querySelector(".check-indicator").className, row.querySelector(".badge").textContent, row.querySelector(".muted").textContent]), [
    ["Comment length", "check-indicator enabled", "On", "3 lines"], ["File length", "check-indicator ", "Off", "480 lines"],
    ["PR body", "check-indicator enabled", "On", "4 sentences / paragraph"], ["AI writing", "check-indicator enabled", "On", "ste"],
    ["Dash style", "check-indicator ", "Off", "deny"], ["Final replies", "check-indicator ", "Off", "Stop hook"],
  ]);
  assert.match(view.querySelector(".footnote").textContent, /last 50 retained/);
});

test("navigation switches pages, marks the active item, and ignores clicks before state loads", async () => {
  const dom = await boot();
  const pages = { configuration: "Configuration", playground: "Playground", activity: "Live activity", rules: "Rules & usage" };
  for (const [page, title] of Object.entries(pages)) {
    nav(dom, page).click();
    assert.equal($(dom, "#breadcrumb").textContent, title);
    assert.equal($(dom, "#view h1").textContent, title);
    assert.equal(nav(dom, page).classList.contains("active"), true);
    assert.equal(nav(dom, page).getAttribute("aria-current"), "page");
    assert.equal(nav(dom, "overview").classList.contains("active"), false);
    assert.equal(nav(dom, "overview").getAttribute("aria-current"), null);
  }
  const brand = new FakeEvent("click", { bubbles: true });
  $(dom, ".brand").dispatchEvent(brand);
  assert.equal(brand.defaultPrevented, true);
  assert.equal($(dom, "#breadcrumb").textContent, "Overview");
  byText($(dom, "#view"), "button", "Open playground").click();
  assert.equal($(dom, "#breadcrumb").textContent, "Playground");
  nav(dom, "overview").click();
  byText($(dom, "#view"), "button", "Edit rules").click();
  assert.equal($(dom, "#breadcrumb").textContent, "Configuration");
  nav(dom, "overview").click();
  byText($(dom, "#view"), "button", "View stream").click();
  assert.equal($(dom, "#breadcrumb").textContent, "Live activity");
});

test("a stored token, missing runtime, and empty history render empty overview states", async () => {
  const dom = await boot({ hash: "", session: "saved", routes: { "GET /api/state": baseState({ runtime: undefined, monitor: undefined }), "GET /api/history": {} } });
  assert.equal(dom.history.calls.length, 0);
  assert.equal(dom.calls[0].headers.Authorization, "Bearer saved");
  assert.equal($(dom, "#runtime").textContent, "Node  · ");
  assert.equal($(dom, "#nav-count").textContent, "0");
  assert.equal($(dom, "#recent-activity .empty strong").textContent, "Waiting for the first call");
  assert.equal($(dom, "#rule-usage .empty strong").textContent, "No findings yet");
  assert.match($(dom, "#view .footnote").textContent, /last 500 retained/);
});

for (const [name, body, message] of [
  ["object error", { error: { message: "state exploded" } }, "state exploded"],
  ["string error", { error: "plain failure" }, "plain failure"],
  ["no error", {}, "Request failed (500)"],
]) {
  test(`a failed state request with ${name} shows the connection error`, async () => {
    const dom = await boot({ routes: { "GET /api/state": { status: 500, body } } });
    assert.equal($(dom, "#view p.subtitle").textContent, message);
    assert.equal($(dom, "#connection").textContent, "Connection unavailable");
  });
}

test("views call the API with JSON bodies and surface API errors", async () => {
  const dom = await boot({ routes: { "GET /api/history": { records }, "POST /api/clear": { status: 403, body: {} } } });
  nav(dom, "activity").click();
  byText($(dom, "#view"), "button", "Clear history").click();
  await flush();
  const call = dom.calls.at(-1);
  assert.deepEqual([call.method, call.path, call.body, call.headers["Content-Type"]], ["POST", "/api/clear", {}, "application/json"]);
  assert.equal(text($(dom, "#view p.run-status")), "Request failed (403)");
  dom.routes["POST /api/clear"] = { ok: true };
  byText($(dom, "#view"), "button", "Clear history").click();
  await flush();
  assert.equal($(dom, "#nav-count").textContent, "0");
});
