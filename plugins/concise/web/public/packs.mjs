import { el, button, badge, heading, panel, code, disclosure, empty, field, select } from "./ui.mjs";
import { icon } from "./icons.mjs";

export function rulesView(ctx) {
  const status = el("p", { class: "run-status", role: "status" });
  const list = el("div", { class: "pack-list" });
  const count = el("span", { class: "muted mono" });
  const updates = el("div", { class: "update-list" });
  const targets = () => ctx.state.packTargets || [{ id: "project", label: "Project" }];
  const target = select(targets().map((item) => [item.id, item.label]), ctx.packTarget || "project", (event) => { ctx.packTarget = event.target.value; });
  const query = el("input", { type: "search", placeholder: "Search pack names, categories, or patterns…", "aria-label": "Search rules", oninput: renderPacks });
  const active = select([["all", "All packs"], ["active", "Active packs"], ["inactive", "Inactive packs"]], "all", renderPacks);
  const source = el("input", { type: "text", placeholder: "https://example.com/team-words.json or ./packs/team-words.json", "aria-label": "Pack URL or path" });
  const text = el("textarea", { class: "code-editor", spellcheck: false, rows: 6, "aria-label": "Pack JSON", placeholder: '{ "id": "team-words", "feature": "aiWriting", "category": "team-words", "patterns": [{ "phrase": "synerg(?:y|ies)", "fix": "name the shared part" }] }' });

  function say(message, error = false) {
    status.textContent = message;
    status.className = error ? "run-status text-danger" : "run-status";
  }
  async function call(path, body) {
    const result = await ctx.api(path, { method: "POST", body: { target: target.value, ...body } });
    ctx.state = result.state;
    renderPacks();
    return result;
  }
  const sourceOf = (pack) => (ctx.state.packSources || {})[pack.id];
  const managed = (pack) => targets().some((item) => item.dir && pack.path && pack.path.startsWith(item.dir));

  function row(pack) {
    const installed = sourceOf(pack);
    const toggle = el("input", { type: "checkbox", role: "switch", "data-slot": "switch", checked: Boolean(pack.active), "aria-label": `Enable ${pack.id}`, onchange: async (event) => {
      const enabled = event.target.checked;
      event.target.disabled = true;
      try {
        const result = await call("/api/packs/toggle", { id: pack.id, enabled });
        say(result.warning || `${pack.id} ${enabled ? "enabled" : "disabled"} in the ${result.target} configuration. Hooks read it on their next call.`, Boolean(result.warning));
      } catch (error) {
        event.target.checked = !enabled;
        event.target.disabled = false;
        say(error.message, true);
      }
    } });
    const remove = managed(pack) ? button("Remove pack", async () => {
      try {
        await call("/api/packs/remove", { id: pack.id });
        say(`${pack.id} removed.`);
      } catch (error) { say(error.message, true); }
    }) : null;
    return el("details", { class: "pack" },
      el("summary", {}, el("span", { class: "pack-title" }, el("strong", { class: "mono" }, pack.id), el("span", { class: "muted" }, pack.categoryId || pack.feature || "custom")),
        el("span", { class: "row" }, badge(pack.builtin ? "Built-in" : installed ? "From URL" : "Custom"), badge(pack.active ? "Active" : "Inactive", pack.active ? "success" : "neutral"),
          el("span", { class: "pack-switch", onclick: (event) => event.stopPropagation() }, toggle)), icon("down", "chevron")),
      el("div", { class: "panel-body" }, el("p", { class: "muted" }, `Feature: ${pack.feature || "—"} · Scope: ${Array.isArray(pack.scope) ? pack.scope.join(", ") : pack.scope || "—"}`),
        pack.path ? el("p", { class: "muted mono" }, pack.path) : null,
        installed ? el("p", { class: "muted" }, `Installed from ${installed.url}`) : null,
        pack.description ? el("p", {}, pack.description) : null,
        disclosure("Patterns", pack.patterns || [], true), disclosure("Options", pack.options || {}), remove));
  }
  function renderPacks() {
    const packs = ctx.state.packs || [];
    const term = query.value.toLowerCase();
    const opened = new Set([...list.querySelectorAll("details.pack[open]")].map((node) => node.dataset.pack));
    const filtered = packs.filter((pack) => JSON.stringify(pack).toLowerCase().includes(term) && (active.value === "all" || Boolean(pack.active) === (active.value === "active")));
    count.textContent = `${filtered.length} of ${packs.length} packs`;
    list.replaceChildren(...(filtered.length ? filtered.map((pack) => {
      const node = row(pack);
      node.dataset.pack = pack.id;
      node.open = opened.has(pack.id);
      return node;
    }) : [empty("No packs match your filters.")]));
  }
  const add = button("Add pack", async () => {
    add.disabled = true;
    try {
      const result = await call("/api/packs/add", { source: source.value, text: text.value });
      source.value = "";
      text.value = "";
      say(result.id ? `Added ${result.id} at ${result.path}.` : `Added ${result.path} to features.aiWriting.packs in the ${target.value} configuration.`);
    } catch (error) { say(error.message, true); }
    finally { add.disabled = false; }
  }, "button primary");
  const check = button("Check for updates", async () => {
    check.disabled = true;
    updates.replaceChildren(el("p", { class: "muted" }, "Checking…"));
    try { renderUpdates(await ctx.api("/api/packs/updates")); }
    catch (error) {
      updates.replaceChildren();
      say(error.message, true);
    } finally { check.disabled = false; }
  });
  function renderUpdates(result) {
    const plugin = result.plugin;
    const verdict = (error, changed, action) => error ? badge("Check failed", "warning") : changed ? action : badge("Up to date", "success");
    const rows = [el("div", { class: "update-row" },
      el("span", {}, el("strong", {}, "Concise plugin"), el("span", { class: "muted" }, ` ${plugin.version} installed${plugin.latest ? ` · ${plugin.latest} latest` : ""}`)),
      verdict(plugin.error, plugin.updateAvailable, el("a", { href: plugin.url || "https://github.com/yannelli/be-concise/releases", target: "_blank", rel: "noreferrer" }, "Update available"))),
    ...result.packs.map((pack) => el("div", { class: "update-row" },
      el("span", {}, el("strong", { class: "mono" }, pack.id), el("span", { class: "muted" }, ` ${pack.target} · ${pack.url}`)),
      verdict(pack.error, pack.changed, button("Update", async () => {
        try {
          await call("/api/packs/update", { id: pack.id, target: pack.target });
          say(`${pack.id} updated.`);
          check.click();
        } catch (error) { say(error.message, true); }
      }, "button primary"))))];
    const errors = [plugin.error, ...result.packs.map((pack) => pack.error)].filter(Boolean);
    updates.replaceChildren(...rows,
      result.packs.length ? null : el("p", { class: "muted" }, "No packs installed from a URL. Packs added from a URL are checked here."),
      errors.length ? el("p", { class: "text-danger" }, errors.join(" ")) : null,
      plugin.updateAvailable ? el("p", { class: "muted" }, "Update the plugin from your host's plugin manager, then reload the plugin.") : null);
  }
  renderPacks();
  return el("div", {}, heading("KNOW WHAT RUNS", "Rules & usage", "Enable packs, add new ones, check for updates, and see the commands that start this console."), status,
    panel("Pattern packs", el("div", {}, el("div", { class: "pack-filters" }, query, active, count),
      el("div", { class: "pack-filters" }, field("Save changes to", target), el("span", { class: "muted" }, "Switches write excludePacks and enablePatterns to the chosen configuration. Hooks read it on their next call.")), list)),
    panel("Add a pack", el("div", { class: "pack-form" },
      field("URL or path", source, "An https URL to a .json pack is downloaded into the chosen pack directory. A local file or directory is added to features.aiWriting.packs."),
      field("Or paste pack JSON", text, "Saved as <id>.json in the chosen pack directory."), el("div", { class: "row" }, add))),
    panel("Updates", el("div", {}, el("div", { class: "pack-filters" }, check, el("span", { class: "muted" }, "Compares the plugin with the latest GitHub release and refetches packs installed from a URL.")), updates)),
    panel("Start the console", el("div", { class: "panel-body usage-instructions" },
      el("div", {}, el("h3", {}, "From the repository"), code("node bin/concise-web.mjs")),
      el("div", {}, el("h3", {}, "Install the command globally"), code("npm install -g .\nconcise-web --cwd /path/to/project")),
      el("div", {}, el("h3", {}, "Start without opening a browser"), code("concise-web --cwd /path/to/project --no-open")),
      el("div", {}, el("h3", {}, "Serve every registered project"), code("concise-web --all")),
      el("p", { class: "muted" }, "Keep the server running while you use the plugin. Open the printed URL to connect. The console observes hooks in its selected workspace; refresh configuration after changing files outside the console."))),
    panel("Rule reference", el("div", { class: "panel-body" }, disclosure("Presets and category selection", ctx.state.presets), disclosure("Categories", ctx.state.categories), disclosure("Registered hooks", ctx.state.hooks))));
}
