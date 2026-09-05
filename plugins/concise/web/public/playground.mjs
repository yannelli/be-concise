import { el, button, badge, heading, panel, field, select, disclosure, findings, recordCard, empty } from "./ui.mjs";
import { icon } from "./icons.mjs";

const examples = {
  Write: "Let's delve into this powerful solution.\n\nThe parser runs first — then it checks the input.\n\nIn conclusion, this is a game-changer.",
  Edit: "The parser runs first — then it checks the input.",
  MultiEdit: "Let's delve into this powerful solution.",
  apply_patch: "*** Begin Patch\n*** Add File: example.md\n+Let's delve into this powerful solution.\n*** End Patch",
  Bash: "git commit -m \"Leverage a robust solution — streamline the workflow\"",
  Stop: "Let's delve into the changes.\n\nThe parser runs first — then it checks the input.",
  raw: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "example.md", content: "Let's delve into this powerful solution." } }, null, 2),
};

export function playgroundView(ctx) {
  const draft = ctx.playground ||= { kind: "Write", text: examples.Write, path: "example.md", session: "", config: "", stopHookActive: false };
  const output = el("div", { class: "playground-output" });
  const status = el("span", { class: "muted", role: "status" });
  const run = button("Run hooks", runTest, "button primary");
  const input = el("textarea", { class: "code-editor playground-editor", spellcheck: false, value: draft.text, "aria-label": "Text or hook event to test", oninput: (event) => { draft.text = event.target.value; } });
  const config = el("textarea", { class: "code-editor preview-editor", spellcheck: false, placeholder: '{\n  "features": {\n    "aiWriting": { "enabled": true }\n  }\n}', value: draft.config, "aria-label": "Preview configuration override", oninput: (event) => { draft.config = event.target.value; } });
  const kind = select(Object.keys(examples), draft.kind, (event) => {
    draft.kind = event.target.value;
    hint.textContent = hintFor(draft.kind);
    stop.hidden = draft.kind !== "Stop";
  });
  const hintFor = (value) => value === "Bash" ? "The Bash hook inspects this command. The command is not executed." : value === "raw" ? "Paste the full hook event as JSON. The event chooses the matching hooks." : value === "apply_patch" ? "Paste a complete patch. The hook checks its added text." : "Paste text to inspect each registered hook and its exact response.";
  const hint = el("p", { class: "editor-hint" }, hintFor(draft.kind));
  const session = el("input", { type: "text", value: draft.session, class: "mono", readOnly: true, placeholder: "Created on the first run" });
  const stop = el("label", { class: "toggle-row", hidden: draft.kind !== "Stop" }, el("span", {}, "Stop hook already active"), el("input", { type: "checkbox", role: "switch", checked: draft.stopHookActive, onchange: (event) => { draft.stopHookActive = event.target.checked; } }));
  const reset = button("New session", () => {
    draft.session = "";
    session.value = draft.session;
    status.textContent = "New session. Confirmation and retry state start fresh.";
  });
  const resetState = el("label", { class: "toggle-row" }, el("span", {}, "Reset session before this run"), el("input", { type: "checkbox" }));

  function renderResult(result) {
    const hooks = result.hooks || [];
    output.replaceChildren(el("div", { class: "section-title" }, el("h2", {}, "Inspection result"), badge(`${hooks.length} hook${hooks.length === 1 ? "" : "s"} invoked`, "success")),
      panel("Text matches", findings(result.matches || hooks.flatMap((hook) => hook.findings || []))),
      el("div", { class: "hook-results" }, hooks.length ? hooks.map((hook) => recordCard(hook, true)) : empty("No registered hook matched this event.")),
      disclosure("Exact event sent to hooks", result.request), disclosure("Configuration used for this run", result.config));
  }
  async function runTest() {
    try {
      const override = config.value.trim() ? JSON.parse(config.value) : undefined;
      if (override && (typeof override !== "object" || Array.isArray(override))) throw new Error("Preview configuration must be a JSON object.");
      run.disabled = true;
      status.className = "muted";
      status.textContent = "Running registered hooks…";
      const result = await ctx.api("/api/test", { method: "POST", body: { kind: draft.kind, text: input.value, path: draft.path, session: draft.session, reset: resetState.querySelector("input").checked, stopHookActive: draft.stopHookActive, ...(draft.kind === "raw" ? { event: JSON.parse(input.value) } : {}), ...(override ? { config: override } : {}) } });
      draft.session = result.session || draft.session;
      session.value = draft.session;
      draft.result = result;
      renderResult(result);
      status.textContent = "Complete. Repeat this run to inspect confirmation and retry behavior.";
    } catch (error) {
      status.className = "text-danger";
      status.textContent = error.message;
    } finally { run.disabled = false; }
  }
  if (draft.result) renderResult(draft.result);
  else output.append(empty("Your next test starts here", "Paste some text and run the hooks to see matches, decisions, and responses."));
  return el("div", {}, heading("TRY YOUR RULES", "Playground", "Inspect a tool call or final reply using the plugin's registered hooks."),
    panel("Test input", el("div", {}, el("div", { class: "panel-body fields-grid" }, field("Tool / event", kind), field("Target path", el("input", { value: draft.path, type: "text", oninput: (event) => { draft.path = event.target.value; } }))),
      hint, input, el("div", { class: "editor-footer" }, button("Load example", () => { input.value = examples[draft.kind]; draft.text = input.value; }), run))),
    el("details", { class: "advanced-options" }, el("summary", {}, "Session & preview options", icon("down", "chevron")), el("div", { class: "panel-body" },
      el("div", { class: "source-row" }, field("Session ID", session), reset),
      el("p", { class: "muted" }, "Keep the same session to test confirmations and retry limits. Preview overrides apply to this test without saving a configuration file."), resetState, stop,
      field("Configuration override (JSON, optional)", config))),
    el("div", { class: "run-status" }, status), output);
}
