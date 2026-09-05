import { el, button, badge, heading, panel, code, disclosure, empty, recordCard, select } from "./ui.mjs";
import { configurationView } from "./configuration.mjs";
import { playgroundView } from "./playground.mjs";
import { activityView } from "./activity.mjs";
import { icon } from "./icons.mjs";

for (const node of document.querySelectorAll("[data-icon]")) node.replaceChildren(icon(node.dataset.icon));

const hash = new URLSearchParams(location.hash.slice(1));
const suppliedToken = hash.get("token");
if (suppliedToken) {
  sessionStorage.setItem("concise-token", suppliedToken);
  history.replaceState(null, "", location.pathname + location.search);
}
const token = suppliedToken || sessionStorage.getItem("concise-token");
const view = document.querySelector("#view");
const ctx = { state: null, records: [], page: "overview", api, onRecords: null, updateCounts };
const labels = { overview: "Overview", configuration: "Configuration", playground: "Playground", activity: "Live activity", rules: "Rules & usage" };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || result.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return result;
}
function notify(message, error = false) {
  const notice = document.querySelector("#notice");
  notice.hidden = !message;
  notice.textContent = message;
  notice.className = error ? "notice error" : "notice";
}
function connected(value) {
  document.querySelector("#connection").textContent = value ? "Stream connected" : "Reconnecting…";
  document.querySelector("#connection-dot").className = `dot ${value ? "" : "pending"}`;
}
function updateCounts() {
  document.querySelector("#nav-count").textContent = ctx.records.length;
  if (ctx.page === "overview") renderOverviewStats();
}
function navigate(page) {
  if (!ctx.state) return;
  ctx.page = page;
  ctx.onRecords = null;
  document.querySelector("#breadcrumb").textContent = labels[page];
  for (const node of document.querySelectorAll("[data-page]")) {
    node.classList.toggle("active", node.dataset.page === page);
    if (node.dataset.page === page) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  }
  const pages = { overview: overviewView, configuration: configurationView, playground: playgroundView, activity: activityView, rules: rulesView };
  view.replaceChildren(pages[page](ctx));
}
function metric(title, value, subtitle) {
  return el("div", { class: "metric", "data-slot": "card" }, el("div", { class: "metric-label" }, title), el("strong", { class: "metric-value" }, value), el("p", {}, subtitle));
}
function renderOverviewStats() {
  const stats = document.querySelector("#overview-stats");
  if (!stats) return;
  const live = ctx.records.filter((record) => record.source === "live");
  const tests = ctx.records.filter((record) => record.source === "test");
  const blocked = ctx.records.filter((record) => ["deny", "block", "ask"].includes(record.decision));
  const matches = ctx.records.reduce((count, record) => count + (record.findings?.length || 0), 0);
  stats.replaceChildren(metric("Live hook calls", live.length, "From your connected workspace"), metric("Playground calls", tests.length, "Hook invocations from test runs"), metric("Interventions", blocked.length, "Denied, blocked, or approval requested"), metric("Text findings", matches, "Reported across retained events"));
  const recent = document.querySelector("#recent-activity");
  recent.replaceChildren(...(ctx.records.length ? ctx.records.slice(-4).reverse().map((record) => recordCard(record)) : [empty("Waiting for the first call", "Test a snippet in the playground or use the plugin in this workspace.")]));
  const usage = document.querySelector("#rule-usage");
  const counts = new Map();
  for (const record of ctx.records) for (const finding of record.findings || []) counts.set(finding.category || "other", (counts.get(finding.category || "other") || 0) + 1);
  const entries = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6);
  usage.replaceChildren(...(entries.length ? entries.map(([name, count]) => el("div", { class: "usage-row" }, el("div", { class: "row" }, el("span", {}, name), el("strong", { class: "mono" }, count)), el("progress", { class: "usage-track", max: entries[0][1], value: count, "aria-label": `${name} findings` }))) : [empty("No findings yet", "Matched rules are counted here.")]));
}
function overviewView() {
  const config = ctx.state.effective;
  const rows = [
    ["Comment length", config.checks.comments, `${config.maxCommentLines} lines`],
    ["File length", config.checks.fileSize, `${config.maxFileLines} lines`],
    ["PR body", config.checks.prBody, `${config.maxPrBodySentences} sentences / paragraph`],
    ["AI writing", config.features.aiWriting.enabled, config.features.aiWriting.preset],
    ["Dash style", config.features.emDash.enabled, config.features.emDash.mode],
    ["Final replies", config.stopHook, "Stop hook"],
  ];
  const root = el("div", {}, heading("WORKSPACE STATUS", "Plugin overview", "Configure rules, inspect test results, and follow hook activity.", button("Open playground", () => navigate("playground"), "button primary")),
    el("div", { class: "workspace-strip", "data-slot": "alert" }, icon("folder", "workspace-icon"), el("div", {}, el("span", { class: "eyebrow" }, "Current workspace"), el("div", { class: "mono workspace-path" }, ctx.state.cwd)), badge("Local", "success")),
    el("div", { id: "overview-stats", class: "metrics" }),
    el("div", { class: "overview-grid" }, panel("Active configuration", el("div", { class: "check-list" }, rows.map(([label, enabled, detail]) => el("div", { class: "check-row" }, el("span", { class: `check-indicator ${enabled ? "enabled" : ""}` }, icon(enabled ? "check" : "minus")), el("span", { class: "check-label" }, label), el("span", { class: "muted mono" }, detail), badge(enabled ? "On" : "Off", enabled ? "success" : "neutral")))), button("Edit rules", () => navigate("configuration"), "text-button")),
      panel("Matched rules", el("div", { id: "rule-usage", class: "panel-body" }), badge("Retained events"))),
    panel("Recent activity", el("div", { id: "recent-activity", class: "record-list" }), button("View stream", () => navigate("activity"), "text-button")),
    el("p", { class: "muted footnote" }, `Usage totals cover the last ${ctx.state.monitor?.retained || 500} retained hook events. Live calls and playground calls are counted separately.`));
  queueMicrotask(renderOverviewStats);
  return root;
}
function rulesView() {
  const packs = ctx.state.packs || [];
  const list = el("div", { class: "pack-list" });
  const count = el("span", { class: "muted mono" });
  const query = el("input", { type: "search", placeholder: "Search pack names, categories, or patterns…", "aria-label": "Search rules", oninput: renderPacks });
  const active = select([["all", "All packs"], ["active", "Active packs"], ["inactive", "Inactive packs"]], "all", renderPacks);
  function renderPacks() {
    const term = query.value.toLowerCase();
    const filtered = packs.filter((pack) => JSON.stringify(pack).toLowerCase().includes(term) && (active.value === "all" || Boolean(pack.active) === (active.value === "active")));
    count.textContent = `${filtered.length} of ${packs.length} packs`;
    list.replaceChildren(...(filtered.length ? filtered.map((pack) => el("details", { class: "pack" },
      el("summary", {}, el("span", { class: "pack-title" }, el("strong", { class: "mono" }, pack.id), el("span", { class: "muted" }, pack.categoryId || pack.feature || "custom")),
        el("span", { class: "row" }, badge(pack.builtin ? "Built-in" : "Custom"), badge(pack.active ? "Active" : "Inactive", pack.active ? "success" : "neutral")), icon("down", "chevron")),
      el("div", { class: "panel-body" }, el("p", { class: "muted" }, `Feature: ${pack.feature || "—"} · Scope: ${Array.isArray(pack.scope) ? pack.scope.join(", ") : pack.scope || "—"}`),
        pack.description ? el("p", {}, pack.description) : null, disclosure("Patterns", pack.patterns || [], true), disclosure("Options", pack.options || {})))) : [empty("No packs match your filters.")]));
  }
  renderPacks();
  return el("div", {}, heading("KNOW WHAT RUNS", "Rules & usage", "Inspect the loaded pattern packs and the commands that start this console."),
    panel("Start the console", el("div", { class: "panel-body usage-instructions" },
      el("div", {}, el("h3", {}, "From the repository"), code("node bin/concise-web.mjs")),
      el("div", {}, el("h3", {}, "Install the command globally"), code("npm install -g .\nconcise-web --cwd /path/to/project")),
      el("div", {}, el("h3", {}, "Start without opening a browser"), code("concise-web --cwd /path/to/project --no-open")),
      el("p", { class: "muted" }, "Keep the server running while you use the plugin. Open the printed URL to connect. The console observes hooks in its selected workspace; refresh configuration after changing files outside the console."))),
    panel("Pattern packs", el("div", {}, el("div", { class: "pack-filters" }, query, active, count), list)),
    panel("Rule reference", el("div", { class: "panel-body" }, disclosure("Presets and category selection", ctx.state.presets), disclosure("Categories", ctx.state.categories), disclosure("Registered hooks", ctx.state.hooks))));
}
async function start() {
  try {
    if (!token) throw new Error("Open the console URL printed by concise-web. It includes the access token for this server.");
    const [state, history] = await Promise.all([api("/api/state"), api("/api/history")]);
    ctx.state = state;
    ctx.records = history.records || [];
    document.querySelector("#runtime").textContent = `Node ${state.runtime?.node || ""} · ${state.runtime?.platform || ""}`;
    navigate("overview");
    updateCounts();
    const events = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    events.addEventListener("ready", () => connected(true));
    events.onopen = () => connected(true);
    events.onerror = () => connected(false);
    events.addEventListener("cleared", () => { ctx.records = []; updateCounts(); ctx.onRecords?.(); });
    events.addEventListener("record", (event) => {
      try {
        const record = JSON.parse(event.data);
        if (!ctx.records.some((existing) => existing.id === record.id)) ctx.records.push(record);
        ctx.records = ctx.records.slice(-(ctx.state.monitor?.retained || 500));
        updateCounts();
        ctx.onRecords?.();
      } catch { notify("An event could not be read. Reopen the console to reload history.", true); }
    });
    window.addEventListener("pagehide", () => events.close(), { once: true });
  } catch (error) {
    document.querySelector("#connection").textContent = "Connection unavailable";
    document.querySelector("#connection-dot").className = "dot pending";
    view.replaceChildren(heading("LOCAL CONSOLE", "Connect to your workspace", error.message), button("Try again", () => location.reload(), "button primary"));
  }
}
for (const node of document.querySelectorAll("[data-page]")) node.addEventListener("click", () => navigate(node.dataset.page));
document.querySelector(".brand").addEventListener("click", (event) => { event.preventDefault(); navigate("overview"); });
start();
