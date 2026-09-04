# Pattern packs

Every category is one pack file. The built-in packs live under `hooks/lib/patterns/`: `ai/` for writing patterns, `git/` for commit, PR, and review checks, `prose/` for punctuation. A project adds its own packs the same way.

A `.mjs` pack executes code from the checkout. The hook imports it, so its top-level code and its `detect` function run in the hook process with your permissions on every tool call. Read a `.mjs` pack before you add it. A `.json` pack holds data only.

## Where packs load from, in order

1. `hooks/lib/patterns/` (the built-in packs).
2. `<cwd>/.claude/concise/patterns/`.
3. `<cwd>/.codex/concise/patterns/`.
4. Each entry in `features.aiWriting.packs`, in list order. `BEC_LOAD_LIB_PATHS` is appended to that list.

Each source is walked recursively, sorted by name, and only `.json` and `.mjs` files are read. `presets.json` is skipped. A later source with the same pack id replaces the earlier pack. Two files with the same id inside one source is an error, and so is a pack whose `id` does not match its file name. An invalid pack is skipped and reported once per session.

An entry in `features.aiWriting.packs` is a file or a directory, absolute or relative to the project directory.

## Pack fields

| Field | Type | Required | What it does |
|---|---|---|---|
| `id` | string | yes | Lowercase letters, digits, and hyphens. Must equal the file name without the extension. |
| `feature` | string | yes | `aiWriting` or `emDash`. |
| `category` | string or object | yes | A category id, or an object with `id`, `label`, `description`, and `tags`. |
| `scope` | array | no | Where the pack runs. Defaults to `files`, `comments`, `gh`, `commit`, `reply`. |
| `presets` | array | no | Preset names that turn the pack on. |
| `tags` | array | no | Tags for `tag:<tag>` selection. Falls back to `category.tags`. |
| `options` | object | no | Thresholds handed to `detect` as `ctx.options`. |
| `notes` | string | no | Prose printed under the category in the generated reference. |
| `patterns` | array | yes, unless `detect` is set | Pattern entries. |
| `detect` | function | yes, unless `patterns` is set | `.mjs` packs only. |

Pattern entry fields:

| Field | Type | Required | What it does |
|---|---|---|---|
| `phrase` | string | one of the 3 | A word-bounded phrase. |
| `opening` | string | one of the 3 | A sentence-initial phrase. |
| `regex` | string | one of the 3 | A raw regular expression. |
| `flags` | string | no | Regex flags for a `regex` entry. Defaults to `gi`. |
| `fix` | string | yes | The replacement text printed in the deny message. |
| `tier` | `1` or `2` | no | Defaults to `1`. |
| `show` | string | no | The text the reference renderer prints instead of the expanded pattern. |

A tier-2 pattern reports only when 2 distinct tier-2 patterns land in the same paragraph. A single tier-2 hit stays quiet.

A `regex` entry with a named group `hit` reports only that group as the flagged text.

## The three pattern kinds

| Kind | Entry | Compiled form |
|---|---|---|
| phrase | `{"phrase": "delv(?:e\|es\|ed\|ing)", "fix": "look at"}` | `/\b(?:delv(?:e\|es\|ed\|ing))\b/gi` |
| opening | `{"opening": "ultimately", "fix": "cut"}` | `/(?<=^\|[.!?]\s+)(?:ultimately)/gim` |
| regex | `{"regex": "\\bparadigm\\b(?! shift)", "fix": "model"}` | `/\bparadigm\b(?! shift)/gi` |

Every `'` inside a `phrase` or an `opening` compiles to `['’]`, so the straight and the curly apostrophe both match. The `g` flag is forced on for a `regex` entry.

## scope values and the hook that feeds each

| Scope | Text scanned | Hook |
|---|---|---|
| `files` | A prose file, whole (`md`, `mdx`, `markdown`, `txt`, `rst`, `adoc`, `asciidoc`) | `check-edit.mjs` |
| `comments` | Comment runs in a code file | `check-edit.mjs` |
| `gh` | A `gh pr` or `gh issue` body | `check-bash.mjs` |
| `commit` | A `git commit` message | `check-bash.mjs` |
| `command` | The full `git commit` or `gh` command line | `check-bash.mjs` |
| `reply` | The agent's final reply | `check-reply.mjs` |

Leaving `scope` out gives the pack every scope except `command`.

## presets semantics

A built-in pack lists the presets it belongs to. `"presets": ["all"]` restricts a pack to the `all` preset. The 8 preset names are `default`, `ryan`, `technical`, `ste`, `minimal`, `git`, `statistical`, and `all`, defined in `hooks/lib/patterns/presets.json`.

A pack of your own with no `presets` array is active under every preset. Give a pack `"presets": ["all"]` to keep it off until someone asks for it.

Setting `features.aiWriting.categories` replaces the preset's category list, and only the listed category ids run.

Activation is per category. A pack that reuses a built-in category id joins that category, and the whole category then runs under every preset either one is active in. Give a pack its own `category` block to keep the built-in patterns out.

## excludePacks and options

`features.aiWriting.excludePacks` drops a pack by id, built-in or not:

```json
{
  "features": {
    "aiWriting": {
      "enabled": true,
      "excludePacks": ["ai-identity"],
      "options": { "passive-voice": { "minWords": 400, "maxRatio": 0.5 } }
    }
  }
}
```

`features.aiWriting.options` is keyed by pack id and merged over the pack's own `options`. The merged object arrives as `ctx.options`.

`features.aiWriting.disablePatterns` takes a category id, a pack id, or `tag:<tag>` and drops the whole category. `excludePacks` does not reach `prose/em-dash.json`, because that pack belongs to the `emDash` feature. Turn `features.emDash.enabled` off instead.

## A JSON pack

Save this as `.claude/concise/patterns/team-words.json`:

```json
{
  "id": "team-words",
  "feature": "aiWriting",
  "category": {
    "id": "team-words",
    "label": "team words",
    "description": "Words this team replaced with a plain word.",
    "tags": ["phrase"]
  },
  "scope": ["files", "comments", "gh", "commit", "reply"],
  "presets": ["default", "ryan", "technical", "all"],
  "notes": "Added by the platform team.",
  "patterns": [
    { "phrase": "utili[sz](?:e|es|ed|ing)", "fix": "use" },
    { "opening": "as a reminder", "fix": "cut" },
    { "regex": "\\bsynerg(?:y|ies|istic)\\b", "fix": "name the shared part" }
  ]
}
```

## An .mjs pack

Save this as `.claude/concise/patterns/long-sentences.mjs`:

```js
export default {
  id: "long-sentences",
  feature: "aiWriting",
  category: {
    id: "long-sentences",
    label: "long sentences",
    description: "Flags a sentence past the word limit.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["ryan", "statistical", "all"],
  options: { minWords: 100, maxSentenceWords: 40 },
  notes: "One finding per sentence over the limit.",
  detect(text, ctx) {
    const o = ctx.options;
    if (ctx.stats.words().length < o.minWords) return [];
    return ctx.stats
      .sentences()
      .filter((s) => s.text.split(/\s+/).filter(Boolean).length > o.maxSentenceWords)
      .map((s) => ({
        index: s.start,
        match: `sentence of ${s.text.split(/\s+/).filter(Boolean).length} words (max ${o.maxSentenceWords})`,
        fix: "split the sentence",
      }));
  },
};
```

`detect(text, ctx)` returns an array of `{ index, match, fix }` findings. `index` is a character offset into `text` and has to be an integer. `match` is the flagged text printed in the deny message. `fix` defaults to `rewrite`. A finding with a missing `index` or `match` is dropped. A `detect` that throws is reported as a pack problem and the rest of the scan continues.

`ctx` holds:

| Key | Value |
|---|---|
| `ctx.path` | The file path, or `null` for a reply, commit message, `gh` body, or command. |
| `ctx.scope` | The scope name the text came from. |
| `ctx.options` | The pack's `options`, merged with `features.aiWriting.options.<packId>`. |
| `ctx.stats.text` | The text being scanned. |
| `ctx.stats.words()` | `{ text, start, end }` per word. |
| `ctx.stats.sentences()` | `{ text, start, end }` per sentence. |
| `ctx.stats.paragraphs()` | `{ text, start, end }` per paragraph. |
| `ctx.stats.lines()` | `{ text, start, end }` per line. |
| `ctx.stats.listBlocks()` | `{ start, end, items }` per list block, `items` holding `{ text, start, end, marker }`. |
| `ctx.stats.headings()` | `{ text, start, end, level, title }` per markdown heading. |
| `ctx.stats.syllables(word)` | The syllable count for one word. |

Each `ctx.stats` helper is memoized per scan.

## Validate and render

```sh
node plugins/concise/scripts/validate-packs.mjs
node plugins/concise/scripts/validate-packs.mjs .claude/concise/patterns
```

The validator checks the built-in packs plus any paths you pass, prints `ok: <N> packs, <M> patterns`, and exits 1 on a problem.

```sh
node plugins/concise/scripts/render-patterns.mjs
node plugins/concise/scripts/render-patterns.mjs --check
```

The renderer regenerates the reference tables under `skills/concise-rules/references/` from the packs. `--check` exits 1 when the committed files are stale and prints the command to run.
