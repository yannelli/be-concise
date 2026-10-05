import assert from "node:assert/strict";
import test from "node:test";
import { installDom, FakeEvent, change } from "./fake-dom.mjs";

const themeUrl = "../plugins/concise/web/public/theme.mjs";
let cases = 0;

async function load(options, prepare = () => {}) {
  const dom = installDom(options);
  prepare(dom);
  await import(`${themeUrl}?case=${++cases}`);
  return dom;
}

const icon = (dom) => dom.document.querySelector('link[rel="icon"]').href;
const storage = (dom, key, newValue) => dom.window.dispatchEvent(new FakeEvent("storage", { key, newValue }));

test("saved preference applies before the control exists and the control persists changes", async () => {
  let control;
  const dom = await load({}, (setup) => {
    setup.localStorage.setItem("concise-theme", "dark");
    control = setup.document.getElementById("theme");
    control.remove();
  });
  assert.equal(dom.document.documentElement.dataset.theme, "dark");
  assert.equal(icon(dom), "/icon-dark.svg");
  dom.document.querySelector(".theme-control").append(control);
  dom.document.dispatchEvent(new FakeEvent("DOMContentLoaded"));
  assert.equal(control.value, "dark");
  change(control, "light");
  assert.equal(dom.localStorage.getItem("concise-theme"), "light");
  assert.equal(dom.document.documentElement.dataset.theme, "light");
  assert.equal(icon(dom), "/icon.svg");
  assert.equal(control.value, "light");
});

test("storage events update the preference and ignore other keys", async () => {
  const dom = await load({ dark: true });
  const control = dom.document.getElementById("theme");
  assert.equal(control.value, "system");
  assert.equal(dom.document.documentElement.dataset.theme, "dark");
  storage(dom, "concise-theme", "light");
  assert.equal(control.value, "light");
  assert.equal(dom.document.documentElement.dataset.theme, "light");
  storage(dom, "other", "dark");
  assert.equal(control.value, "light");
  storage(dom, null, null);
  assert.equal(control.value, "system");
  assert.equal(dom.document.documentElement.dataset.theme, "dark");
  storage(dom, "concise-theme", "dark");
  assert.equal(control.value, "dark");
  storage(dom, "concise-theme", "neon");
  assert.equal(control.value, "system");
});

test("system preference changes apply when the preference follows the system", async () => {
  const dom = await load({}, (setup) => setup.localStorage.setItem("concise-theme", "neon"));
  assert.equal(dom.document.documentElement.dataset.theme, "light");
  dom.media.matches = true;
  dom.media.dispatchEvent(new FakeEvent("change"));
  assert.equal(dom.document.documentElement.dataset.theme, "dark");
  assert.equal(icon(dom), "/icon-dark.svg");
});

test("blocked storage falls back to the system preference and still applies changes", async () => {
  const dom = await load({ storageOptions: { failGet: true, failSet: true } });
  const control = dom.document.getElementById("theme");
  assert.equal(control.value, "system");
  dom.document.dispatchEvent(new FakeEvent("DOMContentLoaded"));
  change(control, "dark");
  assert.equal(dom.document.documentElement.dataset.theme, "dark");
  assert.equal(dom.localStorage.values.size, 0);
});
