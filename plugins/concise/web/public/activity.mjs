import { el, button, badge, heading, panel, field, select, empty, recordCard, download } from "./ui.mjs";

export function activityView(ctx) {
  const filters = ctx.activityFilters ||= { source: "all", decision: "all", hook: "all", session: "", search: "" };
  let paused = false;
  let snapshot = ctx.records.slice();
  const records = el("div", { class: "record-list" });
  const count = el("span", { class: "muted mono" });
  const status = el("span", { class: "muted", role: "status" });
  const pause = button("Pause display", () => {
    paused = !paused;
    if (paused) snapshot = ctx.records.slice();
    pause.textContent = paused ? "Resume display" : "Pause display";
    status.textContent = paused ? "Display paused. Incoming events are still retained." : "";
    update();
  });
  function visible() {
    return (paused ? snapshot : ctx.records).filter((record) => (filters.source === "all" || record.source === filters.source)
      && (filters.decision === "all" || record.decision === filters.decision)
      && (filters.hook === "all" || record.hook === filters.hook)
      && (!filters.session || String(record.session || "").includes(filters.session))
      && (!filters.search || JSON.stringify(record).toLowerCase().includes(filters.search.toLowerCase())));
  }
  function update() {
    const opened = new Set([...records.querySelectorAll("details.record[open]")].map((node) => node.dataset.record));
    const items = visible();
    count.textContent = `${items.length} / ${(paused ? snapshot : ctx.records).length} events`;
    records.replaceChildren(...(items.length ? [...items].reverse().map((record) => {
      const node = recordCard(record, opened.has(String(record.id)));
      node.dataset.record = record.id;
      return node;
    }) : [empty("No activity to display", "Run a playground test or invoke the plugin in this workspace. Events appear here as hooks respond.")]));
  }
  const choice = (key, options) => select(options, filters[key], (event) => { filters[key] = event.target.value; update(); });
  const textFilter = (key, placeholder) => el("input", { type: "search", value: filters[key], placeholder, oninput: (event) => { filters[key] = event.target.value; update(); } });
  const hooks = [...new Set(["check-edit", "check-bash", "check-reply", "test-filter", ...ctx.records.map((record) => record.hook).filter(Boolean)])];
  const clear = button("Clear history", async () => {
    try {
      await ctx.api("/api/clear", { method: "POST", body: {} });
      ctx.records = [];
      snapshot = [];
      status.textContent = "Retained history cleared.";
      update();
      ctx.updateCounts();
    } catch (error) { status.textContent = error.message; }
  });
  const root = el("div", {}, heading("FOLLOW EACH CALL", "Live activity", "Requests, decisions, and responses from the playground and this workspace.",
    el("div", { class: "row" }, button("Export JSON", () => download("concise-activity.json", visible())), pause)),
    panel("Event stream", el("div", {}, el("div", { class: "activity-filters" },
      field("Source", choice("source", [["all", "All sources"], ["live", "Live hooks"], ["test", "Playground"]])),
      field("Decision", choice("decision", [["all", "All decisions"], ...["allow", "flag", "deny", "ask", "block", "bypass", "rewrite", "error"]])),
      field("Hook", choice("hook", [["all", "All hooks"], ...hooks])),
      field("Session", textFilter("session", "Filter by session")), field("Search", textFilter("search", "Search payloads…"))),
      el("div", { class: "stream-toolbar" }, count, el("div", { class: "row" }, badge("Live stream", "success"), clear)), records),
      badge(`Last ${ctx.state.monitor?.retained || 500} events`)), el("p", { class: "run-status" }, status));
  update();
  ctx.onRecords = update;
  return root;
}
