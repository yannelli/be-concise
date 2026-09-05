import { el, button, badge, heading, panel, empty, recordCard, select } from "./ui.mjs";
import { configurationView } from "./configuration.mjs";
import { playgroundView } from "./playground.mjs";
import { activityView } from "./activity.mjs";
import { rulesView } from "./packs.mjs";
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
const ctx = { state: null, records: [], page: "overview", project: null, api, onRecords: null, updateCounts, visible };
const labels = { overview: "Overview", configuration: "Configuration", playground: "Playground", activity: "Live activity", rules: "Rules & usage" };

function visible() {
  return ctx.state?.hub ? ctx.records.filter((record) => record.project === ctx.project) : ctx.records;
}
async function api(path, options = {}) {
  const target = new URL(path, location.origin);
  if (ctx.project) target.searchParams.set("project", ctx.project);
  const response = await fetch(target.pathname + target.search, { ...options, headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
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
  document.querySelector("#nav-count").textContent = visible().length;
  if (ctx.page === "overview") renderOverviewStats();
}
function renderSwitcher() {
  const host = document.querySelector("#project-switch");
  host.hidden = !ctx.state?.hub;
  if (!ctx.state?.hub) return;
  const projects = ctx.state.projects || [];
  host.replaceChildren(projects.length
    ? select(projects.map((project) => [project.key, project.name]), ctx.project, async (event) => {
      ctx.project = event.target.value;
      try {
        ctx.state = await api("/api/state");
        navigate(ctx.page);
        updateCounts();
      } catch (error) { notify(error.message, true); }
    })
    : el("p", { class: "muted" }, "No projects registered yet."));
}
async function refreshProjects() {
  try {
    const { projects } = await api("/api/projects");
    ctx.state.projects = projects;
    if (!ctx.project && projects.length) {
      ctx.project = projects[0].key;
      ctx.state = await api("/api/state");
      navigate(ctx.page);
    }
    renderSwitcher();
  } catch (error) { notify(error.message, true); }
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
  if (!ctx.state.cwd && page !== "activity") {
    view.replaceChildren(heading("HUB CONSOLE", "No project registered yet", "Run any hook inside a project. The project registers itself under ~/.config/concise/projects and appears here."));
    return;
  }
  view.replaceChildren(pages[page](ctx));
}
function metric(title, value, subtitle) {
  return el("div", { class: "metric", "data-slot": "card" }, el("div", { class: "metric-label" }, title), el("strong", { class: "metric-value" }, value), el("p", {}, subtitle));
}
function renderOverviewStats() {
  const stats = document.querySelector("#overview-stats");
  if (!stats) return;
  const records = visible();
  const live = records.filter((record) => record.source === "live");
  const tests = records.filter((record) => record.source === "test");
  const blocked = records.filter((record) => ["deny", "block", "ask"].includes(record.decision));
  const matches = records.reduce((count, record) => count + (record.findings?.length || 0), 0);
  stats.replaceChildren(metric("Live hook calls", live.length, "From your connected workspace"), metric("Playground calls", tests.length, "Hook invocations from test runs"), metric("Interventions", blocked.length, "Denied, blocked, or approval requested"), metric("Text findings", matches, "Reported across retained events"));
  const recent = document.querySelector("#recent-activity");
  recent.replaceChildren(...(records.length ? records.slice(-4).reverse().map((record) => recordCard(record)) : [empty("Waiting for the first call", "Test a snippet in the playground or use the plugin in this workspace.")]));
  const usage = document.querySelector("#rule-usage");
  const counts = new Map();
  for (const record of records) for (const finding of record.findings || []) counts.set(finding.category || "other", (counts.get(finding.category || "other") || 0) + 1);
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
    el("div", { class: "workspace-strip", "data-slot": "alert" }, icon("folder", "workspace-icon"), el("div", {}, el("span", { class: "eyebrow" }, "Current workspace"), el("div", { class: "mono workspace-path" }, ctx.state.cwd)), badge(ctx.state.hub ? "Hub" : "Local", "success")),
    el("div", { id: "overview-stats", class: "metrics" }),
    el("div", { class: "overview-grid" }, panel("Active configuration", el("div", { class: "check-list" }, rows.map(([label, enabled, detail]) => el("div", { class: "check-row" }, el("span", { class: `check-indicator ${enabled ? "enabled" : ""}` }, icon(enabled ? "check" : "minus")), el("span", { class: "check-label" }, label), el("span", { class: "muted mono" }, detail), badge(enabled ? "On" : "Off", enabled ? "success" : "neutral")))), button("Edit rules", () => navigate("configuration"), "text-button")),
      panel("Matched rules", el("div", { id: "rule-usage", class: "panel-body" }), badge("Retained events"))),
    panel("Recent activity", el("div", { id: "recent-activity", class: "record-list" }), button("View stream", () => navigate("activity"), "text-button")),
    el("p", { class: "muted footnote" }, `Usage totals cover the last ${ctx.state.monitor?.retained || 500} retained hook events. Live calls and playground calls are counted separately.`));
  queueMicrotask(renderOverviewStats);
  return root;
}
async function start() {
  try {
    if (!token) throw new Error("Open the console URL printed by concise-web. It includes the access token for this server.");
    const [state, history] = await Promise.all([api("/api/state"), api("/api/history")]);
    ctx.state = state;
    ctx.project = state.project || null;
    ctx.records = history.records || [];
    document.querySelector("#runtime").textContent = `Node ${state.runtime?.node || ""} · ${state.runtime?.platform || ""}`;
    renderSwitcher();
    navigate("overview");
    updateCounts();
    const events = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    events.addEventListener("ready", () => connected(true));
    events.onopen = () => connected(true);
    events.onerror = () => connected(false);
    events.addEventListener("cleared", (event) => {
      const project = JSON.parse(event.data || "{}").project;
      ctx.records = project ? ctx.records.filter((record) => record.project !== project) : [];
      updateCounts();
      ctx.onRecords?.();
    });
    events.addEventListener("record", (event) => {
      try {
        const record = JSON.parse(event.data);
        if (!ctx.records.some((existing) => existing.id === record.id)) ctx.records.push(record);
        const retained = ctx.state.monitor?.retained || 500;
        ctx.records = ctx.records.slice(-(retained * Math.max(ctx.state.projects?.length || 1, 1)));
        if (ctx.state.hub && record.project && !ctx.state.projects.some((project) => project.key === record.project)) refreshProjects();
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
