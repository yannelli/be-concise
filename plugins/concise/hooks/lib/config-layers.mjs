const AI_UNION_KEYS = ["allow", "packs", "excludePacks"];

const FEATURE_TARGETS = {
  emDash: ["features", "emDash", "enabled"],
  aiWriting: ["features", "aiWriting", "enabled"],
  comments: ["checks", "comments"],
  fileSize: ["checks", "fileSize"],
  prBody: ["checks", "prBody"],
  stopHook: ["stopHook"],
};

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uniq = (list) => [...new Set(list)];

function unionList(base, add) {
  if (!Array.isArray(add)) return Array.isArray(base) ? base : [];
  return uniq([...(Array.isArray(base) ? base : []), ...add]);
}

/** Disable wins inside one layer; the higher layer drops an id from the opposite lower list. */
export function mergePatternLists(base, layer) {
  const layerDisable = uniq(layer.disable || []);
  const layerEnable = uniq(layer.enable || []).filter((id) => !layerDisable.includes(id));
  const enable = uniq([...(base.enable || []).filter((id) => !layerDisable.includes(id)), ...layerEnable]);
  const disable = uniq([...(base.disable || []).filter((id) => !layerEnable.includes(id)), ...layerDisable]);
  return { enable, disable };
}

function mergeOptions(base = {}, layer) {
  if (!isObject(layer)) return { ...base };
  const out = { ...base };
  for (const [id, value] of Object.entries(layer)) {
    out[id] = isObject(out[id]) && isObject(value) ? { ...out[id], ...value } : value;
  }
  return out;
}

function mergeAiWriting(base = {}, layer = {}) {
  const out = { ...base, ...layer };
  for (const key of AI_UNION_KEYS) out[key] = unionList(base[key], layer[key]);
  out.options = mergeOptions(base.options, layer.options);
  const merged = mergePatternLists(
    { enable: base.enablePatterns, disable: base.disablePatterns },
    { enable: layer.enablePatterns, disable: layer.disablePatterns },
  );
  out.enablePatterns = merged.enable;
  out.disablePatterns = merged.disable;
  return out;
}

function mergeFeatures(base = {}, layer) {
  const given = isObject(layer) ? layer : {};
  const out = { ...base, ...given };
  for (const name of Object.keys(out)) {
    if (!isObject(base[name]) && !isObject(given[name])) continue;
    out[name] = { ...(base[name] || {}), ...(given[name] || {}) };
  }
  out.aiWriting = mergeAiWriting(base.aiWriting, isObject(given.aiWriting) ? given.aiWriting : {});
  return out;
}

function mergeStringSets(base = {}, layer) {
  const given = isObject(layer) ? layer : {};
  return {
    ...base,
    ...given,
    phrases: unionList(base.phrases, given.phrases),
    patterns: unionList(base.patterns, given.patterns),
  };
}

export function applyLayer(base, layer) {
  if (!isObject(layer)) return base;
  const next = { ...base, ...layer };
  next.styleIgnoreGlobs = unionList(base.styleIgnoreGlobs, layer.styleIgnoreGlobs);
  next.checks = { ...base.checks, ...(isObject(layer.checks) ? layer.checks : {}) };
  next.log = { ...base.log, ...(isObject(layer.log) ? layer.log : {}) };
  next.allowList = mergeStringSets(base.allowList, layer.allowList);
  next.bypass = mergeStringSets(base.bypass, layer.bypass);
  next.features = mergeFeatures(base.features, layer.features);
  next.problems = base.problems;
  return next;
}

function setPath(target, path, value) {
  let node = target;
  for (const key of path.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {};
    node = node[key];
  }
  node[path[path.length - 1]] = value;
}

function featureLayer(enable, disable) {
  const layer = {};
  for (const id of enable) if (FEATURE_TARGETS[id]) setPath(layer, FEATURE_TARGETS[id], true);
  for (const id of disable) if (FEATURE_TARGETS[id]) setPath(layer, FEATURE_TARGETS[id], false);
  return layer;
}

function withAiWriting(layer, ai) {
  if (Object.keys(ai).length === 0) return layer;
  const features = isObject(layer.features) ? layer.features : {};
  const base = isObject(features.aiWriting) ? features.aiWriting : {};
  return { ...layer, features: { ...features, aiWriting: { ...base, ...ai } } };
}

export function envBaselineLayer(vars) {
  const layer = featureLayer(vars.featureEnable, vars.featureDisable);
  const ai = {};
  if (vars.enablePatterns.length) ai.enablePatterns = vars.enablePatterns;
  if (vars.disablePatterns.length) ai.disablePatterns = vars.disablePatterns;
  if (vars.loadLibPaths.length) ai.packs = vars.loadLibPaths;
  return withAiWriting(layer, ai);
}

function logLayer(log) {
  const out = {};
  if (log.enabled !== null) out.enabled = log.enabled;
  if (log.path) out.path = log.path;
  if (log.maxSize) out.maxSize = log.maxSize;
  if (log.maxFiles !== null) out.maxFiles = log.maxFiles;
  if (log.rotate) out.rotate = log.rotate;
  if (log.usePlaintext === true) out.format = "plaintext";
  else if (log.useJson === true) out.format = "json";
  return out;
}

export function envOverrideLayer(vars) {
  const layer = featureLayer(vars.alwaysEnableFeatures, vars.alwaysDisableFeatures);
  if (vars.softFail !== null) layer.softFail = vars.softFail;
  if (vars.disableStopHook !== null) layer.stopHook = !vars.disableStopHook;
  const log = logLayer(vars.log);
  if (Object.keys(log).length) layer.log = log;
  const allowList = { phrases: vars.allowPhrases, patterns: vars.allowPatterns };
  const bypass = { phrases: vars.bypassPhrases, patterns: vars.bypassPatterns };
  if (allowList.phrases.length || allowList.patterns.length) layer.allowList = allowList;
  if (bypass.phrases.length || bypass.patterns.length) layer.bypass = bypass;
  const ai = {};
  if (vars.alwaysEnablePatterns.length) ai.enablePatterns = vars.alwaysEnablePatterns;
  if (vars.alwaysDisablePatterns.length) ai.disablePatterns = vars.alwaysDisablePatterns;
  return withAiWriting(layer, ai);
}
