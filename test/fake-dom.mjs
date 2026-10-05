import { readFileSync } from "node:fs";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const PROPS = ["id", "type", "href", "rel", "download", "placeholder", "target", "min", "max", "rows", "src", "alt", "width", "height", "spellcheck", "name"];
const BOOLS = ["hidden", "open", "disabled", "checked", "selected", "readOnly", "autofocus"];
const VOID = new Set(["meta", "link", "img", "br", "input"]);
const camel = (name) => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

export class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = false;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    Object.assign(this, init);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ fn, once: Boolean(options?.once) });
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry.fn !== fn));
  }
  dispatchEvent(event) {
    event.target ??= this;
    for (let node = this; node; node = event.bubbles ? node.parentNode : null) {
      event.currentTarget = node;
      for (const entry of [...(node.listeners.get(event.type) || [])]) {
        if (entry.once) node.removeEventListener(event.type, entry.fn);
        entry.fn.call(node, event);
      }
      if (typeof node[`on${event.type}`] === "function") node[`on${event.type}`](event);
      if (event.propagationStopped) break;
    }
    return !event.defaultPrevented;
  }
}

export class Node extends Target {
  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }
  get textContent() { return this.childNodes.map((child) => child.textContent).join(""); }
  set textContent(value) {
    const text = value == null ? "" : String(value);
    this.replaceChildren(...(text ? [this.ownerDocument.createTextNode(text)] : []));
  }
  append(...nodes) {
    for (const item of nodes) {
      const node = item instanceof Node ? item : this.ownerDocument.createTextNode(String(item));
      node.remove();
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this);
    this.parentNode = null;
  }
  get children() { return this.childNodes.filter((child) => child instanceof Element); }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === this.ownerDocument;
  }
  *descendants() {
    for (const child of this.children) {
      yield child;
      yield* child.descendants();
    }
  }
  querySelectorAll(selector) {
    const chains = selector.split(",").map((part) => part.match(/(?:[^\s"]+|"[^"]*")+/g).map(parseCompound));
    return [...this.descendants()].filter((node) => chains.some((chain) => matchesChain(node, chain, this)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class Text extends Node {
  constructor(ownerDocument, data) {
    super(ownerDocument);
    this.data = data;
  }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
}

export class Element extends Node {
  constructor(ownerDocument, tagName, namespaceURI = HTML_NS) {
    super(ownerDocument);
    this.tagName = namespaceURI === HTML_NS ? tagName.toUpperCase() : tagName;
    this.localName = tagName.toLowerCase();
    this.namespaceURI = namespaceURI;
    this.attributes = new Map();
    this.dataset = new Proxy({}, { set: (values, key, value) => { values[key] = String(value); return true; } });
    this.className = "";
    for (const prop of PROPS) this[prop] = "";
    for (const prop of BOOLS) this[prop] = false;
    this.rawValue = "";
    this.returnValue = "";
  }
  get value() {
    if (this.localName !== "select") return this.rawValue;
    const options = this.querySelectorAll("option");
    return (options.find((option) => option.selected) || options[0])?.value ?? "";
  }
  set value(next) {
    if (this.localName === "select") {
      for (const option of this.querySelectorAll("option")) option.selected = option.value === String(next);
      return;
    }
    const text = next == null ? "" : String(next);
    this.rawValue = this.type === "number" && (text === "" || Number.isNaN(Number(text))) ? "" : text;
  }
  get classList() {
    const list = () => this.className.split(/\s+/).filter(Boolean);
    return {
      contains: (name) => list().includes(name),
      add: (...names) => { this.className = [...new Set([...list(), ...names])].join(" "); },
      remove: (...names) => { this.className = list().filter((name) => !names.includes(name)).join(" "); },
      toggle: (name, force = !list().includes(name)) => {
        if (force) this.classList.add(name);
        else this.classList.remove(name);
        return force;
      },
    };
  }
  setAttribute(name, value) {
    const text = String(value);
    if (name === "class") this.className = text;
    else if (name.startsWith("data-")) this.dataset[camel(name)] = text;
    else if (BOOLS.includes(name)) this[name] = true;
    else if (PROPS.includes(name) || name === "value") this[name] = text;
    else this.attributes.set(name, text);
  }
  getAttribute(name) {
    if (name === "class") return this.className || null;
    if (name.startsWith("data-")) return this.dataset[camel(name)] ?? null;
    if (BOOLS.includes(name)) return this[name] ? "" : null;
    if (PROPS.includes(name) || name === "value") return this[name] || null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    if (name.startsWith("data-")) delete this.dataset[camel(name)];
    else if (BOOLS.includes(name)) this[name] = false;
    else this.attributes.delete(name);
  }
  click() { return this.dispatchEvent(new FakeEvent("click", { bubbles: true })); }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; }
  close(returnValue) {
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.open = false;
    this.dispatchEvent(new FakeEvent("close"));
  }
}

function parseCompound(text) {
  const part = { tag: null, id: null, classes: [], attrs: [] };
  const pattern = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  for (const match of text.matchAll(pattern)) {
    if (match[1]) part.tag = match[1].toLowerCase();
    else if (match[2]) part.id = match[2];
    else if (match[3]) part.classes.push(match[3]);
    else part.attrs.push([match[4], match[5]]);
  }
  return part;
}

function matchesCompound(node, part) {
  return (!part.tag || node.localName === part.tag) && (!part.id || node.id === part.id)
    && part.classes.every((name) => node.classList.contains(name))
    && part.attrs.every(([name, value]) => value === undefined ? node.hasAttribute(name) : node.getAttribute(name) === value);
}

function matchesChain(node, chain, scope) {
  if (!matchesCompound(node, chain.at(-1))) return false;
  let index = chain.length - 2;
  for (let parent = node.parentNode; index >= 0 && parent && parent !== scope.parentNode; parent = parent.parentNode) {
    if (parent instanceof Element && matchesCompound(parent, chain[index])) index--;
  }
  return index < 0;
}

class Document extends Node {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this.activeElement = null;
    this.documentElement = this.createElement("html");
    this.head = this.createElement("head");
    this.body = this.createElement("body");
    this.documentElement.append(this.head, this.body);
    this.append(this.documentElement);
  }
  createElement(tag) { return new Element(this, tag); }
  createElementNS(namespace, tag) { return new Element(this, tag, namespace); }
  createTextNode(text) { return new Text(this, String(text)); }
  getElementById(id) { return [...this.descendants()].find((node) => node.id === id) || null; }
}

export function parseHtml(document, html) {
  const stack = [document.documentElement];
  const tags = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
  for (const [, closing, tag, attrs, selfClosing, text] of html.matchAll(tags)) {
    const top = stack.at(-1);
    if (text !== undefined) {
      if (text.trim()) top.append(text);
    } else if (closing) {
      if (stack.length > 1 && stack.at(-1).localName === closing.toLowerCase()) stack.pop();
    } else if (tag) {
      const name = tag.toLowerCase();
      if (name === "html") continue;
      const node = name === "head" ? document.head : name === "body" ? document.body
        : name === "svg" || name === "path" ? document.createElementNS("http://www.w3.org/2000/svg", name) : document.createElement(name);
      for (const [, key, value] of attrs.matchAll(/([^\s=/>]+)(?:="([^"]*)")?/g)) node.setAttribute(key, value ?? "");
      if (node.parentNode !== document.documentElement) top.append(node);
      if (!selfClosing && !VOID.has(name)) stack.push(node);
    }
  }
}

function storage({ failGet = false, failSet = false } = {}) {
  const values = new Map();
  return {
    values,
    getItem(key) {
      if (failGet) throw new Error("storage blocked");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (failSet) throw new Error("storage blocked");
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

export class FakeEventSource extends Target {
  static instances = [];
  constructor(url) {
    super();
    this.url = url;
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  close() { this.closed = true; }
  emit(type, data) { this.dispatchEvent(new FakeEvent(type, data === undefined ? {} : { data })); }
}

const indexHtml = new URL("../plugins/concise/web/public/index.html", import.meta.url);

export function installDom({ html = true, hash = "", storageOptions = {}, dark = false } = {}) {
  const document = new Document();
  if (html) parseHtml(document, readFileSync(indexHtml, "utf8"));
  const window = new Target();
  const media = new Target();
  media.matches = dark;
  const location = { origin: "http://127.0.0.1:4100", pathname: "/", search: "", hash, reloads: 0, reload() { this.reloads++; } };
  const history = { calls: [], replaceState(...args) { this.calls.push(args); location.hash = ""; } };
  const calls = [];
  const routes = {};
  FakeEventSource.instances = [];
  const globals = {
    document, window, location, history, Node,
    localStorage: storage(storageOptions), sessionStorage: storage(),
    matchMedia: (query) => Object.assign(media, { media: query }),
    EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      const parsed = new URL(url, location.origin);
      const method = options.method || "GET";
      const body = options.body === undefined ? undefined : JSON.parse(options.body);
      calls.push({ url, path: parsed.pathname, query: Object.fromEntries(parsed.searchParams), method, body, headers: options.headers });
      const handler = routes[`${method} ${parsed.pathname}`];
      let result = typeof handler === "function" ? await handler(body, parsed) : handler;
      if (result === undefined) result = { status: 404, body: { error: `No route ${method} ${parsed.pathname}` } };
      else if (!(result && typeof result === "object" && "status" in result)) result = { status: 200, body: result };
      return { ok: result.status < 400, status: result.status, json: async () => result.body };
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true, enumerable: true });
  }
  return { document, window, location, history, media, calls, routes, sources: FakeEventSource.instances, localStorage: globals.localStorage, sessionStorage: globals.sessionStorage };
}

export const flush = async (rounds = 6) => {
  for (let index = 0; index < rounds; index++) await new Promise((resolve) => setImmediate(resolve));
};

export const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

export function byText(root, selector, needle) {
  return root.querySelectorAll(selector).find((node) => node.textContent.includes(needle)) || null;
}

export function fire(node, type, props = {}) {
  Object.assign(node, props);
  return node.dispatchEvent(new FakeEvent(type, { bubbles: true }));
}

export const change = (node, value) => fire(node, "change", typeof value === "boolean" ? { checked: value } : { value });
export const input = (node, value) => fire(node, "input", { value });

export async function answerDialog(choice) {
  await flush(1);
  const dialog = document.body.querySelector("dialog");
  if (!dialog) throw new Error("No dialog open");
  byText(dialog, "button", choice === "discard" ? "Discard changes" : "Cancel").click();
  await flush();
}
