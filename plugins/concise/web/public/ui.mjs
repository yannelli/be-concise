import { icon } from "./icons.mjs";

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (key in node) node[key] = value;
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const json = (value) => typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
export const code = (value) => el("pre", { class: "payload" }, json(value));
export const button = (label, onClick, className = "button") => el("button", { type: "button", "data-slot": "button", class: className, onclick: onClick }, label);
export const badge = (text, kind = "neutral") => el("span", { "data-slot": "badge", class: `badge ${kind}` }, text);
export const heading = (_eyebrow, title, subtitle, action) => el("div", { class: "page-heading" }, el("div", {}, el("h1", {}, title), el("p", { class: "subtitle" }, subtitle)), action);
export const panel = (title, content, aside) => el("section", { "data-slot": "card", class: "panel" }, el("div", { "data-slot": "card-header", class: "panel-heading" }, el("h2", { "data-slot": "card-title" }, title), aside), content);
export const empty = (title, detail) => el("div", { class: "empty" }, el("strong", {}, title), detail ? el("p", {}, detail) : null);
export const field = (label, input, detail) => el("label", { class: "field" }, el("span", {}, label), input, detail ? el("small", {}, detail) : null);
export function select(options, value, onChange) {
  const control = el("select", { "data-slot": "native-select", onchange: onChange }, options.map((item) => {
    const [key, label] = Array.isArray(item) ? item : [item, item];
    return el("option", { value: key, selected: key === value }, label);
  }));
  const wrapper = el("span", { class: "native-select", "data-slot": "native-select-wrapper" }, control, icon("down"));
  Object.defineProperty(wrapper, "value", { get: () => control.value, set: (next) => { control.value = next; } });
  return wrapper;
}

export function disclosure(title, value, open = false) {
  return el("details", { class: "disclosure", open }, el("summary", {}, title, icon("down", "chevron")), code(value));
}

export function confirmDialog(description) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const titleId = `confirm-${crypto.randomUUID()}`;
    const dialog = el("dialog", { class: "confirm-dialog", "aria-labelledby": titleId, "aria-describedby": `${titleId}-description` });
    const cancel = button("Cancel", () => dialog.close("cancel"));
    const discard = button("Discard changes", () => dialog.close("discard"), "button primary");
    cancel.autofocus = true;
    dialog.append(el("div", { class: "dialog-header" }, el("h2", { id: titleId }, "Discard unsaved changes?"),
      el("p", { id: `${titleId}-description` }, description)), el("div", { class: "dialog-footer" }, cancel, discard));
    dialog.addEventListener("close", () => { const accepted = dialog.returnValue === "discard"; dialog.remove(); previousFocus?.focus(); resolve(accepted); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function findings(items) {
  if (!items?.length) return empty("No text matches", "Hook decisions and responses appear below.");
  return el("div", { class: "table-wrap" }, el("table", {},
    el("thead", {}, el("tr", {}, ["Rule", "Line", "Match", "Suggestion"].map((title) => el("th", {}, title)))),
    el("tbody", {}, items.map((item) => el("tr", {},
      el("td", {}, badge(item.category || item.categoryId || "finding")), el("td", { class: "mono" }, item.line ?? "—"),
      el("td", { class: "mono match" }, item.match ?? item.message ?? "—"), el("td", {}, item.fix || item.suggestion || "—"))))));
}

export function recordCard(record, open = false) {
  const decision = record.decision || "allow";
  const tone = ["deny", "block", "error"].includes(decision) ? "danger" : ["ask", "flag"].includes(decision) ? "warning" : "success";
  const date = record.ts ? new Date(record.ts).toLocaleTimeString() : "Test run";
  const response = record.response ?? (record.stdout || null);
  return el("details", { class: "record", open },
    el("summary", {}, el("span", { class: "record-main" }, badge(decision, tone), el("strong", {}, record.hook || "hook"), el("span", { class: "muted" }, record.tool || record.event || "")),
      el("span", { class: "record-meta" }, badge(record.source || "live"), el("span", { class: "mono" }, `${Number(record.durationMs || 0).toFixed(1)} ms`), el("time", {}, date)), icon("down", "chevron")),
    el("div", { class: "record-body" },
      el("div", { class: "record-context mono" }, `Session: ${record.session || "—"}`, el("br"), `Workspace: ${record.cwd || "—"}`),
      record.findings?.length ? findings(record.findings) : null,
      record.counts ? el("p", { class: "muted mono" }, Object.entries(record.counts).map(([key, count]) => `${key}: ${count}`).join(" · ")) : null,
      record.error ? el("div", { class: "inline-error" }, typeof record.error === "string" ? record.error : json(record.error)) : null,
      el("div", { class: "payload-grid" }, disclosure("Request", record.request), disclosure("Response", response, open)),
      record.stderr ? disclosure("Standard error", record.stderr, true) : null,
      record.exitCode != null ? el("p", { class: "muted mono" }, `Exit code ${record.exitCode}`) : null));
}

export function download(filename, value) {
  const url = URL.createObjectURL(new Blob([json(value)], { type: "application/json" }));
  const link = el("a", { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
