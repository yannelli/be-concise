import { el, json, button, badge, heading, panel, field, select, disclosure, confirmDialog } from "./ui.mjs";

const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
function set(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let parent = object;
  for (const key of keys) {
    if (!parent[key] || typeof parent[key] !== "object" || Array.isArray(parent[key])) parent[key] = {};
    parent = parent[key];
  }
  parent[last] = value;
}

export function configurationView(ctx) {
  let state = ctx.state;
  const allLayers = () => [...state.layers, ...(state.filterLayers || []).map((layer) => ({ ...layer, filter: true }))];
  let selected = allLayers().find((layer) => layer.id === ctx.configLayer) || state.layers.find((layer) => layer.active && /project/i.test(layer.id)) || state.layers.find((layer) => layer.id === "project-claude") || state.layers[0];
  const container = el("div");
  const status = el("span", { class: "muted", role: "status" });
  const editor = el("textarea", { class: "code-editor config-editor", spellcheck: false, "aria-label": "Configuration JSON" });
  const common = el("div", { class: "common-controls" });
  const editorHint = el("p", { class: "editor-hint" });
  const path = el("p", { class: "source-path mono" });
  const layerState = el("div", { class: "row" });
  const effective = el("div");
  const reset = button("Discard changes", () => loadLayer(selected));
  const save = button("Save configuration", saveLayer, "button primary");
  const layerSelect = select(allLayers().map((layer) => [layer.id, `${layer.label}${layer.filter ? " · filter pack" : ""}`]), selected?.id, async (event) => {
    if (editor.value !== (selected.text || (selected.filter ? "" : "{}")) && !await confirmDialog("Your edits to this configuration layer have not been saved.")) {
      event.target.value = selected.id;
      return;
    }
    selected = allLayers().find((layer) => layer.id === event.target.value);
    ctx.configLayer = selected.id;
    loadLayer(selected);
  });

  function parse() {
    const value = JSON.parse(editor.value);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuration must be a JSON object.");
    return value;
  }
  function updateStatus(message, error = false) {
    status.textContent = message;
    status.className = error ? "text-danger" : "muted";
  }
  function update(key, value) {
    try {
      const parsed = parse();
      set(parsed, key, value);
      editor.value = json(parsed);
      updateStatus("Unsaved changes");
    } catch (error) {
      updateStatus(error.message, true);
    }
  }
  function controls() {
    common.replaceChildren();
    if (selected.filter) return;
    let draft;
    try { draft = parse(); } catch { return; }
    const value = (key) => get(draft, key) ?? get(state.effective, key);
    const toggle = (label, key) => el("label", { class: "toggle-row" }, el("span", {}, label),
      el("input", { type: "checkbox", role: "switch", "data-slot": "switch", checked: Boolean(value(key)), onchange: (event) => update(key, event.target.checked) }));
    const number = (label, key) => field(label, el("input", { type: "number", min: 0, value: value(key), onchange: (event) => {
      if (event.target.value !== "") update(key, Number(event.target.value));
    } }));
    const mode = (key) => field("Response mode", select(["confirm", "ask", "deny"], value(key), (event) => update(key, event.target.value)));
    const presets = Array.isArray(state.presets) ? state.presets.map((preset) => typeof preset === "string" ? preset : preset.id || preset.name) : Object.keys(state.presets || {});
    common.append(
      panel("Core checks", el("div", { class: "control-body" }, toggle("Comment length", "checks.comments"), toggle("File length", "checks.fileSize"), toggle("PR body length", "checks.prBody"), toggle("Final reply hook", "stopHook"), toggle("Soft fail", "softFail"))),
      panel("Thresholds", el("div", { class: "control-body fields-grid" }, number("Comment lines", "maxCommentLines"), number("File lines", "maxFileLines"), number("PR paragraphs", "maxPrBodyParagraphs"), number("PR sentences", "maxPrBodySentences"), number("Retries", "maxRetries"))),
      panel("AI writing", el("div", { class: "control-body" }, toggle("Enabled", "features.aiWriting.enabled"), toggle("Check final replies", "features.aiWriting.replies"),
        field("Preset", select(presets.length ? presets : ["default"], value("features.aiWriting.preset"), (event) => update("features.aiWriting.preset", event.target.value))), mode("features.aiWriting.mode"))),
      panel("Dash style", el("div", { class: "control-body" }, toggle("Em dash check", "features.emDash.enabled"), toggle("Include en dashes", "features.emDash.enDash"), toggle("Include double hyphens", "features.emDash.doubleHyphen"), toggle("Check final replies", "features.emDash.replies"), mode("features.emDash.mode")))
    );
  }
  function renderEffective() {
    effective.replaceChildren(panel("Configuration reference", el("div", { class: "panel-body" },
      el("p", { class: "muted" }, "File layers and environment overrides determine the effective configuration. Common controls use effective values until you set them in the selected layer."),
      disclosure("Effective configuration", state.effective), disclosure("Built-in defaults", state.defaults), disclosure("Environment overrides", state.environment || {}),
      disclosure("Hook registrations", state.hooks), ...(state.problems?.length ? [disclosure("Configuration problems", state.problems, true)] : []))));
  }
  function loadLayer(layer) {
    editor.value = layer.text || (layer.filter ? "" : "{}");
    editor.setAttribute("aria-label", layer.filter ? "Shell filter settings" : "Configuration JSON");
    editorHint.textContent = layer.filter ? "Edit shell filter settings as assignments. FILTER_PATTERN accepts a single-quoted pattern. Comments and blank lines are supported." : "Edit the full JSON file, including logging, ignore paths, allow lists, bypass rules, and custom pattern options.";
    path.textContent = layer.path;
    layerState.replaceChildren(badge(layer.exists ? "File exists" : "New file"), ...(layer.filter ? [] : [badge(layer.active ? "Active layer" : "Inactive layer", layer.active ? "success" : "neutral")]));
    updateStatus(layer.error || "Changes are saved to this file.", Boolean(layer.error));
    controls();
  }
  async function saveLayer() {
    try {
      if (!selected.filter) parse();
      save.disabled = true;
      updateStatus("Saving…");
      state = await ctx.api("/api/config", { method: "PATCH", body: { id: selected.id, text: editor.value, revision: selected.revision } });
      ctx.state = state;
      selected = allLayers().find((layer) => layer.id === selected.id);
      loadLayer(selected);
      renderEffective();
      updateStatus("Saved. Hooks read this configuration on their next invocation.");
    } catch (error) {
      updateStatus(error.status === 409 ? "This file changed on disk. Copy your edits, then reload before saving." : error.message, true);
    } finally { save.disabled = false; }
  }
  editor.addEventListener("input", () => {
    try { if (!selected.filter) parse(); updateStatus("Unsaved changes"); controls(); }
    catch (error) { updateStatus(error.message, true); }
  });
  const reload = button("Reload from disk", async () => {
    if (editor.value !== (selected.text || (selected.filter ? "" : "{}")) && !await confirmDialog("Reloading from disk will replace your unsaved edits.")) return;
    try {
      state = await ctx.api("/api/state");
      ctx.state = state;
      selected = allLayers().find((layer) => layer.id === selected.id) || state.layers[0];
      loadLayer(selected);
      renderEffective();
    } catch (error) { updateStatus(error.message, true); }
  });
  container.append(heading("MAKE IT YOURS", "Configuration", "Set your checks, tune their limits, and edit every configuration key.", reload),
    panel("Configuration source", el("div", { class: "panel-body" }, el("div", { class: "source-row" }, field("Layer", layerSelect), layerState), path)),
    common,
    panel("File editor", el("div", {}, editorHint, editor,
      el("div", { class: "editor-footer" }, status, el("div", { class: "row" }, reset, save)))), effective);
  if (selected) loadLayer(selected);
  renderEffective();
  return container;
}
